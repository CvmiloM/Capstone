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
  accionesParaEncuentro,
  asistentesPosibles,
  EN_LA_ESCUELA,
  ENCUENTRO_ABIERTO,
  leerAsistentes,
  responsablesDeEncuentro,
  validarCancelacion,
  validarNuevoEncuentro,
  validarRealizacion,
  validarReprogramacion,
  type Asistente,
} from './encuentros.js';

// PB-063 y PB-064 (HU-055): encuentros del caso. Solo Convivencia activa con
// segundo factor (PB-009); la seguridad por fila separa por escuela. Como el
// plan de intervención, todo corre en READ COMMITTED: tras bloquear el caso o
// el encuentro, cada consulta ve lo que otra operación acaba de guardar.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE_CASO = 'El caso no existe.';
const NO_EXISTE_ENCUENTRO = 'El encuentro no existe.';
const CASO_CERRADO =
  'El caso está cerrado. Un caso cerrado solo se puede reabrir.';
// PB-139: el formulario envía la huella de lo que se veía.
const ENCUENTRO_DESACTUALIZADO =
  'Otra persona cambió el encuentro mientras lo mirabas. Recarga la página para verlo antes de continuar.';
const ENCUENTRO_TERMINADO =
  'El encuentro ya se realizó o se canceló, y se conserva como quedó.';

@Injectable()
export class EncuentrosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // PB-063 (CA1 y CA4): programa el encuentro con su responsable, lugar, fecha
  // y asistentes, que empiezan Pendientes. Quien lo registra queda como autor.
  programar(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarNuevoEncuentro(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        await casoAbierto(db, casoId);
        const errores: Record<string, string> = {};
        const responsables = await responsablesDeEncuentro(db);
        if (!responsables.some((r) => r.id === datos.responsable_id))
          errores.responsable_id =
            'Elige a una persona activa del equipo de Convivencia.';
        if (
          datos.accion_plan_id &&
          !(await accionesParaEncuentro(db, casoId)).some(
            (a) => a.id === datos.accion_plan_id,
          )
        )
          errores.accion_plan_id =
            'Elige una acción abierta del plan vigente de este caso.';
        if (!(await sonAsistentesDelCaso(db, casoId, datos.asistentes)))
          errores.asistentes =
            'Alguno de los asistentes ya no está disponible. Recarga la página.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se programó el encuentro.',
            errores,
          });
        const encuentro = await db.query<{ id: string }>(
          `INSERT INTO convi.actuaciones
             (establecimiento_id, caso_id, accion_plan_id, tipo_actuacion,
              membresia_responsable_id, objetivo, descripcion, lugar,
              programado_en, fin_programado_en, creado_por)
           VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6, $7,
                   ${EN_LA_ESCUELA('$8')}, ${EN_LA_ESCUELA('$9')},
                   convi.membresia_actual())
           RETURNING id`,
          [
            casoId,
            datos.accion_plan_id,
            datos.tipo,
            datos.responsable_id,
            datos.objetivo,
            datos.descripcion,
            datos.lugar,
            datos.programado_en,
            datos.fin_programado_en,
          ],
        );
        await insertarAsistentes(db, encuentro.rows[0].id, datos.asistentes);
        return encuentro.rows[0];
      },
      'READ COMMITTED',
    );
  }

  // Decisión del PO (por defecto): mientras no se realice, se pueden sumar
  // asistentes; nadie se quita, quien no fue queda No asistió o Justificado.
  agregarAsistentes(
    sesion: Sesion,
    encuentroId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = (
      typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
    ) as Record<string, unknown>;
    const asistentes = leerAsistentes(datos.asistentes ?? []);
    if (asistentes === false || asistentes.length === 0)
      throw new BadRequestException({
        mensaje: 'Revisa los datos marcados. No se agregaron asistentes.',
        errores: {
          asistentes:
            asistentes === false
              ? 'Elige los asistentes de la lista.'
              : 'Elige al menos una persona.',
        },
      });
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // FOR SHARE: el encuentro no se registra mientras se suman personas.
        const encuentro = await encuentroAbierto(db, encuentroId, 'FOR SHARE');
        if (!(await sonAsistentesDelCaso(db, encuentro.caso_id, asistentes)))
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se agregaron asistentes.',
            errores: {
              asistentes:
                'Alguno de los asistentes ya no está disponible. Recarga la página.',
            },
          });
        await insertarAsistentes(db, encuentroId, asistentes);
        return { id: encuentroId };
      },
      'READ COMMITTED',
    );
  }

  // PB-063 (CA5): cambiar la fecha programada exige motivo; la auditoría
  // guarda la fecha anterior y la nueva. Decisión del PO (por defecto): el
  // encuentro queda Pospuesto con la nueva fecha.
  reprogramar(
    sesion: Sesion,
    encuentroId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarReprogramacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const encuentro = await encuentroAbierto(db, encuentroId, 'FOR UPDATE');
        if (encuentro.version !== datos.version)
          throw new ConflictException(ENCUENTRO_DESACTUALIZADO);
        if (
          encuentro.programado_local === datos.programado_en &&
          encuentro.fin_programado_local === datos.fin_programado_en
        )
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El encuentro no cambió.',
            errores: {
              programado_en: 'Elige una fecha u hora distinta a la actual.',
            },
          });
        await motivoDelCambio(db, datos.motivo);
        await db.query(
          `UPDATE convi.actuaciones
           SET programado_en = ${EN_LA_ESCUELA('$2')},
               fin_programado_en = ${EN_LA_ESCUELA('$3')},
               estado = 'POSPUESTA'
           WHERE id = $1`,
          [encuentroId, datos.programado_en, datos.fin_programado_en],
        );
        return { id: encuentroId };
      },
      'READ COMMITTED',
    );
  }

  // PB-064 (CA2, CA3, CA4 y CA6): queda Realizado con inicio y término reales,
  // que no pueden ser futuros, su resultado y la asistencia de cada persona.
  registrarRealizacion(
    sesion: Sesion,
    encuentroId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarRealizacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const encuentro = await encuentroAbierto(db, encuentroId, 'FOR UPDATE');
        if (encuentro.version !== datos.version)
          throw new ConflictException(ENCUENTRO_DESACTUALIZADO);
        const errores: Record<string, string> = {};
        const futuras = await db.query<{ inicio: boolean; termino: boolean }>(
          `SELECT ${EN_LA_ESCUELA('$1')} > now() AS inicio,
                  coalesce(${EN_LA_ESCUELA('$2')} > now(), false) AS termino`,
          [datos.realizado_en, datos.fin_real_en],
        );
        if (futuras.rows[0].inicio)
          errores.realizado_en = 'El inicio real no puede ser futuro.';
        if (futuras.rows[0].termino)
          errores.fin_real_en = 'El término real no puede ser futuro.';
        // CA4: cada asistente queda con su asistencia, sin sobrar ni faltar.
        const actuales = await db.query<{ id: string }>(
          `SELECT id FROM convi.participaciones
           WHERE actuacion_id = $1 AND activo_hasta IS NULL FOR UPDATE`,
          [encuentroId],
        );
        const marcados = new Set(
          datos.asistencia.map((a) => a.participacion_id),
        );
        for (const fila of actuales.rows)
          if (!marcados.has(fila.id))
            errores[`asistencia_${fila.id}`] ??=
              'Marca si asistió, no asistió o se justificó.';
        if (
          datos.asistencia.some(
            (a) =>
              !actuales.rows.some((fila) => fila.id === a.participacion_id),
          )
        )
          errores.asistencia =
            'La lista de asistentes cambió. Recarga la página.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El encuentro no se registró.',
            errores,
          });
        await db.query(
          `UPDATE convi.participaciones p SET estado_asistencia = x.estado
           FROM unnest($1::uuid[], $2::text[]) AS x(id, estado)
           WHERE p.id = x.id`,
          [
            datos.asistencia.map((a) => a.participacion_id),
            datos.asistencia.map((a) => a.estado),
          ],
        );
        await db.query(
          `UPDATE convi.actuaciones
           SET estado = 'REALIZADA', realizado_en = ${EN_LA_ESCUELA('$2')},
               fin_real_en = ${EN_LA_ESCUELA('$3')}, resultado = $4
           WHERE id = $1`,
          [encuentroId, datos.realizado_en, datos.fin_real_en, datos.resultado],
        );
        return { id: encuentroId };
      },
      'READ COMMITTED',
    );
  }

  // Decisión del PO (por defecto): cancelar exige motivo, que queda en la
  // auditoría; el encuentro cancelado se conserva.
  cancelar(
    sesion: Sesion,
    encuentroId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarCancelacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const encuentro = await encuentroAbierto(db, encuentroId, 'FOR UPDATE');
        if (encuentro.version !== datos.version)
          throw new ConflictException(ENCUENTRO_DESACTUALIZADO);
        await motivoDelCambio(db, datos.motivo);
        await db.query(
          "UPDATE convi.actuaciones SET estado = 'CANCELADA' WHERE id = $1",
          [encuentroId],
        );
        return { id: encuentroId };
      },
      'READ COMMITTED',
    );
  }
}

/** El caso existe y sigue abierto; FOR SHARE impide que se cierre entretanto. */
async function casoAbierto(db: PoolClient, casoId: string) {
  const caso = await db.query<{ estado_actual: string }>(
    'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
    [casoId],
  );
  if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE_CASO);
  if (caso.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(CASO_CERRADO);
}

type EncuentroActual = {
  caso_id: string;
  estado: string;
  programado_local: string | null;
  fin_programado_local: string | null;
  version: string;
};

/**
 * Bloquea el caso y luego el encuentro, en ese orden para no cruzarse con el
 * cierre del caso, y comprueba que el encuentro siga Planificado o Pospuesto.
 * Los seguimientos tienen su propio ítem (PB-068).
 */
async function encuentroAbierto(
  db: PoolClient,
  encuentroId: string,
  bloqueo: 'FOR UPDATE' | 'FOR SHARE',
): Promise<EncuentroActual> {
  const caso = await db.query<{ caso_id: string }>(
    `SELECT caso_id FROM convi.actuaciones
     WHERE id = $1 AND tipo_actuacion <> 'SEGUIMIENTO'`,
    [encuentroId],
  );
  if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE_ENCUENTRO);
  await casoAbierto(db, caso.rows[0].caso_id);
  const zona = `(SELECT zona_horaria FROM convi.establecimientos
    WHERE id = convi.establecimiento_actual())`;
  const encuentro = await db.query<EncuentroActual>(
    `SELECT a.caso_id, a.estado,
            to_char(a.programado_en AT TIME ZONE ${zona}, 'YYYY-MM-DD"T"HH24:MI') AS programado_local,
            to_char(a.fin_programado_en AT TIME ZONE ${zona}, 'YYYY-MM-DD"T"HH24:MI') AS fin_programado_local,
            md5(to_jsonb(a)::text) AS version
     FROM convi.actuaciones a WHERE a.id = $1 ${bloqueo}`,
    [encuentroId],
  );
  if (!ENCUENTRO_ABIERTO.includes(encuentro.rows[0].estado))
    throw new ConflictException(ENCUENTRO_TERMINADO);
  return encuentro.rows[0];
}

/** Cada asistente es una de las personas que el caso ofrece, con su rol. */
async function sonAsistentesDelCaso(
  db: PoolClient,
  casoId: string,
  asistentes: Asistente[],
) {
  const posibles = await asistentesPosibles(db, casoId);
  return asistentes.every((a) =>
    posibles.some((p) => p.persona_id === a.persona_id && p.rol === a.rol),
  );
}

/** CA4: cada asistente empieza Pendiente; quien ya estaba no se repite. */
async function insertarAsistentes(
  db: PoolClient,
  encuentroId: string,
  asistentes: Asistente[],
) {
  await db.query(
    `INSERT INTO convi.participaciones
       (establecimiento_id, persona_id, actuacion_id, rol_contextual,
        estado_asistencia)
     SELECT convi.establecimiento_actual(), x.persona, $1::uuid, x.rol, 'PENDIENTE'
     FROM unnest($2::uuid[], $3::text[]) AS x(persona, rol)
     WHERE NOT EXISTS (
       SELECT 1 FROM convi.participaciones pa
       WHERE pa.actuacion_id = $1::uuid AND pa.persona_id = x.persona
         AND pa.rol_contextual = x.rol AND pa.activo_hasta IS NULL)`,
    [
      encuentroId,
      asistentes.map((a) => a.persona_id),
      asistentes.map((a) => a.rol),
    ],
  );
}

/** El motivo queda en la auditoría del cambio (eventos_auditoria). */
async function motivoDelCambio(db: PoolClient, motivo: string) {
  await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [motivo]);
}
