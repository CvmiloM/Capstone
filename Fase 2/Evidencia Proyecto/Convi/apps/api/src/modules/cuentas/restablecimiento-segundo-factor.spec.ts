import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ejecutarRestablecimiento,
  prepararRestablecimiento,
  validarRestablecimiento,
} from './restablecimiento-segundo-factor.js';

const id = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const escuela = '33333333-3333-4333-8333-333333333333';
const solicitud = {
  solicitud_id: '44444444-4444-4444-8444-444444444444',
  identidad_verificada: true as const,
  medio: 'PRESENCIAL',
  motivo: 'Perdió el teléfono',
};
const contexto = { escuela, actor };
const cuenta = {
  id,
  establecimiento_id: escuela,
  auth_usuario_id: 'auth-prueba',
  codigo_perfil: 'CONVIVENCIA',
  estado: 'ACTIVO',
};

function entorno(
  opciones: {
    propia?: boolean;
    perfil?: string;
    estado?: string;
    solicitada?: boolean;
    terminada?: boolean;
    nuevo?: boolean;
    fallaBorrado?: boolean;
    fallaRegistro?: boolean;
  } = {},
) {
  const orden: string[] = [];
  const guardada = {
    recurso_id: id,
    membresia_actor_id: actor,
    desde: 100,
    metadatos: {
      medio: solicitud.medio,
      motivo: solicitud.motivo,
      factores: ['anterior'],
      auth_usuario_id: cuenta.auth_usuario_id,
    },
  };
  const query = vi.fn(async (sql: string, valores?: unknown[]) => {
    orden.push(sql.startsWith('INSERT') ? 'auditoria' : 'lectura');
    if (sql.startsWith('INSERT') && opciones.fallaRegistro)
      throw new Error('Registro no disponible');
    if (sql.includes('FROM convi.membresias_establecimiento'))
      return {
        rows: [
          {
            ...cuenta,
            id: opciones.propia ? actor : id,
            codigo_perfil: opciones.perfil ?? cuenta.codigo_perfil,
            estado: opciones.estado ?? cuenta.estado,
          },
        ],
        rowCount: 1,
      };
    if (
      sql.includes('WHERE id = $1 AND establecimiento_id = $2') &&
      sql.includes('eventos_auditoria')
    )
      return {
        rows: opciones.solicitada ? [guardada] : [],
        rowCount: opciones.solicitada ? 1 : 0,
      };
    if (sql.includes('clock_timestamp'))
      return { rows: [{ ahora: 110 }], rowCount: 1 };
    if (sql.includes("codigo_accion = 'MFA_RESTABLECIDO'"))
      return {
        rows: opciones.terminada ? [{ id }] : [],
        rowCount: opciones.terminada ? 1 : 0,
      };
    return { rows: [], rowCount: 1, valores };
  });
  const getUserById = vi.fn(async () => ({
    data: {
      user: {
        app_metadata: { provider: 'email' },
        factors: [
          { id: 'anterior', factor_type: 'totp', status: 'verified' },
          ...(opciones.nuevo
            ? [{ id: 'nuevo', factor_type: 'totp', status: 'verified' }]
            : []),
        ],
      },
    },
    error: null,
  }));
  const updateUserById = vi.fn(async () => {
    orden.push('marca-auth');
    return { error: null };
  });
  const deleteFactor = vi.fn(async () => {
    orden.push('borrado-auth');
    return { error: opciones.fallaBorrado ? { status: 503 } : null };
  });
  const auth = {
    auth: { admin: { getUserById, updateUserById, mfa: { deleteFactor } } },
  } as unknown as SupabaseClient;
  return {
    db: { query } as unknown as PoolClient,
    query,
    auth,
    getUserById,
    updateUserById,
    deleteFactor,
    orden,
  };
}

describe('PB-154, restablecimiento verificado y recuperable', () => {
  it('recorta el motivo y conserva solo los campos aprobados', () => {
    expect(
      validarRestablecimiento({
        ...solicitud,
        motivo: '  Perdió el teléfono  ',
      }),
    ).toEqual(solicitud);
  });
  it.each([
    null,
    [],
    {},
    { ...solicitud, identidad_verificada: false },
    { ...solicitud, medio: '' },
    { ...solicitud, motivo: ' ' },
    { ...solicitud, motivo: 'x'.repeat(501) },
    { ...solicitud, solicitud_id: 'inventada' },
    { ...solicitud, operador: 'suplantado' },
    { ...solicitud, establecimiento_id: escuela },
  ])('rechaza datos no confiables %j', (datos) => {
    expect(() => validarRestablecimiento(datos)).toThrow();
  });
  it.each([
    { propia: true },
    { perfil: 'PROFESOR' },
    { perfil: 'APODERADO' },
    { estado: 'SUSPENDIDO' },
    { estado: 'PENDIENTE' },
  ])('rechaza cuenta no autorizada %j', async (opciones) => {
    const e = entorno(opciones);
    await expect(
      prepararRestablecimiento(e.db, e.auth, id, solicitud, contexto),
    ).rejects.toThrow();
    expect(e.getUserById).not.toHaveBeenCalled();
    expect(e.deleteFactor).not.toHaveBeenCalled();
  });
  it('preparar registra la intención sin cambiar Auth', async () => {
    const e = entorno();
    await prepararRestablecimiento(e.db, e.auth, id, solicitud, contexto);
    expect(e.orden.at(-1)).toBe('auditoria');
    expect(e.updateUserById).not.toHaveBeenCalled();
    expect(e.deleteFactor).not.toHaveBeenCalled();
  });
  it('si falla registrar la solicitud no modifica Auth', async () => {
    const e = entorno({ fallaRegistro: true });
    await expect(
      prepararRestablecimiento(e.db, e.auth, id, solicitud, contexto),
    ).rejects.toThrow();
    expect(e.updateUserById).not.toHaveBeenCalled();
  });
  it('no ejecuta sin una solicitud previamente guardada', async () => {
    const e = entorno();
    await expect(
      ejecutarRestablecimiento(e.db, e.auth, id, solicitud, contexto),
    ).rejects.toThrow();
    expect(e.updateUserById).not.toHaveBeenCalled();
  });
  it('bloquea sesiones antiguas antes del borrado y registra el resultado después', async () => {
    const e = entorno({ solicitada: true });
    await ejecutarRestablecimiento(e.db, e.auth, id, solicitud, contexto);
    expect(e.orden.indexOf('marca-auth')).toBeLessThan(
      e.orden.indexOf('borrado-auth'),
    );
    expect(e.orden.at(-1)).toBe('auditoria');
    expect(e.updateUserById).toHaveBeenCalledWith(cuenta.auth_usuario_id, {
      app_metadata: {
        provider: 'email',
        convi_restablecimiento_mfa: {
          desde: 110,
          solicitud_id: solicitud.solicitud_id,
        },
      },
    });
  });
  it('un reintento completado no toca factores nuevos ni cambia la marca', async () => {
    const e = entorno({ solicitada: true, terminada: true, nuevo: true });
    expect(
      await ejecutarRestablecimiento(e.db, e.auth, id, solicitud, contexto),
    ).toEqual({ id, restablecido: true });
    expect(e.getUserById).not.toHaveBeenCalled();
    expect(e.deleteFactor).not.toHaveBeenCalled();
  });
  it('solo borra los factores incluidos en la solicitud', async () => {
    const e = entorno({ solicitada: true, nuevo: true });
    await ejecutarRestablecimiento(e.db, e.auth, id, solicitud, contexto);
    expect(e.deleteFactor).toHaveBeenCalledTimes(1);
    expect(e.deleteFactor).toHaveBeenCalledWith({
      id: 'anterior',
      userId: cuenta.auth_usuario_id,
    });
  });
  it('un fallo de Auth no deja un resultado exitoso', async () => {
    const e = entorno({ solicitada: true, fallaBorrado: true });
    await expect(
      ejecutarRestablecimiento(e.db, e.auth, id, solicitud, contexto),
    ).rejects.toThrow('pendiente');
    expect(e.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
      false,
    );
  });
});
