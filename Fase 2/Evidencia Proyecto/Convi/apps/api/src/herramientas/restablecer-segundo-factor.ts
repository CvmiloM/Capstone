import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import {
  comprobarCuentaRestablecimiento,
  ejecutarRestablecimiento,
  prepararRestablecimiento,
  validarRestablecimiento,
} from '../modules/cuentas/restablecimiento-segundo-factor.js';

// Solo el operador con credenciales de servidor, nunca desde una ruta HTTP.
// Sin --confirmar se consulta la cuenta, sin modificarla.
const AYUDA = `Recuperar al único administrador activo después de verificar su identidad fuera de CONVI
node apps/api/dist/herramientas/restablecer-segundo-factor.js --cuenta UUID --operador IDENTIFICADOR --medio PRESENCIAL|VIDEOLLAMADA|CANAL_INSTITUCIONAL --motivo TEXTO [--solicitud UUID] [--confirmar]
Conserva el identificador de solicitud para reintentar una operación interrumpida`;

async function main() {
  const argumentos = process.argv.slice(2);
  if (argumentos.includes('--ayuda')) {
    console.log(AYUDA);
    return;
  }
  const valores: Record<string, string> = {};
  let confirmar = false;
  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i];
    if (argumento === '--confirmar') {
      confirmar = true;
      continue;
    }
    if (
      ![
        '--cuenta',
        '--operador',
        '--medio',
        '--motivo',
        '--solicitud',
      ].includes(argumento) ||
      Object.hasOwn(valores, argumento) ||
      !argumentos[i + 1] ||
      argumentos[i + 1].startsWith('--')
    )
      throw new Error(AYUDA);
    valores[argumento] = argumentos[++i];
  }
  const id = (valores['--cuenta'] ?? '').toLowerCase();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    !/^[\p{L}\p{N}_.@+ -]{3,100}$/u.test(valores['--operador'] ?? '')
  )
    throw new Error(AYUDA);
  const solicitud = validarRestablecimiento({
    solicitud_id: valores['--solicitud'] ?? randomUUID(),
    medio: valores['--medio'],
    motivo: valores['--motivo'],
    identidad_verificada: true,
  });
  const conexion = process.env.SUPABASE_DB_URL;
  const url = process.env.SUPABASE_URL;
  const clave =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!conexion || !url || !clave)
    throw new Error(
      'Faltan las variables de servidor SUPABASE_DB_URL, SUPABASE_URL o SUPABASE_SECRET_KEY',
    );
  const db = new Client({ connectionString: conexion });
  const auth = createClient(url, clave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (entrada, opciones) =>
        fetch(entrada, { ...opciones, signal: AbortSignal.timeout(10000) }),
    },
  });
  await db.connect();
  try {
    const permiso = await db.query<{ permitido: boolean }>(
      'SELECT rolsuper OR rolbypassrls AS permitido FROM pg_roles WHERE rolname = current_user',
    );
    if (!permiso.rows[0]?.permitido)
      throw new Error(
        'Esta herramienta requiere la conexión operativa autorizada, no modifica roles ni permisos',
      );
    const fila = await db.query<{ establecimiento_id: string }>(
      'SELECT establecimiento_id FROM convi.membresias_establecimiento WHERE id = $1',
      [id],
    );
    if (!fila.rows[0]) throw new Error('La cuenta no existe');
    const contexto = {
      escuela: fila.rows[0].establecimiento_id,
      actor: null,
      operador: valores['--operador'],
    };
    await db.query('BEGIN');
    await comprobarCuentaRestablecimiento(db, id, contexto);
    await db.query('ROLLBACK');
    console.log(
      `Cuenta: ${id}\nEscuela: ${contexto.escuela}\nSolicitud: ${solicitud.solicitud_id}`,
    );
    if (!confirmar) {
      console.log(
        'Solo consulta, no se modificó el autenticador, agrega --confirmar tras verificar la identidad',
      );
      return;
    }
    await db.query('BEGIN');
    await prepararRestablecimiento(db, auth, id, solicitud, contexto);
    await db.query('COMMIT');
    await db.query('BEGIN');
    await ejecutarRestablecimiento(db, auth, id, solicitud, contexto);
    await db.query('COMMIT');
    console.log(
      'Restablecimiento completado y auditado, la persona debe iniciar sesión y configurar una nueva aplicación autenticadora',
    );
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  // No imprimir errores de conexión o de Auth que puedan incluir credenciales.
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'No se pudo completar la operación, conserva la solicitud y revisa la conexión de servidor',
  );
  process.exitCode = 1;
});
