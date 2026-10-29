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
  ACCION_ABIERTA,
  esResponsableValido,
  FIN_DEL_DIA,
  HOY,
  INICIO_DEL_DIA,
  PLAN_VIGENTE,
  validarAvanceAccion,
  validarCambioEstadoPlan,
  validarCorreccionAccion,
  validarNuevaAccion,
  validarNuevoPlan,
  ZONA_ESCUELA,
} from './plan-intervencion.js';

// PB-061 y PB-062 (HU-054): plan de intervención del caso y sus acciones. Solo
// Convivencia activa con segundo factor (PB-009); la seguridad por fila separa
// por escuela. Todo corre en READ COMMITTED para que, tras bloquear el caso o
// el plan, cada consulta vea lo que otra operación acaba de guardar.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE_CASO = 'El caso no existe.';
const NO_EXISTE_PLAN = 'El plan de intervención no existe.';
const NO_EXISTE_ACCION = 'La acción del plan no existe.';
const CASO_CERRADO =
  'El caso está cerrado. Un caso cerrado solo se puede reabrir.';
const PLAN_TERMINADO =
  'El plan ya terminó. Un plan completado o cancelado no se reabre: crea uno nuevo.';
// PB-139: el formulario envía la huella de lo que se veía.
const PLAN_DESACTUALIZADO =
  'Otra persona cambió el plan mientras lo mirabas. Recarga la página para verlo antes de continuar.';
const ACCION_DESACTUALIZADA =
  'Otra persona cambió la acción mientras la mirabas. Recarga la página para verla antes de continuar.';

@Injectable()
export class PlanesService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA1: crea el plan del caso con su objetivo, Borrador o Activo, y el
  // protocolo aplicado que lo origina si se indica. Decisión del PO (por
  // defecto): un caso tiene un solo plan vigente (Borrador o Activo).
  crearPlan(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarNuevoPlan(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // FOR UPDATE: dos planes creados a la vez no quedan ambos vigentes.
        await casoAbierto(db, casoId, 'FOR UPDATE');
        const vigente = await db.query(
          `SELECT 1 FROM convi.planes_intervencion
           WHERE caso_id = $1 AND estado = ANY($2::text[])`,
          [casoId, PLAN_VIGENTE],
        );
        if (vigente.rowCount)
          throw new ConflictException(
            'El caso ya tiene un plan vigente. Complétalo o cancélalo antes de crear otro.',
          );
        if (datos.protocolo_caso_id) {
          const protocolo = await db.query(
            'SELECT 1 FROM convi.protocolos_caso WHERE id = $1 AND caso_id = $2',
            [datos.protocolo_caso_id, casoId],
          );
          if (!protocolo.rowCount)
            throw new BadRequestException({
              mensaje: 'Revisa los datos marcados. No se creó el plan.',
              errores: {
                protocolo_caso_id: 'Elige un protocolo aplicado en este caso.',
              },
            });
        }
        const plan = await db.query<{ id: string }>(
          `INSERT INTO convi.planes_intervencion
             (establecimiento_id, caso_id, protocolo_caso_id, objetivo, estado,
              creado_por)
           VALUES (convi.establecimiento_actual(), $1, $2, $3, $4,
                   convi.membresia_actual())
           RETURNING id`,
          [casoId, datos.protocolo_caso_id, datos.objetivo, datos.estado],
        );
        return plan.rows[0];
      },
      'READ COMMITTED',
    );
  }

  // CA5: un borrador pasa a Activo, y el plan se completa o cancela en
  // cualquier momento con un motivo, aunque queden acciones pendientes. La
  // base registra la fecha de término y la auditoría guarda el cambio.
  cambiarEstadoPlan(
    sesion: Sesion,
    planId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarCambioEstadoPlan(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const plan = await planVigente(db, planId, 'FOR UPDATE');
        if (plan.version !== datos.version)
          throw new ConflictException(PLAN_DESACTUALIZADO);
        if (plan.estado === datos.estado_nuevo)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El plan no cambió.',
            errores: { estado_nuevo: 'El plan ya está en ese estado.' },
          });
        if (datos.motivo) await motivoDelCambio(db, datos.motivo);
        await db.query(
          'UPDATE convi.planes_intervencion SET estado = $2 WHERE id = $1',
          [planId, datos.estado_nuevo],
        );
        return { id: planId, estado: datos.estado_nuevo };
      },
      'READ COMMITTED',
    );
  }

  // CA2: cada acción tiene descripción, responsable y fecha de vencimiento, y
  // empieza Pendiente. Decisión del PO (por defecto): solo en un plan vigente
  // y con un vencimiento desde hoy.
  agregarAccion(
    sesion: Sesion,
    planId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarNuevaAccion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // FOR SHARE: el plan no termina mientras se le agrega la acción.
        await planVigente(db, planId, 'FOR SHARE');
        const errores: Record<string, string> = {};
        if (await esAnteriorAHoy(db, datos.vence_dia))
          errores.vence_dia =
            'La fecha de vencimiento no puede ser anterior a hoy.';
        if (!(await esResponsableValido(db, datos.persona_responsable_id)))
          errores.persona_responsable_id =
            'Elige a una persona con cuenta activa del equipo de la escuela.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. No se agregó la acción.',
            errores,
          });
        const accion = await db.query<{ id: string }>(
          `INSERT INTO convi.acciones_plan_intervencion
             (establecimiento_id, plan_intervencion_id, descripcion,
              persona_responsable_id, vence_en)
           VALUES (convi.establecimiento_actual(), $1, $2, $3, ${FIN_DEL_DIA('$4')})
           RETURNING id`,
          [
            planId,
            datos.descripcion,
            datos.persona_responsable_id,
            datos.vence_dia,
          ],
        );
        return accion.rows[0];
      },
      'READ COMMITTED',
    );
  }

  // CA3: completar guarda notas y el día de cumplimiento, que no puede ser
  // futuro. Decisión del PO (por defecto): también pasa a En progreso o se
  // cancela con un motivo; una acción completada o cancelada ya no avanza.
  avanzarAccion(
    sesion: Sesion,
    accionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarAvanceAccion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const accion = await accionBloqueada(db, accionId);
        if (accion.version !== datos.version)
          throw new ConflictException(ACCION_DESACTUALIZADA);
        if (!ACCION_ABIERTA.includes(accion.estado))
          throw new ConflictException(
            accion.estado === 'COMPLETADO'
              ? 'La acción ya está completada. Si hay un error, corrígela indicando el motivo.'
              : 'La acción está cancelada y no vuelve a abrirse.',
          );
        if (datos.estado_nuevo === accion.estado)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. La acción no cambió.',
            errores: { estado_nuevo: 'La acción ya está en ese estado.' },
          });
        if (
          datos.completado_dia &&
          (await esPosteriorAHoy(db, datos.completado_dia))
        )
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. La acción no cambió.',
            errores: {
              completado_dia: 'El día de cumplimiento no puede ser futuro.',
            },
          });
        if (datos.motivo) await motivoDelCambio(db, datos.motivo);
        // $2 se usa como estado y en las comparaciones: ::text le da un solo tipo.
        await db.query(
          `UPDATE convi.acciones_plan_intervencion
           SET estado = $2::text,
               notas = CASE WHEN $2::text = 'COMPLETADO' THEN $3 ELSE notas END,
               completado_en = CASE WHEN $2::text = 'COMPLETADO'
                 THEN ${INICIO_DEL_DIA('$4')} ELSE completado_en END
           WHERE id = $1`,
          [accionId, datos.estado_nuevo, datos.notas, datos.completado_dia],
        );
        return { id: accionId, estado: datos.estado_nuevo };
      },
      'READ COMMITTED',
    );
  }

  // CA4: corregir una acción exige motivo y la auditoría conserva el valor
  // anterior y el nuevo. Una acción completada también corrige sus notas y
  // su día de cumplimiento. Decisión del PO (por defecto): una cancelada no
  // se corrige y un vencimiento nuevo no puede ser anterior a hoy.
  corregirAccion(
    sesion: Sesion,
    accionId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const accion = await accionBloqueada(db, accionId);
        const completada = accion.estado === 'COMPLETADO';
        const datos = validarCorreccionAccion(cuerpo, completada);
        if (accion.version !== datos.version)
          throw new ConflictException(ACCION_DESACTUALIZADA);
        if (accion.estado === 'CANCELADO')
          throw new ConflictException(
            'La acción está cancelada: se conserva como quedó y no se corrige.',
          );
        const cambios = {
          descripcion: datos.descripcion !== accion.descripcion,
          responsable:
            datos.persona_responsable_id !== accion.persona_responsable_id,
          vence: datos.vence_dia !== accion.vence_dia,
          notas: completada && datos.notas !== accion.notas,
          cumplido:
            completada && datos.completado_dia !== accion.completado_dia,
        };
        const errores: Record<string, string> = {};
        if (!Object.values(cambios).some(Boolean))
          errores.motivo = 'No cambiaste ningún dato de la acción.';
        if (cambios.vence && (await esAnteriorAHoy(db, datos.vence_dia)))
          errores.vence_dia =
            'La fecha de vencimiento no puede ser anterior a hoy.';
        if (
          cambios.responsable &&
          !(await esResponsableValido(db, datos.persona_responsable_id))
        )
          errores.persona_responsable_id =
            'Elige a una persona con cuenta activa del equipo de la escuela.';
        if (
          cambios.cumplido &&
          datos.completado_dia &&
          (await esPosteriorAHoy(db, datos.completado_dia))
        )
          errores.completado_dia =
            'El día de cumplimiento no puede ser futuro.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. La acción no se corrigió.',
            errores,
          });
        await motivoDelCambio(db, datos.motivo);
        // Solo se reescribe lo que cambió, para que la auditoría muestre
        // exactamente el valor anterior y el nuevo.
        await db.query(
          `UPDATE convi.acciones_plan_intervencion
           SET descripcion = $2, persona_responsable_id = $3,
               vence_en = CASE WHEN $4::boolean THEN ${FIN_DEL_DIA('$5')} ELSE vence_en END,
               notas = CASE WHEN $6::boolean THEN $7 ELSE notas END,
               completado_en = CASE WHEN $8::boolean
                 THEN ${INICIO_DEL_DIA('$9')} ELSE completado_en END
           WHERE id = $1`,
          [
            accionId,
            datos.descripcion,
            datos.persona_responsable_id,
            cambios.vence,
            datos.vence_dia,
            cambios.notas,
            datos.notas,
            cambios.cumplido,
            datos.completado_dia,
          ],
        );
        return { id: accionId };
      },
      'READ COMMITTED',
    );
  }
}

/** El caso existe y sigue abierto; lo bloquea para que no se cierre entretanto. */
async function casoAbierto(
  db: PoolClient,
  casoId: string,
  bloqueo: 'FOR UPDATE' | 'FOR SHARE',
) {
  const caso = await db.query<{ estado_actual: string }>(
    `SELECT estado_actual FROM convi.casos WHERE id = $1 ${bloqueo}`,
    [casoId],
  );
  if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE_CASO);
  if (caso.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(CASO_CERRADO);
}

/**
 * Bloquea el caso (FOR SHARE) y luego el plan, en ese orden para no cruzarse
 * con el cierre del caso, y comprueba que el plan siga vigente.
 */
async function planVigente(
  db: PoolClient,
  planId: string,
  bloqueo: 'FOR UPDATE' | 'FOR SHARE',
): Promise<{ estado: string; version: string }> {
  const caso = await db.query<{ caso_id: string }>(
    'SELECT caso_id FROM convi.planes_intervencion WHERE id = $1',
    [planId],
  );
  if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE_PLAN);
  await casoAbierto(db, caso.rows[0].caso_id, 'FOR SHARE');
  const plan = await db.query<{ estado: string; version: string }>(
    `SELECT p.estado, md5(to_jsonb(p)::text) AS version
     FROM convi.planes_intervencion p WHERE p.id = $1 ${bloqueo}`,
    [planId],
  );
  if (!PLAN_VIGENTE.includes(plan.rows[0].estado))
    throw new ConflictException(PLAN_TERMINADO);
  return plan.rows[0];
}

type AccionActual = {
  estado: string;
  descripcion: string;
  persona_responsable_id: string;
  vence_dia: string;
  notas: string | null;
  completado_dia: string | null;
  version: string;
};

/** Bloquea caso, plan y acción, y devuelve la acción como está guardada. */
async function accionBloqueada(
  db: PoolClient,
  accionId: string,
): Promise<AccionActual> {
  const plan = await db.query<{ plan_intervencion_id: string }>(
    'SELECT plan_intervencion_id FROM convi.acciones_plan_intervencion WHERE id = $1',
    [accionId],
  );
  if (!plan.rows[0]) throw new NotFoundException(NO_EXISTE_ACCION);
  await planVigente(db, plan.rows[0].plan_intervencion_id, 'FOR SHARE');
  const accion = await db.query<AccionActual>(
    `SELECT a.estado, a.descripcion, a.persona_responsable_id, a.notas,
            to_char(a.vence_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD') AS vence_dia,
            to_char(a.completado_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD') AS completado_dia,
            md5(to_jsonb(a)::text) AS version
     FROM convi.acciones_plan_intervencion a WHERE a.id = $1 FOR UPDATE`,
    [accionId],
  );
  return accion.rows[0];
}

/** El motivo queda en la auditoría del cambio (eventos_auditoria). */
async function motivoDelCambio(db: PoolClient, motivo: string) {
  await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [motivo]);
}

async function esAnteriorAHoy(db: PoolClient, dia: string) {
  const fila = await db.query<{ anterior: boolean }>(
    `SELECT $1::date < ${HOY} AS anterior`,
    [dia],
  );
  return fila.rows[0].anterior;
}

async function esPosteriorAHoy(db: PoolClient, dia: string) {
  const fila = await db.query<{ posterior: boolean }>(
    `SELECT $1::date > ${HOY} AS posterior`,
    [dia],
  );
  return fila.rows[0].posterior;
}
