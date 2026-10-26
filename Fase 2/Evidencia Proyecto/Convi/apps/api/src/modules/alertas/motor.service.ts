import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  COLUMNA_AMBITO,
  guardarAlerta,
  registrarEjecucion,
  situacionesQueCuentan,
} from './alerta.js';
import {
  type AmbitoConteo,
  claveEvento,
  DIAS_HACIA_ATRAS,
  diaDeNumero,
  evaluarRecurrencia,
  explicacion,
  numeroDeDia,
  OPERADORES_AL_GUARDAR,
  type Operador,
  textoAviso,
} from './motor.js';

// PB-090 (HU-079): evaluación de las reglas de cantidad después de guardar
// una situación, para el estudiante, el curso y la escuela involucrados (CA4).
// Todo corre con la identidad técnica del motor (CA5): solo lee fechas,
// categorías, cursos y estados, y solo crea alertas, avisos y el registro de
// su ejecución. Las situaciones descartadas no cuentan (decisión del PO).

type Regla = {
  id: string;
  codigo_regla: string;
  numero_version: number;
  nombre: string;
  codigo_ambito: AmbitoConteo;
  codigo_operador: Operador;
  umbral: number;
  ventana_dias: number;
  categoria_id: string | null;
  codigo_accion: 'ALERTA' | 'ALERTA_Y_NOTIFICACION';
  codigo_prioridad: string;
  vigente_desde: string | null;
};

export type ResultadoEvaluacion = {
  reglas_evaluadas: number;
  evaluaciones: number;
  alertas_generadas: number;
  avisos_creados: number;
};

@Injectable()
export class MotorReglasService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  /**
   * Evalúa las reglas de cantidad activas que puede afectar la situación.
   * Devuelve null si la escuela no está activa. Si algo falla, la transacción
   * se deshace y quien llama reintenta (CA8): la situación ya quedó guardada.
   */
  evaluarSituacion(
    establecimientoId: string,
    situacionId: string,
  ): Promise<ResultadoEvaluacion | null> {
    return this.cuentas.operarMotor(establecimientoId, (db) =>
      this.evaluar(db, situacionId),
    );
  }

  private async evaluar(
    db: PoolClient,
    situacionId: string,
  ): Promise<ResultadoEvaluacion> {
    const resultado: ResultadoEvaluacion = {
      reglas_evaluadas: 0,
      evaluaciones: 0,
      alertas_generadas: 0,
      avisos_creados: 0,
    };
    const situacion = (
      await db.query<{ categoria_id: string | null }>(
        'SELECT categoria_id FROM convi.situaciones WHERE id = $1',
        [situacionId],
      )
    ).rows[0];

    if (situacion) {
      // CA4: el estudiante, el curso y la escuela involucrados.
      const involucrados = await this.involucrados(db, situacionId);
      const { hoy } = (
        await db.query<{ hoy: string }>('SELECT current_date::text AS hoy')
      ).rows[0];
      const reglas = await this.reglasActivas(db, situacion.categoria_id);
      resultado.reglas_evaluadas = reglas.length;

      for (const regla of reglas) {
        const registros =
          regla.codigo_ambito === 'ESTABLECIMIENTO'
            ? [null]
            : regla.codigo_ambito === 'ESTUDIANTE'
              ? involucrados.estudiantes
              : involucrados.cursos;
        for (const registroId of registros) {
          resultado.evaluaciones++;
          const avisos = await this.evaluarRegla(db, {
            regla,
            registroId,
            hoy,
            situacionId,
          });
          if (avisos !== null) {
            resultado.alertas_generadas++;
            resultado.avisos_creados += avisos;
          }
        }
      }
    }

    // Cada ejecución queda registrada con sus cantidades, sin datos personales.
    await registrarEjecucion(
      db,
      { tipo: 'situaciones', id: situacionId },
      resultado,
    );
    return resultado;
  }

  /** Estudiantes que participan en la situación y cursos donde ocurrió. */
  private async involucrados(db: PoolClient, situacionId: string) {
    const filas = await db.query<{ estudiantes: string[]; cursos: string[] }>(
      `SELECT
         ARRAY(SELECT DISTINCT e.id FROM convi.participaciones p
               JOIN convi.estudiantes e ON e.persona_id = p.persona_id
               WHERE p.situacion_id = $1 ORDER BY e.id) AS estudiantes,
         ARRAY(SELECT c FROM (
                 SELECT s.curso_contexto_id AS c FROM convi.situaciones s
                 WHERE s.id = $1 AND s.curso_contexto_id IS NOT NULL
                 UNION
                 SELECT m.curso_id FROM convi.participaciones p
                 JOIN convi.matriculas m ON m.id = p.matricula_contexto_id
                 WHERE p.situacion_id = $1) x
               ORDER BY c) AS cursos`,
      [situacionId],
    );
    return filas.rows[0];
  }

  /**
   * CA1: solo las reglas activas y vigentes hoy, de recurrencia, que cuentan
   * todas las categorías o la de esta situación. Una regla de otra categoría
   * no cambia su conteo con esta situación.
   */
  private async reglasActivas(
    db: PoolClient,
    categoriaId: string | null,
  ): Promise<Regla[]> {
    const filas = await db.query<Regla>(
      `SELECT id, codigo_regla, numero_version, nombre, codigo_ambito,
              codigo_operador, valor_umbral::float8 AS umbral, ventana_dias,
              categoria_id, codigo_accion, codigo_prioridad,
              vigente_desde::text AS vigente_desde
       FROM convi.reglas
       WHERE estado = 'ACTIVO' AND tipo_regla = 'RECURRENCIA'
         AND codigo_ambito IN ('ESTUDIANTE', 'CURSO', 'ESTABLECIMIENTO')
         AND codigo_operador = ANY($1::text[])
         AND ventana_dias >= 1 AND valor_umbral IS NOT NULL
         AND (vigente_desde IS NULL OR vigente_desde <= current_date)
         AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
         AND (categoria_id IS NULL OR categoria_id IS NOT DISTINCT FROM $2::uuid)
       ORDER BY codigo_regla, numero_version`,
      [OPERADORES_AL_GUARDAR, categoriaId],
    );
    return filas.rows;
  }

  /**
   * Evalúa una regla para un registro. Devuelve null si no genera una alerta
   * nueva, o la cantidad de avisos que creó junto con la alerta.
   */
  private async evaluarRegla(
    db: PoolClient,
    datos: {
      regla: Regla;
      registroId: string | null;
      hoy: string;
      situacionId: string;
    },
  ): Promise<number | null> {
    const { regla, registroId, hoy } = datos;
    const ambito = regla.codigo_ambito;
    // La racha se busca desde la vigencia de la regla, como máximo un año atrás.
    const haceUnAnio = diaDeNumero(numeroDeDia(hoy) - DIAS_HACIA_ATRAS);
    const inicio =
      regla.vigente_desde && regla.vigente_desde > haceUnAnio
        ? regla.vigente_desde
        : haceUnAnio;
    const primerDia = diaDeNumero(
      Math.min(numeroDeDia(inicio), numeroDeDia(hoy)) - regla.ventana_dias + 1,
    );

    // CA6: todas las situaciones del período, aunque estén en otra alerta.
    const condiciones = situacionesQueCuentan(ambito);
    const porDia = await db.query<{ dia: string; n: number }>(
      `SELECT s.ocurrido_en::date::text AS dia, count(*)::int AS n
       FROM convi.situaciones s
       WHERE ${condiciones}
       GROUP BY 1`,
      [registroId, regla.categoria_id, primerDia, hoy],
    );
    const cumplida = evaluarRecurrencia({
      porDia: new Map(porDia.rows.map((f) => [f.dia, f.n])),
      hoy,
      ventanaDias: regla.ventana_dias,
      operador: regla.codigo_operador,
      umbral: regla.umbral,
      inicio,
    });
    if (!cumplida) return null;

    // CA6: mientras siga la misma racha no se genera otra alerta.
    const columna = COLUMNA_AMBITO[ambito];
    const anterior = await db.query(
      `SELECT 1 FROM convi.alertas
       WHERE regla_id = $1
         AND ${columna ? `${columna} = $2` : '$2::uuid IS NULL'}
         AND generada_en >= $3::date::timestamptz
       LIMIT 1`,
      [regla.id, registroId, cumplida.cumpleDesde],
    );
    if (anterior.rows.length > 0) return null;

    // CA2 y CA3: la alerta apunta al registro de su ámbito y guarda la explicación.
    const clave = claveEvento({
      codigoRegla: regla.codigo_regla,
      version: regla.numero_version,
      ambito,
      registroId,
      cumpleDesde: cumplida.cumpleDesde,
    });
    // CA3 y CA7: la explicación, las situaciones de la ventana de hoy y, con
    // «registrar y avisar», un aviso para cada cuenta activa de Convivencia.
    return guardarAlerta(db, {
      regla,
      ambito,
      registroId,
      clave,
      explicacion: explicacion({
        ambito,
        categoriaId: regla.categoria_id,
        ventanaDias: regla.ventana_dias,
        operador: regla.codigo_operador,
        umbral: regla.umbral,
        resultado: cumplida,
        situacionId: datos.situacionId,
      }),
      situaciones: {
        categoriaId: regla.categoria_id,
        desde: cumplida.desde,
        hasta: hoy,
      },
      aviso: textoAviso({
        codigoRegla: regla.codigo_regla,
        nombre: regla.nombre,
        prioridad: regla.codigo_prioridad,
        ambito,
        ventanaDias: regla.ventana_dias,
        operador: regla.codigo_operador,
        umbral: regla.umbral,
        conteo: cumplida.conteo,
      }),
    });
  }
}
