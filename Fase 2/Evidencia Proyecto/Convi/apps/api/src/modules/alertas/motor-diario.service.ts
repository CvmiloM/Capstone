import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { CuentaService } from '../../database/cuenta.service.js';
import { COLUMNA_AMBITO, guardarAlerta, registrarEjecucion } from './alerta.js';
import {
  type AmbitoConteo,
  claveEvento,
  cumple,
  DIAS_HACIA_ATRAS,
  diaDeNumero,
  evaluarVariacion,
  explicacionVariacion,
  explicacionVencidos,
  numeroDeDia,
  type Operador,
  textoAvisoVariacion,
  textoAvisoVencidos,
  type Vencido,
  yaAvisado,
} from './motor.js';

// PB-091 y PB-092 (HU-079 CA4): una vez al día se evalúan las reglas de
// vencimientos de cada caso y las de variación entre dos períodos. Corre con
// la identidad técnica del motor (CA5), una escuela por transacción, y solo
// lee estados, fechas, categorías y cursos.

type ReglaDiaria = {
  id: string;
  codigo_regla: string;
  numero_version: number;
  nombre: string;
  tipo_regla: 'FECHA_LIMITE' | 'PLAZO_PROTOCOLO' | 'VARIACION_PERIODO';
  codigo_ambito: AmbitoConteo | 'CASO';
  codigo_operador: Operador;
  umbral: number;
  ventana_dias: number | null;
  categoria_id: string | null;
  codigo_accion: 'ALERTA' | 'ALERTA_Y_NOTIFICACION';
  codigo_prioridad: string;
  vigente_desde: string | null;
};

export type ResultadoDiario = {
  evaluacion: 'DIARIA';
  dia: string;
  reglas_evaluadas: number;
  evaluaciones: number;
  alertas_generadas: number;
  avisos_creados: number;
};

/**
 * Decisión del PO: la fecha límite cuenta compromisos, acciones de un plan
 * activo y seguimientos programados, y el plazo de protocolo cuenta pasos de
 * un protocolo activo. Algo vence si está marcado Vencido, o si sigue
 * pendiente o en progreso y su fecha pasó antes de que empezara hoy. Los
 * casos cerrados no cuentan.
 */
const VENCIDOS: Record<'FECHA_LIMITE' | 'PLAZO_PROTOCOLO', string> = {
  FECHA_LIMITE: `
    SELECT k.caso_id, 'compromisos' AS tipo, k.id
    FROM convi.compromisos k
    WHERE k.estado = 'VENCIDO'
       OR (k.estado IN ('PENDIENTE', 'EN_PROGRESO') AND k.vence_en < current_date::timestamptz)
    UNION ALL
    SELECT p.caso_id, 'acciones_plan_intervencion', a.id
    FROM convi.acciones_plan_intervencion a
    JOIN convi.planes_intervencion p ON p.id = a.plan_intervencion_id
    WHERE p.estado = 'ACTIVO'
      AND (a.estado = 'VENCIDO'
        OR (a.estado IN ('PENDIENTE', 'EN_PROGRESO') AND a.vence_en < current_date::timestamptz))
    UNION ALL
    SELECT t.caso_id, 'actuaciones', t.id
    FROM convi.actuaciones t
    WHERE t.tipo_actuacion = 'SEGUIMIENTO' AND t.estado IN ('PLANIFICADA', 'POSPUESTA')
      AND t.programado_en < current_date::timestamptz`,
  PLAZO_PROTOCOLO: `
    SELECT pc.caso_id, 'estados_pasos_protocolo_caso' AS tipo, ep.id
    FROM convi.estados_pasos_protocolo_caso ep
    JOIN convi.protocolos_caso pc ON pc.id = ep.protocolo_caso_id
    WHERE pc.estado = 'ACTIVO'
      AND (ep.estado = 'VENCIDO'
        OR (ep.estado IN ('PENDIENTE', 'EN_PROGRESO') AND ep.vence_en < current_date::timestamptz))`,
};

/**
 * Situaciones que cuentan por registro del ámbito y por día, sin las
 * descartadas. $1 = categoría o null, $2 y $3 = primer y último día.
 */
const POR_DIA: Record<AmbitoConteo, string> = {
  ESTUDIANTE: `
    SELECT e.id AS registro, s.ocurrido_en::date::text AS dia, count(DISTINCT s.id)::int AS n
    FROM convi.situaciones s
    JOIN convi.participaciones p ON p.situacion_id = s.id
    JOIN convi.estudiantes e ON e.persona_id = p.persona_id
    WHERE CONDICIONES
    GROUP BY 1, 2`,
  CURSO: `
    SELECT x.curso AS registro, x.dia, count(DISTINCT x.id)::int AS n
    FROM (
      SELECT s.id, s.ocurrido_en::date::text AS dia, s.curso_contexto_id AS curso
      FROM convi.situaciones s
      WHERE CONDICIONES AND s.curso_contexto_id IS NOT NULL
      UNION
      SELECT s.id, s.ocurrido_en::date::text, m.curso_id
      FROM convi.situaciones s
      JOIN convi.participaciones p ON p.situacion_id = s.id
      JOIN convi.matriculas m ON m.id = p.matricula_contexto_id
      WHERE CONDICIONES
    ) x
    GROUP BY 1, 2`,
  ESTABLECIMIENTO: `
    SELECT NULL::uuid AS registro, s.ocurrido_en::date::text AS dia, count(*)::int AS n
    FROM convi.situaciones s
    WHERE CONDICIONES
    GROUP BY 2`,
};

const CONDICIONES = `s.estado <> 'DESCARTADA'
      AND ($1::uuid IS NULL OR s.categoria_id = $1)
      AND s.ocurrido_en >= $2::date::timestamptz
      AND s.ocurrido_en < ($3::date + 1)::timestamptz`;

@Injectable()
export class MotorDiarioService {
  private readonly logger = new Logger(MotorDiarioService.name);

  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  /**
   * Evalúa todas las escuelas activas con reglas diarias. Una escuela que
   * falla no detiene a las demás; al final se lanza el error para que la cola
   * reintente, y lo ya generado no se repite gracias a la clave de cada alerta.
   */
  async evaluarTodas(): Promise<number> {
    const escuelas = await this.cuentas.escuelasConReglasDiarias();
    let fallidas = 0;
    for (const escuela of escuelas) {
      try {
        await this.evaluarEscuela(escuela);
      } catch {
        // Sin el detalle del error: puede traer datos de la base.
        fallidas++;
      }
    }
    if (fallidas > 0) {
      this.logger.error(
        `La evaluación diaria de reglas falló en ${fallidas} de ${escuelas.length} escuelas.`,
      );
      throw new Error('Falló la evaluación diaria de algunas escuelas.');
    }
    return escuelas.length;
  }

  /** Evalúa una escuela. Devuelve null si la escuela no está activa. */
  evaluarEscuela(establecimientoId: string): Promise<ResultadoDiario | null> {
    return this.cuentas.operarMotor(establecimientoId, (db) =>
      this.evaluar(db, establecimientoId),
    );
  }

  private async evaluar(
    db: PoolClient,
    establecimientoId: string,
  ): Promise<ResultadoDiario> {
    const { hoy, ayer } = (
      await db.query<{ hoy: string; ayer: string }>(
        `SELECT current_date::text AS hoy, (current_date - 1)::text AS ayer`,
      )
    ).rows[0];
    const resultado: ResultadoDiario = {
      evaluacion: 'DIARIA',
      dia: hoy,
      reglas_evaluadas: 0,
      evaluaciones: 0,
      alertas_generadas: 0,
      avisos_creados: 0,
    };
    const sumar = (avisos: number | null) => {
      if (avisos === null) return;
      resultado.alertas_generadas++;
      resultado.avisos_creados += avisos;
    };

    const reglas = await this.reglasDiarias(db);
    resultado.reglas_evaluadas = reglas.length;
    const vencidosPorTipo = new Map<string, Map<string, Vencido[]>>();

    for (const regla of reglas) {
      if (regla.tipo_regla === 'VARIACION_PERIODO') {
        for (const avisos of await this.evaluarVariacion(db, regla, ayer)) {
          resultado.evaluaciones++;
          sumar(avisos);
        }
        continue;
      }
      // Los vencimientos de cada tipo se consultan una sola vez por día.
      if (!vencidosPorTipo.has(regla.tipo_regla))
        vencidosPorTipo.set(
          regla.tipo_regla,
          await this.vencidosPorCaso(db, regla.tipo_regla),
        );
      for (const [casoId, vencidos] of vencidosPorTipo.get(regla.tipo_regla)!) {
        resultado.evaluaciones++;
        sumar(
          await this.evaluarVencidos(db, {
            regla,
            casoId,
            vencidos,
            hoy,
            ayer,
          }),
        );
      }
    }

    await registrarEjecucion(
      db,
      { tipo: 'establecimientos', id: establecimientoId },
      resultado,
    );
    return resultado;
  }

  /** CA1: las reglas diarias activas y vigentes hoy, con los datos que su tipo exige. */
  private async reglasDiarias(db: PoolClient): Promise<ReglaDiaria[]> {
    const filas = await db.query<ReglaDiaria>(
      `SELECT id, codigo_regla, numero_version, nombre, tipo_regla,
              codigo_ambito, codigo_operador, valor_umbral::float8 AS umbral,
              ventana_dias, categoria_id, codigo_accion, codigo_prioridad,
              vigente_desde::text AS vigente_desde
       FROM convi.reglas
       WHERE estado = 'ACTIVO'
         AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL
         AND (vigente_desde IS NULL OR vigente_desde <= current_date)
         AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
         AND ((tipo_regla IN ('FECHA_LIMITE', 'PLAZO_PROTOCOLO') AND codigo_ambito = 'CASO')
           OR (tipo_regla = 'VARIACION_PERIODO' AND ventana_dias >= 1
               AND codigo_ambito IN ('ESTUDIANTE', 'CURSO', 'ESTABLECIMIENTO')))
       ORDER BY codigo_regla, numero_version`,
    );
    return filas.rows;
  }

  /** Lo vencido de cada caso abierto, solo los casos que tienen algo vencido. */
  private async vencidosPorCaso(
    db: PoolClient,
    tipo: 'FECHA_LIMITE' | 'PLAZO_PROTOCOLO',
  ): Promise<Map<string, Vencido[]>> {
    const filas = await db.query<Vencido & { caso_id: string }>(
      `SELECT v.caso_id, v.tipo, v.id
       FROM (${VENCIDOS[tipo]}) v
       JOIN convi.casos c ON c.id = v.caso_id
       WHERE c.estado_actual <> 'CERRADO'
       ORDER BY v.caso_id, v.tipo, v.id`,
    );
    const porCaso = new Map<string, Vencido[]>();
    for (const { caso_id, tipo: t, id } of filas.rows)
      porCaso.set(caso_id, [...(porCaso.get(caso_id) ?? []), { tipo: t, id }]);
    return porCaso;
  }

  /**
   * PB-091: un caso con algo vencido cumple la regla si la cantidad cumple la
   * condición. Un caso sin nada vencido nunca genera alerta. Devuelve null si
   * no genera una alerta nueva.
   */
  private async evaluarVencidos(
    db: PoolClient,
    datos: {
      regla: ReglaDiaria;
      casoId: string;
      vencidos: Vencido[];
      hoy: string;
      ayer: string;
    },
  ): Promise<number | null> {
    const { regla, casoId, vencidos } = datos;
    const tipoRegla = regla.tipo_regla as 'FECHA_LIMITE' | 'PLAZO_PROTOCOLO';
    if (!cumple(vencidos.length, regla.codigo_operador, regla.umbral))
      return null;

    // CA6: no se repite mientras siga vencido algo de lo que ya avisó.
    const anteriores = await db.query<{ vencidos: Vencido[] | null }>(
      `SELECT datos_explicacion->'vencidos' AS vencidos
       FROM convi.alertas WHERE regla_id = $1 AND caso_id = $2`,
      [regla.id, casoId],
    );
    if (
      yaAvisado(
        vencidos,
        anteriores.rows.map((f) => f.vencidos ?? []),
      )
    )
      return null;

    return guardarAlerta(db, {
      regla,
      ambito: 'CASO',
      registroId: casoId,
      clave: claveEvento({
        codigoRegla: regla.codigo_regla,
        version: regla.numero_version,
        ambito: 'CASO',
        registroId: casoId,
        cumpleDesde: datos.hoy,
      }),
      explicacion: explicacionVencidos({
        tipoRegla,
        alCierreDe: datos.ayer,
        operador: regla.codigo_operador,
        umbral: regla.umbral,
        vencidos,
      }),
      aviso: textoAvisoVencidos({
        tipoRegla,
        codigoRegla: regla.codigo_regla,
        nombre: regla.nombre,
        prioridad: regla.codigo_prioridad,
        operador: regla.codigo_operador,
        umbral: regla.umbral,
        conteo: vencidos.length,
      }),
    });
  }

  /**
   * PB-092: evalúa la variación de cada registro del ámbito con situaciones
   * en los dos períodos. Devuelve, por cada registro evaluado, la cantidad
   * de avisos de su alerta nueva o null si no generó una.
   */
  private async evaluarVariacion(
    db: PoolClient,
    regla: ReglaDiaria,
    ayer: string,
  ): Promise<(number | null)[]> {
    const ambito = regla.codigo_ambito as AmbitoConteo;
    const ventana = regla.ventana_dias!;
    // La racha se busca desde la vigencia de la regla, como máximo un año atrás.
    const haceUnAnio = diaDeNumero(numeroDeDia(ayer) - DIAS_HACIA_ATRAS);
    const inicio =
      regla.vigente_desde && regla.vigente_desde > haceUnAnio
        ? regla.vigente_desde
        : haceUnAnio;
    if (inicio > ayer) return [];
    const primerDia = diaDeNumero(numeroDeDia(inicio) - 2 * ventana + 1);

    const filas = await db.query<{
      registro: string | null;
      dia: string;
      n: number;
    }>(POR_DIA[ambito].replaceAll('CONDICIONES', CONDICIONES), [
      regla.categoria_id,
      primerDia,
      ayer,
    ]);
    const porRegistro = new Map<string | null, Map<string, number>>();
    for (const { registro, dia, n } of filas.rows) {
      if (!porRegistro.has(registro)) porRegistro.set(registro, new Map());
      porRegistro.get(registro)!.set(dia, n);
    }

    const resultados: (number | null)[] = [];
    for (const [registroId, porDia] of porRegistro) {
      const cumplida = evaluarVariacion({
        porDia,
        ayer,
        ventanaDias: ventana,
        operador: regla.codigo_operador,
        umbral: regla.umbral,
        inicio,
      });
      if (!cumplida) {
        resultados.push(null);
        continue;
      }

      // CA6: mientras siga la misma racha no se genera otra alerta. La
      // ventana que cierra un día se evalúa al día siguiente.
      const columna = COLUMNA_AMBITO[ambito];
      const anterior = await db.query(
        `SELECT 1 FROM convi.alertas
         WHERE regla_id = $1
           AND ${columna ? `${columna} = $2` : '$2::uuid IS NULL'}
           AND generada_en >= ($3::date + 1)::timestamptz
         LIMIT 1`,
        [regla.id, registroId, cumplida.cumpleDesde],
      );
      if (anterior.rows.length > 0) {
        resultados.push(null);
        continue;
      }

      resultados.push(
        await guardarAlerta(db, {
          regla,
          ambito,
          registroId,
          clave: claveEvento({
            codigoRegla: regla.codigo_regla,
            version: regla.numero_version,
            ambito,
            registroId,
            cumpleDesde: cumplida.cumpleDesde,
          }),
          explicacion: explicacionVariacion({
            ambito,
            categoriaId: regla.categoria_id,
            ventanaDias: ventana,
            operador: regla.codigo_operador,
            umbral: regla.umbral,
            resultado: cumplida,
          }),
          // CA3: las situaciones del período que se acaba de cerrar.
          situaciones: {
            categoriaId: regla.categoria_id,
            desde: cumplida.periodoActual.desde,
            hasta: cumplida.periodoActual.hasta,
          },
          aviso: textoAvisoVariacion({
            codigoRegla: regla.codigo_regla,
            nombre: regla.nombre,
            prioridad: regla.codigo_prioridad,
            ambito,
            ventanaDias: ventana,
            operador: regla.codigo_operador,
            umbral: regla.umbral,
            resultado: cumplida,
          }),
        }),
      );
    }
    return resultados;
  }
}
