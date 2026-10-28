import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientBase } from 'pg';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEDIOS_IDENTIDAD = [
  'PRESENCIAL',
  'VIDEOLLAMADA',
  'CANAL_INSTITUCIONAL',
] as const;
export type SolicitudRestablecimiento = {
  solicitud_id: string;
  identidad_verificada: true;
  medio: string;
  motivo: string;
};
export type ContextoRestablecimiento = {
  escuela: string;
  actor: string | null;
  operador?: string;
};
type Cuenta = {
  id: string;
  auth_usuario_id: string;
  codigo_perfil: string;
  estado: string;
  establecimiento_id: string;
};
type SolicitudGuardada = {
  recurso_id: string;
  membresia_actor_id: string | null;
  desde: number;
  metadatos: {
    medio: string;
    motivo: string;
    operador?: string;
    factores: string[];
    auth_usuario_id: string;
  };
};

export function validarRestablecimiento(
  entrada: unknown,
): SolicitudRestablecimiento {
  const d = entrada as Record<string, unknown> | null;
  if (
    !d ||
    Array.isArray(d) ||
    Object.keys(d).some(
      (k) =>
        !['solicitud_id', 'identidad_verificada', 'medio', 'motivo'].includes(
          k,
        ),
    ) ||
    typeof d.solicitud_id !== 'string' ||
    !UUID.test(d.solicitud_id) ||
    d.identidad_verificada !== true ||
    typeof d.medio !== 'string' ||
    !(MEDIOS_IDENTIDAD as readonly string[]).includes(d.medio) ||
    typeof d.motivo !== 'string' ||
    !d.motivo.trim() ||
    d.motivo.trim().length > 500
  ) {
    throw new BadRequestException(
      'Confirma la identidad por un medio acordado e indica el motivo, hasta 500 caracteres',
    );
  }
  return {
    solicitud_id: d.solicitud_id.toLowerCase(),
    identidad_verificada: true,
    medio: d.medio,
    motivo: d.motivo.trim(),
  };
}

export async function comprobarCuentaRestablecimiento(
  db: ClientBase,
  id: string,
  contexto: ContextoRestablecimiento,
) {
  const { rows } = await db.query<Cuenta>(
    `SELECT id, auth_usuario_id, codigo_perfil, estado, establecimiento_id
     FROM convi.membresias_establecimiento WHERE id = $1 AND establecimiento_id = $2 FOR UPDATE`,
    [id, contexto.escuela],
  );
  const cuenta = rows[0];
  if (!cuenta) throw new NotFoundException('La cuenta no existe');
  if (cuenta.id === contexto.actor)
    throw new ForbiddenException(
      'Otro administrador debe verificar tu identidad y restablecer tu segundo factor',
    );
  if (
    cuenta.estado !== 'ACTIVO' ||
    !cuenta.auth_usuario_id ||
    !['ADMIN', 'CONVIVENCIA'].includes(cuenta.codigo_perfil)
  )
    throw new ConflictException(
      'Solo se restablece el segundo factor de cuentas activas de Administración o Convivencia',
    );
  if (!contexto.actor) {
    const administradores = await db.query<{ id: string }>(
      `SELECT id FROM convi.membresias_establecimiento WHERE establecimiento_id = $1 AND codigo_perfil = 'ADMIN' AND estado = 'ACTIVO'`,
      [contexto.escuela],
    );
    if (
      !contexto.operador ||
      cuenta.codigo_perfil !== 'ADMIN' ||
      administradores.rows.length !== 1 ||
      administradores.rows[0].id !== id
    )
      throw new ForbiddenException(
        'La herramienta operativa solo recupera al único administrador activo, los demás casos los atiende otro administrador desde CONVI',
      );
    const escuela = await db.query(
      "SELECT id FROM convi.establecimientos WHERE id = $1 AND estado = 'ACTIVO'",
      [contexto.escuela],
    );
    if (!escuela.rowCount)
      throw new ForbiddenException('El establecimiento no está activo');
  }
  return cuenta;
}

async function leerSolicitud(
  db: ClientBase,
  id: string,
  solicitud: SolicitudRestablecimiento,
  contexto: ContextoRestablecimiento,
) {
  const { rows } = await db.query<SolicitudGuardada>(
    `SELECT recurso_id, membresia_actor_id, floor(extract(epoch FROM ocurrido_en))::bigint::float8 AS desde, metadatos
     FROM convi.eventos_auditoria WHERE id = $1 AND establecimiento_id = $2
       AND codigo_accion = 'MFA_RESTABLECIMIENTO_SOLICITADO' AND tipo_recurso = 'membresias_establecimiento'`,
    [solicitud.solicitud_id, contexto.escuela],
  );
  const guardada = rows[0];
  if (
    guardada &&
    (guardada.recurso_id !== id ||
      guardada.membresia_actor_id !== contexto.actor ||
      guardada.metadatos.operador !== contexto.operador ||
      guardada.metadatos.medio !== solicitud.medio ||
      guardada.metadatos.motivo !== solicitud.motivo)
  )
    throw new ConflictException(
      'Esta solicitud ya corresponde a otra confirmación, actualiza la página',
    );
  return guardada;
}

export async function prepararRestablecimiento(
  db: ClientBase,
  auth: SupabaseClient,
  id: string,
  solicitud: SolicitudRestablecimiento,
  contexto: ContextoRestablecimiento,
) {
  const cuenta = await comprobarCuentaRestablecimiento(db, id, contexto);
  if (await leerSolicitud(db, id, solicitud, contexto)) return;
  const { data, error } = await auth.auth.admin.getUserById(
    cuenta.auth_usuario_id,
  );
  if (error || !data.user)
    throw new ServiceUnavailableException(
      'No pudimos comprobar el autenticador, inténtalo nuevamente',
    );
  const factores = data.user.factors ?? [];
  if (factores.some((f) => f.status === 'verified' && f.factor_type !== 'totp'))
    throw new ConflictException(
      'Esta cuenta usa otro tipo de autenticación, solicita una revisión al operador de CONVI',
    );
  if (!factores.some((f) => f.status === 'verified'))
    throw new ConflictException(
      'Esta cuenta todavía no tiene un segundo factor verificado',
    );
  // La solicitud se confirma en su propia transacción ANTES de modificar Auth.
  await db.query(
    `INSERT INTO convi.eventos_auditoria(id, establecimiento_id, membresia_actor_id, codigo_accion,
       tipo_recurso, recurso_id, codigo_resultado, solicitud_id, metadatos)
     VALUES($1,$2,$3,'MFA_RESTABLECIMIENTO_SOLICITADO','membresias_establecimiento',$4,'PENDIENTE',$1,$5)`,
    [
      solicitud.solicitud_id,
      contexto.escuela,
      contexto.actor,
      id,
      JSON.stringify({
        medio: solicitud.medio,
        motivo: solicitud.motivo,
        canal: contexto.actor ? 'ADMIN' : 'OPERACION',
        ...(contexto.operador ? { operador: contexto.operador } : {}),
        auth_usuario_id: cuenta.auth_usuario_id,
        factores: factores
          .filter((f) => f.factor_type === 'totp')
          .map((f) => f.id),
      }),
    ],
  );
}

export async function ejecutarRestablecimiento(
  db: ClientBase,
  auth: SupabaseClient,
  id: string,
  solicitud: SolicitudRestablecimiento,
  contexto: ContextoRestablecimiento,
) {
  const cuenta = await comprobarCuentaRestablecimiento(db, id, contexto);
  const guardada = await leerSolicitud(db, id, solicitud, contexto);
  if (
    !guardada ||
    guardada.metadatos.auth_usuario_id !== cuenta.auth_usuario_id
  )
    throw new ConflictException(
      'No se encontró una solicitud válida para esta cuenta',
    );
  const realizado = await db.query(
    `SELECT id FROM convi.eventos_auditoria WHERE solicitud_id = $1 AND establecimiento_id = $2
       AND recurso_id = $3 AND codigo_accion = 'MFA_RESTABLECIDO' AND codigo_resultado = 'OK'`,
    [solicitud.solicitud_id, contexto.escuela, id],
  );
  if (realizado.rowCount) return { id, restablecido: true };
  const { data, error } = await auth.auth.admin.getUserById(
    cuenta.auth_usuario_id,
  );
  if (error || !data.user)
    throw new ServiceUnavailableException(
      'No pudimos confirmar el restablecimiento, reintenta esta misma solicitud',
    );
  const anterior = data.user.app_metadata.convi_restablecimiento_mfa as
    { desde?: number; solicitud_id?: string } | undefined;
  if (
    anterior &&
    (typeof anterior.desde !== 'number' ||
      (anterior.solicitud_id !== solicitud.solicitud_id &&
        anterior.desde > guardada.desde))
  )
    throw new ConflictException(
      'Hay un restablecimiento posterior, actualiza la página antes de continuar',
    );
  const reloj = await db.query<{ ahora: number }>(
    'SELECT floor(extract(epoch FROM clock_timestamp()))::bigint::float8 AS ahora',
  );
  const desde =
    anterior?.solicitud_id === solicitud.solicitud_id
      ? anterior.desde
      : reloj.rows[0].ahora;
  // La API lee esta marca actual y rechaza también tokens antiguos renovados.
  const actualizado = await auth.auth.admin.updateUserById(
    cuenta.auth_usuario_id,
    {
      app_metadata: {
        ...data.user.app_metadata,
        convi_restablecimiento_mfa: {
          desde,
          solicitud_id: solicitud.solicitud_id,
        },
      },
    },
  );
  if (actualizado.error)
    throw new ServiceUnavailableException(
      'No pudimos confirmar el restablecimiento, reintenta esta misma solicitud',
    );
  for (const factor of guardada.metadatos.factores) {
    if (!data.user.factors?.some((f) => f.id === factor)) continue;
    const eliminado = await auth.auth.admin.mfa.deleteFactor({
      id: factor,
      userId: cuenta.auth_usuario_id,
    });
    if (eliminado.error && eliminado.error.status !== 404)
      throw new ServiceUnavailableException(
        'El restablecimiento quedó pendiente, reintenta esta misma solicitud para completarlo',
      );
  }
  // Un reintento nunca elimina un autenticador nuevo que no estuviera en la solicitud.
  await db.query(
    `INSERT INTO convi.eventos_auditoria(establecimiento_id, membresia_actor_id, codigo_accion,
       tipo_recurso, recurso_id, codigo_resultado, solicitud_id, metadatos)
     VALUES($1,$2,'MFA_RESTABLECIDO','membresias_establecimiento',$3,'OK',$4,$5)`,
    [
      contexto.escuela,
      contexto.actor,
      id,
      solicitud.solicitud_id,
      JSON.stringify({
        medio: solicitud.medio,
        motivo: solicitud.motivo,
        canal: contexto.actor ? 'ADMIN' : 'OPERACION',
        ...(contexto.operador ? { operador: contexto.operador } : {}),
      }),
    ],
  );
  return { id, restablecido: true };
}
