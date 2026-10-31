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
import { FIN_DEL_DIA, HOY, ZONA_ESCUELA } from './plan-intervencion.js';
import {
  PASO_ABIERTO,
  validarAsignacionPaso,
  validarAvancePaso,
  validarCambioEstadoProtocolo,
} from './pasos-protocolo.js';

// PB-055 (HU-048) y PB-056 (HU-049): avance de los pasos del protocolo
// aplicado y término del protocolo. Solo Convivencia activa con segundo
// factor (PB-009); la seguridad por fila separa por escuela y la auditoría
// guarda cada cambio (CA5). Como en el plan de intervención, todo corre en
// READ COMMITTED y se bloquea primero el caso, luego el protocolo y al final
// el paso, para no cruzarse con el cierre del caso.
const PERFILES: Perfil[] = ['CONVIVENCIA'];

const NO_EXISTE_PROTOCOLO = 'El protocolo aplicado no existe.';
const NO_EXISTE_PASO = 'El paso del protocolo no existe.';
const CASO_CERRADO =
  'El caso está cerrado. Un caso cerrado solo se puede reabrir.';
const PROTOCOLO_TERMINADO =
  'El protocolo ya terminó y sus pasos se conservan como quedaron. Para cambiarlos, reabre el protocolo.';
const PASO_CERRADO =
  'El paso ya está completado u omitido y se conserva como quedó.';
// PB-139: el formulario envía la huella de lo que se veía.
const PROTOCOLO_DESACTUALIZADO =
  'Otra persona cambió el protocolo mientras lo mirabas. Recarga la página para verlo antes de continuar.';
const PASO_DESACTUALIZADO =
  'Otra persona cambió el paso mientras lo mirabas. Recarga la página para verlo antes de continuar.';
const NO_CAMBIO = 'Revisa los datos marcados. El paso no cambió.';

@Injectable()
export class PasosProtocoloService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // CA1, CA3 y CA4: el paso pasa a En progreso, se completa guardando quién y
  // cuándo, o se omite con una justificación. Decisión del PO (por defecto):
  // un paso completado u omitido no se reabre.
  avanzarPaso(
    sesion: Sesion,
    pasoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarAvancePaso(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const paso = await pasoBloqueado(db, pasoId);
        if (paso.version !== datos.version)
          throw new ConflictException(PASO_DESACTUALIZADO);
        if (paso.estado === datos.estado_nuevo)
          throw new BadRequestException({
            mensaje: NO_CAMBIO,
            errores: { estado_nuevo: 'El paso ya está en ese estado.' },
          });
        // CA3: la base también lo exige; aquí se avisa junto al campo.
        if (
          datos.estado_nuevo === 'COMPLETADO' &&
          paso.requiere_evidencia &&
          !paso.con_respaldo
        )
          throw new BadRequestException({
            mensaje: NO_CAMBIO,
            errores: {
              estado_nuevo:
                'Este paso exige evidencia: adjunta un archivo al paso antes de completarlo.',
            },
          });
        // $2 se usa como estado y en las comparaciones: ::text le da un solo tipo.
        await db.query(
          `UPDATE convi.estados_pasos_protocolo_caso
           SET estado = $2::text, notas = coalesce($3, notas),
               completado_en = CASE WHEN $2::text = 'COMPLETADO'
                 THEN clock_timestamp() ELSE completado_en END,
               completado_por = CASE WHEN $2::text = 'COMPLETADO'
                 THEN convi.membresia_actual() ELSE completado_por END,
               actualizado_en = clock_timestamp()
           WHERE id = $1`,
          [pasoId, datos.estado_nuevo, datos.notas],
        );
        return { id: pasoId, estado: datos.estado_nuevo };
      },
      'READ COMMITTED',
    );
  }

  // CA1 y CA2: responsable de Convivencia activa y plazo del paso. Decisión
  // del PO (por defecto): un plazo nuevo no puede ser anterior a hoy y un paso
  // con plazo no lo pierde; la auditoría guarda el valor anterior y el nuevo.
  asignarPaso(
    sesion: Sesion,
    pasoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarAsignacionPaso(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const paso = await pasoBloqueado(db, pasoId);
        if (paso.version !== datos.version)
          throw new ConflictException(PASO_DESACTUALIZADO);
        const cambios = {
          responsable: datos.responsable_id !== paso.responsable_id,
          vence: datos.vence_dia !== paso.vence_dia,
        };
        const errores: Record<string, string> = {};
        if (!cambios.responsable && !cambios.vence)
          errores.responsable_id =
            'No cambiaste el responsable ni el plazo del paso.';
        if (
          cambios.responsable &&
          !(await esConvivenciaActiva(db, datos.responsable_id))
        )
          errores.responsable_id =
            'Elige a una persona con cuenta activa de Convivencia.';
        if (cambios.vence && !datos.vence_dia)
          errores.vence_dia =
            'Indica la fecha de vencimiento: un paso con plazo no lo pierde.';
        else if (
          cambios.vence &&
          datos.vence_dia &&
          (await esAnteriorAHoy(db, datos.vence_dia))
        )
          errores.vence_dia =
            'La fecha de vencimiento no puede ser anterior a hoy.';
        if (Object.keys(errores).length > 0)
          throw new BadRequestException({ mensaje: NO_CAMBIO, errores });
        await db.query(
          `UPDATE convi.estados_pasos_protocolo_caso
           SET responsable_id = $2,
               vence_en = CASE WHEN $3::boolean
                 THEN ${FIN_DEL_DIA('$4')} ELSE vence_en END,
               actualizado_en = clock_timestamp()
           WHERE id = $1`,
          [pasoId, datos.responsable_id, cambios.vence, datos.vence_dia],
        );
        return { id: pasoId };
      },
      'READ COMMITTED',
    );
  }

  // HU-049 CA1 a CA4: un protocolo Activo se completa o cancela en cualquier
  // momento, aunque queden pasos pendientes, y uno terminado se reabre. La
  // base exige el motivo, registra la fecha de término y no reemplaza la
  // versión aplicada; el caso sigue abierto.
  cambiarEstadoProtocolo(
    sesion: Sesion,
    protocoloCasoId: string,
    cuerpo: unknown,
  ): Promise<{ id: string; estado: string }> {
    const datos = validarCambioEstadoProtocolo(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const caso = await db.query<{ caso_id: string }>(
          'SELECT caso_id FROM convi.protocolos_caso WHERE id = $1',
          [protocoloCasoId],
        );
        if (!caso.rows[0]) throw new NotFoundException(NO_EXISTE_PROTOCOLO);
        const protocolo = await protocoloBloqueado(
          db,
          caso.rows[0].caso_id,
          protocoloCasoId,
          'FOR UPDATE',
        );
        if (protocolo.version !== datos.version)
          throw new ConflictException(PROTOCOLO_DESACTUALIZADO);
        if (protocolo.estado === datos.estado_nuevo)
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El protocolo no cambió.',
            errores: { estado_nuevo: 'El protocolo ya está en ese estado.' },
          });
        if (protocolo.estado !== 'ACTIVO' && datos.estado_nuevo !== 'ACTIVO')
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados. El protocolo no cambió.',
            errores: {
              estado_nuevo: 'Un protocolo terminado solo se puede reabrir.',
            },
          });
        await db.query("SELECT set_config('app.motivo_cambio', $1, true)", [
          datos.motivo,
        ]);
        await db.query(
          'UPDATE convi.protocolos_caso SET estado = $2 WHERE id = $1',
          [protocoloCasoId, datos.estado_nuevo],
        );
        return { id: protocoloCasoId, estado: datos.estado_nuevo };
      },
      'READ COMMITTED',
    );
  }
}

/**
 * Bloquea el caso (FOR SHARE) y luego el protocolo, en ese orden para no
 * cruzarse con el cierre del caso, y devuelve el protocolo como está guardado.
 */
async function protocoloBloqueado(
  db: PoolClient,
  casoId: string,
  protocoloCasoId: string,
  bloqueo: 'FOR UPDATE' | 'FOR SHARE',
): Promise<{ estado: string; version: string }> {
  const caso = await db.query<{ estado_actual: string }>(
    'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
    [casoId],
  );
  if (caso.rows[0]?.estado_actual === 'CERRADO')
    throw new ConflictException(CASO_CERRADO);
  const protocolo = await db.query<{ estado: string; version: string }>(
    `SELECT pc.estado, md5(to_jsonb(pc)::text) AS version
     FROM convi.protocolos_caso pc WHERE pc.id = $1 ${bloqueo}`,
    [protocoloCasoId],
  );
  return protocolo.rows[0];
}

type PasoActual = {
  estado: string;
  responsable_id: string | null;
  vence_dia: string | null;
  requiere_evidencia: boolean;
  /** Tiene al menos un archivo adjunto al paso (CA3). */
  con_respaldo: boolean;
  version: string;
};

/**
 * Bloquea caso, protocolo y paso, y devuelve el paso como está guardado.
 * Solo avanza un paso abierto de un protocolo Activo.
 */
async function pasoBloqueado(
  db: PoolClient,
  pasoId: string,
): Promise<PasoActual> {
  const ubicacion = await db.query<{
    protocolo_caso_id: string;
    caso_id: string;
  }>(
    `SELECT ep.protocolo_caso_id, pc.caso_id
     FROM convi.estados_pasos_protocolo_caso ep
     JOIN convi.protocolos_caso pc ON pc.id = ep.protocolo_caso_id
     WHERE ep.id = $1`,
    [pasoId],
  );
  if (!ubicacion.rows[0]) throw new NotFoundException(NO_EXISTE_PASO);
  const { caso_id, protocolo_caso_id } = ubicacion.rows[0];
  const protocolo = await protocoloBloqueado(
    db,
    caso_id,
    protocolo_caso_id,
    'FOR SHARE',
  );
  if (protocolo.estado !== 'ACTIVO')
    throw new ConflictException(PROTOCOLO_TERMINADO);
  const paso = await db.query<PasoActual>(
    `SELECT ep.estado, ep.responsable_id, pp.requiere_evidencia,
            to_char(ep.vence_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD') AS vence_dia,
            EXISTS (SELECT 1 FROM convi.evidencias ev
                    WHERE ev.paso_caso_id = ep.id AND ev.archivo_id IS NOT NULL)
              AS con_respaldo,
            md5(to_jsonb(ep)::text) AS version
     FROM convi.estados_pasos_protocolo_caso ep
     JOIN convi.pasos_protocolo pp ON pp.id = ep.paso_protocolo_id
     WHERE ep.id = $1 FOR UPDATE OF ep`,
    [pasoId],
  );
  if (!PASO_ABIERTO.includes(paso.rows[0].estado))
    throw new ConflictException(PASO_CERRADO);
  return paso.rows[0];
}

/** CA2: el responsable de un paso es una cuenta activa de Convivencia. */
async function esConvivenciaActiva(db: PoolClient, membresiaId: string) {
  const cuenta = await db.query(
    `SELECT 1 FROM convi.membresias_establecimiento
     WHERE id = $1 AND codigo_perfil = 'CONVIVENCIA' AND estado = 'ACTIVO'`,
    [membresiaId],
  );
  return (cuenta.rowCount ?? 0) > 0;
}

async function esAnteriorAHoy(db: PoolClient, dia: string) {
  const fila = await db.query<{ anterior: boolean }>(
    `SELECT $1::date < ${HOY} AS anterior`,
    [dia],
  );
  return fila.rows[0].anterior;
}
