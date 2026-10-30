import { compromisosDelCaso, seguimientosDelCaso } from './seguimientos.js';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  casosRelacionados,
  HOY_ESCUELA,
  validarNuevoCaso,
  type NuevoCaso,
} from './caso-nuevo.js';
import { ultimaRevision } from './decision-situacion.js';
import {
  esReconsiderable,
  leerMotivoReconsideracion,
  prefijoReconsideracion,
} from './reconsideracion.js';
import {
  actasDelCaso,
  estadosPermitidos,
  hayPendientes,
  movimientosDelCaso,
  pendientesDelCaso,
  ultimoMovimiento,
  validarCambioEstado,
  validarCierre,
  type ActaCaso,
  type MovimientoEstado,
  type PendientesCaso,
} from './estado-caso.js';
import {
  evidenciasDelCaso,
  type EvidenciaRegistrada,
} from './evidencias.service.js';
import {
  crearPasosDelCaso,
  insertarRevisionNormativaDelCaso,
  PROTOCOLOS_APLICABLES,
  protocolosAplicables,
  protocolosDelCaso,
  revisionesNormativasDelCaso,
  validarAplicacion,
  type ProtocoloAplicado,
} from './protocolo-caso.js';
import {
  planesDelCaso,
  responsablesDeAccion,
  type PlanIntervencion,
} from './plan-intervencion.js';
import {
  accionesParaEncuentro,
  asistentesPosibles,
  encuentrosDelCaso,
  responsablesDeEncuentro,
  type AsistentePosible,
  type Encuentro,
} from './encuentros.js';
import {
  comprobarNormativaVigente,
  opcionesNormativa,
  validarRevisionNormativa,
  type OpcionesNormativa,
  type RevisionNormativa,
} from './revision-normativa.js';
import { cargadorDeSeccion, type SeccionCaso } from './seccion-caso.js';
import { validarVinculacion } from './vinculacion-caso.js';

// PB-053 (HU-046): casos de convivencia. Solo Convivencia los abre y los ve;
// la seguridad por fila separa por escuela y CuentaService.operar exige el
// segundo factor. PB-052 (HU-045): una situación también se suma a un caso
// existente. PB-152 (HU-131) y PB-054 (HU-047): cambio de estado y cierre.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

/** Tope de filas de la lista de casos. */
export const MAXIMO_CASOS = 200;

const NO_EXISTE = 'El caso no existe.';
const NO_EXISTE_SITUACION = 'La situación no existe.';
const DECISION_DESACTUALIZADA =
  'Otra persona registró una revisión o una decisión mientras mirabas la situación. Recarga la página para verla antes de continuar.';
const CASO_SIMULTANEO =
  'Se abrió otro caso al mismo tiempo. Envía el formulario nuevamente.';
const CASO_DESACTUALIZADO =
  'Otra persona cambió el estado del caso mientras lo mirabas. Recarga la página para verlo antes de continuar.';
const INTENTOS_CASO = 5;

export type CasoLista = {
  id: string;
  codigo: string;
  titulo: string;
  estado_actual: string;
  fecha_inicio: string;
  fecha_limite_cierre: string | null;
  categoria: string | null;
  responsable: string;
  situaciones: number;
  estudiantes: number;
  nombres_estudiantes: string[];
};

export type DetalleCaso = CasoLista & {
  resumen: string;
  abierto_por: string;
  abierto_en: Date;
  plazo_cierre_dias_aplicado: number | null;
  justificacion_independiente: string | null;
  registro_historico: boolean;
  participantes: {
    estudiante_id: string | null;
    nombres: string;
    apellidos: string;
    codigo_estudiante: string | null;
    rol: string;
    /** Curso y año de la matrícula guardada al pasar al caso (HU-066). */
    curso_matricula: string | null;
    curso_actual: string | null;
    rut: string | null;
  }[];
  situaciones_vinculadas: {
    id: string;
    codigo: string;
    categoria: string | null;
    ocurrido_en: Date;
    vinculado_a_caso_en: Date;
    /** HU-045 CA2: quién la vinculó y con qué fundamento. */
    vinculado_por: string;
    fundamento_vinculacion: string | null;
  }[];
  cerrado_en: Date | null;
  /** HU-131 CA1: historial de estados, del más antiguo al más reciente. */
  movimientos: MovimientoEstado[];
  /** HU-131 CA3: el último movimiento que se ve; cambiar sobre otro se rechaza. */
  ultimo_movimiento_id: string | null;
  /** HU-131 CA5: estados intermedios a los que puede pasar ahora. */
  estados_permitidos: string[];
  puede_cerrar: boolean;
  /** HU-047 CA2: tareas sin terminar que obligan a justificar el cierre. */
  pendientes: PendientesCaso;
  /** HU-047 CA1: actas del caso que se pueden adjuntar al cierre. */
  actas_cierre: ActaCaso[];
  /** PB-066: evidencias del caso y de sus situaciones vinculadas. */
  evidencias: EvidenciaRegistrada[];
  /** PB-082 (HU-071 CA1): protocolos aplicados con sus pasos. */
  protocolos_aplicados: ProtocoloAplicado[];
  /** Versiones publicadas y vigentes que se pueden aplicar hoy. */
  protocolos_aplicables: { id: string; nombre: string; pasos: number }[];
  /** HU-071 CA2 y CA3: revisiones del caso sin protocolo. */
  revisiones_normativas: RevisionNormativa[];
  opciones_normativa: OpcionesNormativa;
  /** PB-061 y PB-062 (HU-054): planes de intervención con sus acciones. */
  planes_intervencion: PlanIntervencion[];
  /** Personas que pueden ser responsables de una acción del plan. */
  responsables_accion: { id: string; nombre: string; perfiles: string[] }[];
  /** AAAA-MM-DD en la zona horaria de la escuela, para los días del plan. */
  hoy: string;
  /** AAAA-MM-DDTHH:MM en la hora de la escuela, tope de las fechas reales. */
  ahora: string;
  /** PB-063 y PB-064 (HU-055): encuentros del caso con sus asistentes. */
  compromisos: Awaited<ReturnType<typeof compromisosDelCaso>>;
  seguimientos: Awaited<ReturnType<typeof seguimientosDelCaso>>;
  actuaciones_origen: { id: string; objetivo: string }[];
  encuentros: Encuentro[];
  opciones_encuentro: {
    responsables: { id: string; nombre: string }[];
    asistentes: AsistentePosible[];
    acciones_plan: { id: string; descripcion: string }[];
  };
};

// 40001: otra transacción cambió la fila bloqueada; 23505 en el código: otro
// caso tomó el mismo número correlativo al mismo tiempo (como en PB-042).
function esChoque(error: unknown) {
  const { code, constraint } = (error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  return (
    code === '40001' ||
    (code === '23505' && constraint === 'casos_establecimiento_id_codigo_key')
  );
}

const COLUMNAS_LISTA = `
  c.id, c.codigo, c.titulo, c.estado_actual, c.fecha_inicio::text AS fecha_inicio,
  c.fecha_limite_cierre::text AS fecha_limite_cierre,
  ARRAY(SELECT DISTINCT p.nombres || ' ' || p.apellidos
    FROM convi.participaciones pa JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    JOIN convi.personas p ON p.id = pa.persona_id
    WHERE pa.caso_id = c.id AND pa.activo_hasta IS NULL ORDER BY 1) AS nombres_estudiantes,
  cat.nombre AS categoria, pr.nombres || ' ' || pr.apellidos AS responsable,
  (SELECT count(*) FROM convi.situaciones s WHERE s.caso_id = c.id)::int AS situaciones,
  (SELECT count(*) FROM convi.participaciones pa
    JOIN convi.estudiantes e ON e.persona_id = pa.persona_id
    WHERE pa.caso_id = c.id AND pa.activo_hasta IS NULL)::int AS estudiantes`;

const DESDE_LISTA = `
  FROM convi.casos c
  JOIN convi.membresias_establecimiento mr ON mr.id = c.asignado_a_membresia_id
  JOIN convi.personas pr ON pr.id = mr.persona_id
  LEFT JOIN convi.categorias_convivencia cat ON cat.id = c.categoria_principal_id`;

@Injectable()
export class CasosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Los casos abiertos primero (no cerrados), luego por fecha de inicio.
  listar(sesion: Sesion): Promise<{ casos: CasoLista[]; limite: number }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const casos = await db.query<CasoLista>(
          `SELECT ${COLUMNAS_LISTA}
           ${DESDE_LISTA}
           ORDER BY c.estado_actual = 'CERRADO', c.fecha_inicio DESC, c.codigo DESC
           LIMIT $1`,
          [MAXIMO_CASOS],
        );
        return { casos: casos.rows, limite: MAXIMO_CASOS };
      },
    );
  }

  // Con sección, solo se consulta lo que muestra esa pestaña de la ficha y el
  // resto va vacío (seccion-caso.ts); sin sección se devuelve todo.
  detalle(
    sesion: Sesion,
    id: string,
    seccion?: SeccionCaso,
  ): Promise<DetalleCaso> {
    const cargar = cargadorDeSeccion(seccion);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const base = await db.query<
          Pick<DetalleCaso, keyof CasoLista> &
            Pick<
              DetalleCaso,
              | 'resumen'
              | 'abierto_por'
              | 'abierto_en'
              | 'plazo_cierre_dias_aplicado'
              | 'justificacion_independiente'
              | 'registro_historico'
              | 'cerrado_en'
            >
        >(
          `SELECT ${COLUMNAS_LISTA}, c.resumen, c.abierto_en,
                  pa.nombres || ' ' || pa.apellidos AS abierto_por,
                  c.plazo_cierre_dias_aplicado, c.justificacion_independiente,
                  c.registro_historico, c.cerrado_en
           ${DESDE_LISTA}
           JOIN convi.membresias_establecimiento ma ON ma.id = c.abierto_por
           JOIN convi.personas pa ON pa.id = ma.persona_id
           WHERE c.id = $1`,
          [id],
        );
        const caso = base.rows[0];
        if (!caso) throw new NotFoundException(NO_EXISTE);
        const participantes = await db.query<
          DetalleCaso['participantes'][number]
        >(
          `SELECT e.id AS estudiante_id, p.nombres, p.apellidos,
                  e.codigo_estudiante, p.rut, pa.rol_contextual AS rol,
                  (SELECT ca.nombre || ' (' || aa.anio || ')' FROM convi.matriculas actual
                   JOIN convi.cursos ca ON ca.id = actual.curso_id
                   JOIN convi.anios_academicos aa ON aa.id = actual.anio_academico_id
                   WHERE actual.estudiante_id = e.id AND actual.estado = 'ACTIVO'
                     AND actual.matriculado_en <= ${HOY_ESCUELA}
                   ORDER BY actual.matriculado_en DESC, actual.id LIMIT 1) AS curso_actual,
                  cm.nombre || ' (' || am.anio || ')' AS curso_matricula
           FROM convi.participaciones pa
           JOIN convi.personas p ON p.id = pa.persona_id
           LEFT JOIN convi.estudiantes e ON e.persona_id = p.id
           LEFT JOIN convi.matriculas mt ON mt.id = pa.matricula_contexto_id
           LEFT JOIN convi.cursos cm ON cm.id = mt.curso_id
           LEFT JOIN convi.anios_academicos am ON am.id = cm.anio_academico_id
           WHERE pa.caso_id = $1 AND pa.activo_hasta IS NULL
           ORDER BY p.apellidos, p.nombres`,
          [id],
        );
        const situaciones = await cargar(
          'situaciones_vinculadas',
          async () =>
            (
              await db.query<DetalleCaso['situaciones_vinculadas'][number]>(
                `SELECT s.id, s.codigo, cat.nombre AS categoria, s.ocurrido_en,
                        s.vinculado_a_caso_en,
                        pv.nombres || ' ' || pv.apellidos AS vinculado_por,
                        (SELECT r.fundamento FROM convi.revisiones_convivencia r
                         WHERE r.situacion_id = s.id AND r.resultado = 'VINCULADA_CASO'
                           AND r.caso_destino_id = s.caso_id
                         ORDER BY r.revisado_en DESC LIMIT 1) AS fundamento_vinculacion
                 FROM convi.situaciones s
                 LEFT JOIN convi.categorias_convivencia cat ON cat.id = s.categoria_id
                 JOIN convi.membresias_establecimiento mv ON mv.id = s.vinculado_a_caso_por
                 JOIN convi.personas pv ON pv.id = mv.persona_id
                 WHERE s.caso_id = $1
                 ORDER BY s.ocurrido_en, s.codigo`,
                [id],
              )
            ).rows,
          [],
        );
        const permitidos = await cargar(
          'estado',
          () => estadosPermitidos(db, caso.estado_actual),
          { intermedios: [], cierre: false },
        );
        const fechas = await cargar(
          'fechas',
          async () =>
            (
              await db.query<{ hoy: string; ahora: string }>(
                `SELECT ${HOY_ESCUELA}::text AS hoy,
                        to_char(now() AT TIME ZONE (SELECT zona_horaria FROM convi.establecimientos
                          WHERE id = convi.establecimiento_actual()), 'YYYY-MM-DD"T"HH24:MI') AS ahora`,
              )
            ).rows[0],
          { hoy: '', ahora: '' },
        );
        return {
          ...caso,
          participantes: participantes.rows,
          situaciones_vinculadas: situaciones,
          movimientos: await cargar(
            'estado',
            () => movimientosDelCaso(db, id),
            [],
          ),
          ultimo_movimiento_id: await cargar(
            'estado',
            () => ultimoMovimiento(db, id),
            null,
          ),
          estados_permitidos: permitidos.intermedios,
          puede_cerrar: permitidos.cierre,
          pendientes: await cargar('estado', () => pendientesDelCaso(db, id), {
            actuaciones: 0,
            compromisos: 0,
            acciones_plan: 0,
            pasos_protocolo: 0,
          }),
          actas_cierre: await cargar('estado', () => actasDelCaso(db, id), []),
          evidencias: await cargar(
            'evidencias',
            () => evidenciasDelCaso(db, id),
            [],
          ),
          protocolos_aplicados: await cargar(
            'protocolos_aplicados',
            () => protocolosDelCaso(db, id),
            [],
          ),
          protocolos_aplicables: await cargar(
            'normativa',
            () => protocolosAplicables(db),
            [],
          ),
          revisiones_normativas: await cargar(
            'normativa',
            () => revisionesNormativasDelCaso(db, id),
            [],
          ),
          opciones_normativa: await cargar(
            'normativa',
            () => opcionesNormativa(db),
            { protocolos: [], documentos: [] },
          ),
          planes_intervencion: await cargar(
            'plan',
            () => planesDelCaso(db, id),
            [],
          ),
          responsables_accion: await cargar(
            'plan',
            () => responsablesDeAccion(db),
            [],
          ),
          hoy: fechas.hoy,
          ahora: fechas.ahora,
          compromisos: await cargar(
            'compromisos_seguimientos',
            () => compromisosDelCaso(db, id),
            [],
          ),
          seguimientos: await cargar(
            'compromisos_seguimientos',
            () => seguimientosDelCaso(db, id),
            [],
          ),
          actuaciones_origen: await cargar(
            'actuaciones_origen',
            async () =>
              (
                await db.query<{ id: string; objetivo: string }>(
                  'SELECT id,objetivo FROM convi.actuaciones WHERE caso_id=$1 ORDER BY creado_en DESC,id',
                  [id],
                )
              ).rows,
            [],
          ),
          encuentros: await cargar(
            'encuentros',
            () => encuentrosDelCaso(db, id),
            [],
          ),
          opciones_encuentro: {
            responsables: await cargar(
              'personas_encuentro',
              () => responsablesDeEncuentro(db),
              [],
            ),
            asistentes: await cargar(
              'personas_encuentro',
              () => asistentesPosibles(db, id),
              [],
            ),
            acciones_plan: await cargar(
              'acciones_encuentro',
              () => accionesParaEncuentro(db, id),
              [],
            ),
          },
        };
      },
    );
  }

  // PB-082 (HU-071 CA1): aplica una versión publicada y vigente al caso, con
  // quién, cuándo y el fundamento, y crea sus pasos para el caso. Decisión
  // del PO (por defecto): un caso cerrado no recibe protocolos y un mismo
  // protocolo no se aplica dos veces mientras siga activo en el caso.
  aplicarProtocolo(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarAplicacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        await casoAbierto(db, casoId);
        const errores: Record<string, string> = {};
        const version = await db.query<{ protocolo_id: string }>(
          `SELECT vp.protocolo_id ${PROTOCOLOS_APLICABLES} AND vp.id = $1`,
          [datos.version_protocolo_id],
        );
        const protocoloId = version.rows[0]?.protocolo_id;
        if (!protocoloId)
          errores.version_protocolo_id =
            'Ese protocolo no tiene una versión publicada y vigente. Recarga la página.';
        else {
          const repetido = await db.query(
            `SELECT 1 FROM convi.protocolos_caso pc
             JOIN convi.versiones_protocolo vp ON vp.id = pc.version_protocolo_id
             WHERE pc.caso_id = $1 AND vp.protocolo_id = $2
               AND pc.estado = 'ACTIVO'`,
            [casoId, protocoloId],
          );
          if (repetido.rowCount)
            errores.version_protocolo_id =
              'Este protocolo ya está aplicado y activo en el caso.';
        }
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se aplicó el protocolo.',
            errores,
          });
        const aplicado = await db.query<{ id: string }>(
          `INSERT INTO convi.protocolos_caso
             (establecimiento_id, caso_id, version_protocolo_id, aplicado_por,
              fundamento)
           VALUES (convi.establecimiento_actual(), $1, $2,
                   convi.membresia_actual(), $3)
           RETURNING id`,
          [casoId, datos.version_protocolo_id, datos.fundamento],
        );
        await crearPasosDelCaso(db, aplicado.rows[0].id, casoId);
        return aplicado.rows[0];
      },
    );
  }

  // PB-082 (HU-071 CA2 y CA3): si no aplica un protocolo se registra una
  // revisión del caso con su aplicabilidad, su fundamento y las páginas
  // consultadas, sin crear una aplicación ficticia.
  registrarRevisionNormativa(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarRevisionNormativa(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        await casoAbierto(db, casoId);
        const errores = await comprobarNormativaVigente(db, datos);
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se guardó la revisión.',
            errores,
          });
        return insertarRevisionNormativaDelCaso(db, casoId, datos);
      },
    );
  }

  // HU-131: mueve el caso a otra etapa con un motivo. El movimiento guarda el
  // estado anterior y el nuevo, quién y cuándo (CA1), y el trigger
  // aplicar_estado actualiza el caso (CA2). Responde con el estado nuevo.
  cambiarEstado(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarCambioEstado(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await casoSinCambios(
          db,
          casoId,
          datos.movimiento_anterior_id,
        );
        // CA5: solo los cambios del flujo; el cierre tiene su propio formulario.
        const permitidos = await estadosPermitidos(db, actual);
        if (!permitidos.intermedios.includes(datos.estado_nuevo))
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El estado no cambió.',
            errores: {
              estado_nuevo:
                datos.estado_nuevo === actual
                  ? 'El caso ya está en ese estado. Elige otro.'
                  : 'Desde el estado actual el caso no puede pasar a ese.',
            },
          });
        await db.query(
          `INSERT INTO convi.historial_estados_caso
             (establecimiento_id, caso_id, estado_anterior, estado_nuevo,
              cambiado_por, motivo)
           VALUES (convi.establecimiento_actual(), $1, $2, $3,
                   convi.membresia_actual(), $4)`,
          [casoId, actual, datos.estado_nuevo, datos.motivo],
        );
        return { id: casoId, estado: datos.estado_nuevo };
      },
    );
  }

  // HU-047: cierra el caso con motivo y resumen (CA1). Si quedan tareas sin
  // terminar hay que justificar cómo se atenderán (CA2). El cierre es otro
  // movimiento del historial y no borra nada (CA4).
  cerrar(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarCierre(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const actual = await casoSinCambios(
          db,
          casoId,
          datos.movimiento_anterior_id,
        );
        if (!(await estadosPermitidos(db, actual)).cierre)
          throw new ConflictException(
            'Desde el estado actual el caso no se puede cerrar.',
          );

        const errores: Record<string, string> = {};
        const pendientes = await pendientesDelCaso(db, casoId);
        if (hayPendientes(pendientes) && !datos.justificacion_pendientes)
          errores.justificacion_pendientes =
            'Quedan tareas sin terminar. Explica cómo se atenderán.';
        if (
          datos.evidencia_cierre_id &&
          !(await actasDelCaso(db, casoId)).some(
            (acta) => acta.id === datos.evidencia_cierre_id,
          )
        )
          errores.evidencia_cierre_id = 'Elige un acta de este caso.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El caso no se cerró.',
            errores,
          });

        await db.query(
          `INSERT INTO convi.historial_estados_caso
             (establecimiento_id, caso_id, estado_anterior, estado_nuevo,
              cambiado_por, motivo, resumen_cierre, justificacion_pendientes,
              evidencia_cierre_id)
           VALUES (convi.establecimiento_actual(), $1, $2, 'CERRADO',
                   convi.membresia_actual(), $3, $4, $5, $6)`,
          [
            casoId,
            actual,
            datos.motivo,
            datos.resumen_cierre,
            hayPendientes(pendientes) ? datos.justificacion_pendientes : null,
            datos.evidencia_cierre_id,
          ],
        );
        return { id: casoId, estado: 'CERRADO' };
      },
    );
  }

  // HU-046: abre el caso desde una situación En revisión. En una sola
  // transacción se crea el caso En análisis con su código (CA2), sus
  // participantes pasan al caso y se registra la decisión que deja la
  // situación vinculada. Si otro caso tomó el mismo código se reintenta.
  // PB-050: también desde una Antecedente o Descartada, como reconsideración.
  async crearDesdeSituacion(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; codigo: string }> {
    const datos = validarNuevoCaso(cuerpo);
    const motivo = leerMotivoReconsideracion(cuerpo);
    for (let intento = 1; ; intento++) {
      try {
        return await this.guardarCaso(sesion, situacionId, datos, motivo);
      } catch (error) {
        const reintentar =
          error instanceof ConflictException &&
          error.message === CASO_SIMULTANEO &&
          intento < INTENTOS_CASO;
        if (!reintentar) throw error;
        await new Promise((listo) =>
          setTimeout(listo, 20 + Math.random() * 80),
        );
      }
    }
  }

  private guardarCaso(
    sesion: Sesion,
    situacionId: string,
    datos: NuevoCaso,
    motivoReconsideracion: string | null,
  ): Promise<{ id: string; codigo: string }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const prefijo = await situacionPorDecidir(
          db,
          situacionId,
          datos.revision_anterior_id,
          'abrir un caso',
          motivoReconsideracion,
        );

        const errores: Record<string, string> = {};
        // CA1: el responsable es una cuenta de Convivencia activa de la escuela.
        const responsable = await db.query(
          `SELECT 1 FROM convi.membresias_establecimiento
           WHERE id = $1 AND codigo_perfil = 'CONVIVENCIA' AND estado = 'ACTIVO'`,
          [datos.responsable_id],
        );
        if (responsable.rowCount === 0)
          errores.responsable_id =
            'Elige a una persona activa del equipo de Convivencia.';
        if (datos.categoria_principal_id) {
          const categoria = await db.query(
            `SELECT 1 FROM convi.categorias_convivencia
             WHERE id = $1 AND estado = 'ACTIVO'`,
            [datos.categoria_principal_id],
          );
          if (categoria.rowCount === 0)
            errores.categoria_principal_id = 'Elige una categoría activa.';
        }
        const futura = await db.query<{ futura: boolean }>(
          `SELECT $1::date > ${HOY_ESCUELA} AS futura`,
          [datos.fecha_inicio],
        );
        if (futura.rows[0]?.futura)
          errores.fecha_inicio = 'La fecha de inicio no puede ser futura.';
        // CA4: con un caso activo de los mismos estudiantes hay que justificar
        // por qué se abre uno independiente (la otra opción es vincularla, PB-052).
        const relacionados = await casosRelacionados(db, situacionId);
        if (relacionados.length > 0 && !datos.justificacion_independiente)
          errores.justificacion_independiente = `Ya hay casos activos con estos estudiantes (${relacionados
            .map((c) => c.codigo)
            .join(', ')}). Explica por qué abres uno independiente.`;
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se abrió el caso.',
            errores,
          });

        // CA2 y CA5: la base asigna el código, el estado En análisis, la fecha
        // de registro y copia el plazo de cierre de la escuela (CA3).
        const caso = await db
          .query<{ id: string; codigo: string }>(
            `INSERT INTO convi.casos
               (establecimiento_id, titulo, resumen, fecha_inicio,
                categoria_principal_id, asignado_a_membresia_id, abierto_por,
                justificacion_independiente)
             VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
                     convi.membresia_actual(), $6)
             RETURNING id, codigo`,
            [
              datos.titulo,
              datos.resumen,
              datos.fecha_inicio,
              datos.categoria_principal_id,
              datos.responsable_id,
              relacionados.length > 0
                ? datos.justificacion_independiente
                : null,
            ],
          )
          .catch((error: unknown) => {
            if (esChoque(error)) throw new ConflictException(CASO_SIMULTANEO);
            throw error;
          });
        const nuevo = caso.rows[0];

        // CA2: los participantes de la situación pasan al caso, con la
        // matrícula que tenían al ocurrir el hecho (HU-066).
        await db.query(
          `INSERT INTO convi.participaciones
             (establecimiento_id, persona_id, caso_id, rol_contextual,
              matricula_contexto_id)
           SELECT convi.establecimiento_actual(), pa.persona_id, $1,
                  pa.rol_contextual, pa.matricula_contexto_id
           FROM convi.participaciones pa
           WHERE pa.situacion_id = $2 AND pa.activo_hasta IS NULL`,
          [nuevo.id, situacionId],
        );

        // La decisión deja la situación Vinculada a caso; la base exige que
        // el caso comparta un estudiante con ella y la última revisión vista.
        await db.query(
          `INSERT INTO convi.revisiones_convivencia
             (establecimiento_id, situacion_id, tipo_revision, resultado,
              fundamento, revisado_por, revision_anterior_id, caso_destino_id)
           VALUES (convi.establecimiento_actual(), $1, 'DECISION',
                   'VINCULADA_CASO', $2, convi.membresia_actual(), $3, $4)`,
          [
            situacionId,
            `${prefijo}Se abrió el caso ${nuevo.codigo} a partir de esta situación: ${datos.titulo}`,
            datos.revision_anterior_id,
            nuevo.id,
          ],
        );
        return nuevo;
      },
    );
  }

  // HU-045: suma la situación En revisión a un caso activo que comparte
  // estudiantes con ella. La decisión Vinculada a caso deja en la situación el
  // caso, quién y cuándo (CA2); después no se traslada ni se desvincula (CA4).
  // Responde con el id y el código del caso.
  vincularSituacion(
    sesion: Sesion,
    situacionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; codigo: string }> {
    const datos = validarVinculacion(cuerpo);
    const motivo = leerMotivoReconsideracion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const prefijo = await situacionPorDecidir(
          db,
          situacionId,
          datos.revision_anterior_id,
          'vincularla a un caso',
          motivo,
        );

        // FOR SHARE impide que el caso se cierre mientras se vincula.
        const caso = await db
          .query<{ id: string; codigo: string }>(
            'SELECT id, codigo FROM convi.casos WHERE id = $1 FOR SHARE',
            [datos.caso_id],
          )
          .catch((error: unknown) => {
            if (esChoque(error))
              throw new ConflictException(
                'El caso cambió mientras lo elegías. Recarga la página e inténtalo nuevamente.',
              );
            throw error;
          });
        // CA1: solo un caso de la escuela que comparte un estudiante con la
        // situación. Decisión del PO (por defecto): un caso cerrado no recibe
        // situaciones nuevas, igual que en la lista de casos relacionados.
        const permitidos = await casosRelacionados(db, situacionId);
        const elegido = caso.rows[0];
        if (!elegido || !permitidos.some((c) => c.id === elegido.id))
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se vinculó la situación.',
            errores: {
              caso_id:
                'Elige uno de los casos activos que comparten estudiantes con esta situación.',
            },
          });

        // Primero la decisión, para que la base compruebe el estudiante en
        // común con lo que el caso ya tenía; el trigger aplicar_revision deja
        // la situación Vinculada a caso con quién y cuándo.
        await db.query(
          `INSERT INTO convi.revisiones_convivencia
             (establecimiento_id, situacion_id, tipo_revision, resultado,
              fundamento, revisado_por, revision_anterior_id, caso_destino_id)
           VALUES (convi.establecimiento_actual(), $1, 'DECISION',
                   'VINCULADA_CASO', $2, convi.membresia_actual(), $3, $4)`,
          [
            situacionId,
            prefijo + datos.fundamento,
            datos.revision_anterior_id,
            elegido.id,
          ],
        );

        // Decisión del PO (por defecto): quienes participan en la situación y
        // no estaban en el caso pasan a él con la matrícula que tenían al
        // ocurrir el hecho (HU-066); quienes ya estaban conservan su rol.
        await db.query(
          `INSERT INTO convi.participaciones
             (establecimiento_id, persona_id, caso_id, rol_contextual,
              matricula_contexto_id)
           SELECT convi.establecimiento_actual(), pa.persona_id, $1,
                  pa.rol_contextual, pa.matricula_contexto_id
           FROM convi.participaciones pa
           WHERE pa.situacion_id = $2 AND pa.activo_hasta IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM convi.participaciones pc
               WHERE pc.caso_id = $1 AND pc.persona_id = pa.persona_id
                 AND pc.activo_hasta IS NULL)`,
          [elegido.id, situacionId],
        );
        return elegido;
      },
    );
  }
}

/**
 * Bloquea la situación y comprueba que se pueda decidir sobre ella y que
 * nadie haya agregado una revisión desde que se abrió el formulario (PB-139).
 * Abrir un caso y vincularla a uno existente son decisiones: En revisión
 * terminan la revisión y sobre una Antecedente o Descartada son una
 * reconsideración (PB-050), que exige el motivo. Devuelve lo que va al
 * inicio del fundamento.
 */
async function situacionPorDecidir(
  db: PoolClient,
  situacionId: string,
  revisionAnteriorId: string | null,
  para: string,
  motivoReconsideracion: string | null,
): Promise<string> {
  const actual = await db
    .query<{ estado: string }>(
      'SELECT estado FROM convi.situaciones WHERE id = $1 FOR UPDATE',
      [situacionId],
    )
    .catch((error: unknown) => {
      if (esChoque(error)) throw new ConflictException(DECISION_DESACTUALIZADA);
      throw error;
    });
  const fila = actual.rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE_SITUACION);
  if (fila.estado === 'NUEVA')
    throw new ConflictException(`Inicia la revisión antes de ${para}.`);
  if (fila.estado === 'INFORMACION_SOLICITADA')
    throw new ConflictException(
      `Espera la respuesta del profesor a la aclaración antes de ${para}.`,
    );
  // HU-045 CA4: una situación vinculada no se traslada ni se desvincula.
  if (fila.estado === 'VINCULADA_CASO')
    throw new ConflictException(
      'Esta situación ya está vinculada a un caso. No se traslada a otro ni se desvincula.',
    );
  if (fila.estado !== 'EN_REVISION' && !esReconsiderable(fila.estado))
    throw new ConflictException(
      `En el estado actual de la situación no se puede ${para}.`,
    );
  if ((await ultimaRevision(db, situacionId)) !== revisionAnteriorId)
    throw new ConflictException(DECISION_DESACTUALIZADA);
  return prefijoReconsideracion(fila.estado, motivoReconsideracion);
}

/**
 * Bloquea el caso y comprueba que siga abierto y que nadie haya agregado un
 * movimiento desde que se abrió el formulario (HU-131 CA3 y HU-047 CA3).
 * Devuelve el estado actual.
 */
async function casoSinCambios(
  db: PoolClient,
  casoId: string,
  movimientoAnteriorId: string | null,
): Promise<string> {
  const caso = await db
    .query<{ estado_actual: string }>(
      'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR UPDATE',
      [casoId],
    )
    .catch((error: unknown) => {
      if (esChoque(error)) throw new ConflictException(CASO_DESACTUALIZADO);
      throw error;
    });
  const fila = caso.rows[0];
  if (!fila) throw new NotFoundException(NO_EXISTE);
  // HU-131 CA4: un caso cerrado solo se reabre (HU-051, otro ítem).
  if (fila.estado_actual === 'CERRADO')
    throw new ConflictException(
      'El caso está cerrado. Un caso cerrado solo se puede reabrir.',
    );
  if ((await ultimoMovimiento(db, casoId)) !== movimientoAnteriorId)
    throw new ConflictException(CASO_DESACTUALIZADO);
  return fila.estado_actual;
}

/**
 * PB-082: el caso existe y sigue abierto. FOR SHARE impide que se cierre
 * mientras se le aplica un protocolo o se registra su revisión.
 */
async function casoAbierto(db: PoolClient, casoId: string) {
  const caso = await db
    .query<{ estado_actual: string }>(
      'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
      [casoId],
    )
    .catch((error: unknown) => {
      if (esChoque(error)) throw new ConflictException(CASO_DESACTUALIZADO);
      throw error;
    });
  if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE);
  if (caso.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(
      'El caso está cerrado. Un caso cerrado solo se puede reabrir.',
    );
}
