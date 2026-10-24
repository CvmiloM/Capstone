import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CuentaPlan } from './plan.js';

// PB-159: identidades de Supabase Auth del personal sintético. Toda cuenta
// activa del modelo tiene una (membresia_activada_completa). Se crean con el
// mismo id del plan, así la semilla también fija las identidades.

export function clienteAdministrador(
  url: string,
  clave: string,
): SupabaseClient {
  return createClient(url, clave, {
    // Cliente del servidor: no guarda ni renueva sesiones de personas.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Crea las identidades confirmadas. Solo las cuentas con acceso reciben la
 * clave, las demás no pueden iniciar sesión. Va dejando en creadas lo que
 * alcanzó a crear, para poder deshacerlo si algo falla.
 */
export async function crearIdentidades(
  cliente: SupabaseClient,
  cuentas: CuentaPlan[],
  clave: string | null,
  creadas: string[],
): Promise<void> {
  for (const cuenta of cuentas) {
    const { error } = await cliente.auth.admin.createUser({
      id: cuenta.id,
      email: cuenta.correo,
      email_confirm: true,
      ...(cuenta.conAcceso && clave ? { password: clave } : {}),
      user_metadata: { nombre: cuenta.nombre, sintetico: true },
    });
    if (error)
      throw new Error(
        `No se pudo crear la cuenta ${cuenta.correo}: ${error.message}`,
      );
    creadas.push(cuenta.id);
  }
}

/** Borra identidades y devuelve las que no se pudieron borrar. */
export async function borrarIdentidades(
  cliente: SupabaseClient,
  ids: string[],
): Promise<string[]> {
  const fallidas: string[] = [];
  for (const id of ids) {
    const { error } = await cliente.auth.admin.deleteUser(id);
    if (error && error.status !== 404) fallidas.push(id);
  }
  return fallidas;
}
