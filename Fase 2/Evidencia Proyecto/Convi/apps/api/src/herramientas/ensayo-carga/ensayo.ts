import { createHmac, randomBytes } from 'node:crypto';
import { cpus, totalmem, type as sistema, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

// PB-131 (HU-112) y PB-137 (HU-117): ensayo de carga de las consultas de
// historial sin IA y de la integridad de los datos con el volumen del piloto.
// Usa las dos escuelas del generador de datos sintéticos (PB-159, HU-112 CA2)
// y sesiones reales de Convivencia con segundo factor contra la API.
//
// Se corre dentro del contenedor de la API, que ya tiene las variables:
//   docker compose exec api node apps/api/dist/herramientas/ensayo-carga/ensayo.js
//
// Solo en la base local. Para tener sesiones con segundo factor le pone a la
// cuenta de Convivencia de cada escuela sintética una clave aleatoria que no
// se muestra y un factor TOTP del ensayo, y al terminar borra ese factor y
// deja otra clave aleatoria que nadie conoce. Las consultas son de lectura.

type Opciones = {
  semilla: string;
  sesiones: number;
  consultas: number;
  limiteMs: number;
  api: string;
};

const AYUDA = `Ensayo de carga de CONVI (PB-131 y PB-137)

Mide las consultas de historial sin IA con sesiones reales de Convivencia y
compara los conteos de las escuelas sintéticas antes y después.

  --semilla <texto>     Semilla de las escuelas sintéticas (por defecto 2026)
  --sesiones <número>   Sesiones concurrentes (por defecto 20)
  --consultas <número>  Consultas por sesión (por defecto 100)
  --limite-ms <número>  Tiempo máximo esperado por consulta (por defecto 3000)
  --api <url>           API a medir (por defecto http://localhost:3001)
  --ayuda               Muestra este texto`;

function leerOpciones(argumentos: string[]): Opciones | null {
  const o: Opciones = {
    semilla: '2026',
    sesiones: 20,
    consultas: 100,
    limiteMs: 3000,
    api: 'http://localhost:3001',
  };
  for (let i = 0; i < argumentos.length; i++) {
    const a = argumentos[i];
    const valor = () => {
      const v = argumentos[++i];
      if (v === undefined) throw new Error(`Falta el valor de ${a}`);
      return v;
    };
    const entero = (min: number, max: number) => {
      const v = Number(valor());
      if (!Number.isInteger(v) || v < min || v > max)
        throw new Error(`${a} va de ${min} a ${max}`);
      return v;
    };
    if (a === '--ayuda' || a === '-h') return null;
    else if (a === '--semilla') o.semilla = valor();
    else if (a === '--sesiones') o.sesiones = entero(1, 200);
    else if (a === '--consultas') o.consultas = entero(1, 10_000);
    else if (a === '--limite-ms') o.limiteMs = entero(100, 60_000);
    else if (a === '--api') o.api = valor().replace(/\/+$/, '');
    else throw new Error(`No conozco la opción ${a}`);
  }
  if (!/^[A-Za-z0-9-]{1,20}$/.test(o.semilla))
    throw new Error('La semilla usa de 1 a 20 letras, números o guiones');
  return o;
}

const LOCALES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
  'kong',
  'db',
]);

function esLocal(direccion: string) {
  try {
    const servidor = new URL(direccion).hostname.toLowerCase();
    return (
      LOCALES.has(servidor) ||
      servidor.startsWith('supabase_') ||
      servidor.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

function variable(nombre: string, ...alternativas: string[]) {
  for (const n of [nombre, ...alternativas])
    if (process.env[n]) return process.env[n]!;
  throw new Error(`Falta la variable ${nombre} en el contenedor de la API.`);
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238), para verificar el segundo factor del ensayo
// ---------------------------------------------------------------------------

function base32(texto: string) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of texto.replace(/=+$/, '').toUpperCase())
    bits += alfabeto.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codigoTotp(secreto: string, momento = Date.now()) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(Math.floor(momento / 30_000)));
  const hmac = createHmac('sha1', base32(secreto)).update(contador).digest();
  const desde = hmac[hmac.length - 1] & 0xf;
  const numero = (hmac.readUInt32BE(desde) & 0x7fffffff) % 1_000_000;
  return numero.toString().padStart(6, '0');
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Datos de las escuelas sintéticas
// ---------------------------------------------------------------------------

type Escuela = {
  id: string;
  codigo: string;
  auth_usuario_id: string;
  correo: string;
};

type Muestra = {
  estudiantes: string[];
  apellidos: string[];
  casos: string[];
  codigos: string[];
};

/** Tablas que se cuentan por escuela antes y después (HU-117 CA1). */
const TABLAS = [
  'estudiantes',
  'personas',
  'matriculas',
  'cursos',
  'situaciones',
  'participaciones',
  'revisiones_convivencia',
  'casos',
  'historial_estados_caso',
  'actuaciones',
  'compromisos',
] as const;

/**
 * Una cuenta de Convivencia sintética por escuela, que no sea la de acceso
 * (convivencia@): esa pudo recibir una clave con --clave-convivencia y el
 * ensayo no la cambia. Las otras nunca tuvieron una clave conocida.
 */
async function escuelasSinteticas(db: pg.Client, semilla: string) {
  const { rows } = await db.query<Escuela>(
    `SELECT DISTINCT ON (e.codigo) e.id, e.codigo, m.auth_usuario_id, u.email AS correo
     FROM convi.establecimientos e
     JOIN convi.membresias_establecimiento m
       ON m.establecimiento_id = e.id AND m.codigo_perfil = 'CONVIVENCIA'
      AND m.estado = 'ACTIVO' AND m.auth_usuario_id IS NOT NULL
     JOIN auth.users u ON u.id = m.auth_usuario_id
     WHERE e.codigo LIKE $1 AND u.email NOT LIKE 'convivencia@%'
       AND coalesce((u.raw_user_meta_data->>'sintetico')::boolean, false)
     ORDER BY e.codigo, u.email`,
    [`SINTETICA-${semilla}-%`],
  );
  return rows;
}

async function contar(db: pg.Client) {
  const consultas = TABLAS.map(
    (t) =>
      `SELECT '${t}' AS tabla, establecimiento_id::text AS escuela, count(*)::int AS n FROM convi.${t} GROUP BY 2`,
  ).join(' UNION ALL ');
  const { rows } = await db.query<{
    tabla: string;
    escuela: string;
    n: number;
  }>(consultas);
  const conteo: Record<string, Record<string, number>> = {};
  for (const r of rows) (conteo[r.escuela] ??= {})[r.tabla] = r.n;
  return conteo;
}

/**
 * Relaciones que cruzarían escuelas: participaciones de personas, casos de
 * situaciones y matrículas de estudiantes de otra escuela. Deben ser cero.
 */
async function cruces(db: pg.Client) {
  const { rows } = await db.query<{ revision: string; n: number }>(
    `SELECT 'participacion con persona de otra escuela' AS revision, count(*)::int AS n
       FROM convi.participaciones pa JOIN convi.personas p ON p.id = pa.persona_id
      WHERE pa.establecimiento_id <> p.establecimiento_id
     UNION ALL
     SELECT 'situacion en caso de otra escuela', count(*)::int
       FROM convi.situaciones s JOIN convi.casos c ON c.id = s.caso_id
      WHERE s.establecimiento_id <> c.establecimiento_id
     UNION ALL
     SELECT 'matricula con estudiante de otra escuela', count(*)::int
       FROM convi.matriculas m JOIN convi.estudiantes e ON e.id = m.estudiante_id
      WHERE m.establecimiento_id <> e.establecimiento_id
     UNION ALL
     SELECT 'matricula en curso de otra escuela', count(*)::int
       FROM convi.matriculas m JOIN convi.cursos c ON c.id = m.curso_id
      WHERE m.establecimiento_id <> c.establecimiento_id`,
  );
  return rows;
}

async function muestra(db: pg.Client, escuela: string): Promise<Muestra> {
  const lista = async (sql: string) =>
    (await db.query<{ v: string }>(sql, [escuela])).rows.map((r) => r.v);
  return {
    estudiantes: await lista(
      `SELECT id::text AS v FROM convi.estudiantes WHERE establecimiento_id = $1 ORDER BY md5(id::text) LIMIT 300`,
    ),
    apellidos: await lista(
      `SELECT DISTINCT split_part(p.apellidos, ' ', 1) AS v FROM convi.estudiantes e
       JOIN convi.personas p ON p.id = e.persona_id WHERE e.establecimiento_id = $1 LIMIT 60`,
    ),
    casos: await lista(
      `SELECT id::text AS v FROM convi.casos WHERE establecimiento_id = $1 ORDER BY md5(id::text) LIMIT 300`,
    ),
    codigos: await lista(
      `SELECT codigo AS v FROM convi.situaciones WHERE establecimiento_id = $1 ORDER BY md5(id::text) LIMIT 300`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Sesiones con segundo factor
// ---------------------------------------------------------------------------

function cliente(url: string, clave: string): SupabaseClient {
  return createClient(url, clave, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/** Inicia sesión y verifica el TOTP, con reintento si el código ya se usó. */
async function sesionAal2(
  url: string,
  clavePublica: string,
  correo: string,
  clave: string,
  factor: { id: string; secreto: string },
): Promise<string> {
  for (let intento = 0; intento < 4; intento++) {
    const c = cliente(url, clavePublica);
    const ingreso = await c.auth.signInWithPassword({
      email: correo,
      password: clave,
    });
    if (ingreso.error)
      throw new Error(`No se pudo iniciar sesión: ${ingreso.error.message}`);
    const verificado = await c.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: codigoTotp(factor.secreto),
    });
    if (!verificado.error) return verificado.data.access_token;
    // Un código TOTP no siempre se acepta dos veces: se espera el siguiente.
    await esperar(31_000 - (Date.now() % 30_000));
  }
  throw new Error('No se pudo verificar el segundo factor del ensayo');
}

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

type Medida = { tipo: string; ruta: string; ms: number; estado: number };

function azar(semilla: number) {
  let s = semilla >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function consultas(m: Muestra, cantidad: number, semilla: number) {
  const r = azar(semilla);
  const uno = <T>(lista: T[]) => lista[Math.floor(r() * lista.length)];
  const salida: { tipo: string; ruta: string }[] = [];
  for (let i = 0; i < cantidad; i++) {
    const x = r();
    if (x < 0.35)
      salida.push({
        tipo: 'historial de estudiante',
        ruta: `/convivencia/estudiantes/${uno(m.estudiantes)}/historial`,
      });
    else if (x < 0.55)
      salida.push({
        tipo: 'buscar estudiante',
        ruta: `/convivencia/estudiantes?buscar=${encodeURIComponent(uno(m.apellidos))}`,
      });
    else if (x < 0.75)
      salida.push({
        tipo: 'buscar expedientes',
        ruta:
          r() < 0.5
            ? `/convivencia/expedientes?estudiante=${encodeURIComponent(uno(m.apellidos))}`
            : `/convivencia/expedientes?codigo=${encodeURIComponent(uno(m.codigos))}`,
      });
    else
      salida.push({
        tipo: 'historial de caso',
        ruta: `/convivencia/casos/${uno(m.casos)}/historial`,
      });
  }
  return salida;
}

async function pedir(api: string, token: string, ruta: string) {
  const inicio = performance.now();
  const respuesta = await fetch(`${api}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await respuesta.arrayBuffer();
  return { ms: performance.now() - inicio, estado: respuesta.status };
}

function percentil(valores: number[], p: number) {
  if (valores.length === 0) return 0;
  const orden = [...valores].sort((a, b) => a - b);
  return orden[
    Math.min(orden.length - 1, Math.ceil((p / 100) * orden.length) - 1)
  ];
}

function resumen(medidas: Medida[], limite: number) {
  const ms = medidas.map((m) => m.ms);
  const dentro = ms.filter((v) => v <= limite).length;
  return {
    consultas: medidas.length,
    errores: medidas.filter((m) => m.estado !== 200).length,
    p50_ms: Math.round(percentil(ms, 50)),
    p95_ms: Math.round(percentil(ms, 95)),
    p99_ms: Math.round(percentil(ms, 99)),
    maximo_ms: Math.round(Math.max(0, ...ms)),
    dentro_del_limite: `${((dentro * 100) / Math.max(1, ms.length)).toFixed(1)} %`,
  };
}

// ---------------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------------

async function principal(): Promise<number> {
  const opciones = leerOpciones(process.argv.slice(2));
  if (!opciones) {
    console.log(AYUDA);
    return 0;
  }
  const urlBase = variable('SUPABASE_DB_URL');
  const urlSupabase = variable('SUPABASE_URL');
  const clavePublica = variable(
    'SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  );
  const claveServicio = variable(
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  );
  if (!esLocal(urlBase) || !esLocal(urlSupabase) || !esLocal(opciones.api)) {
    console.error(
      'El ensayo solo corre contra la base, Supabase y la API locales.',
    );
    return 1;
  }

  const db = new pg.Client({ connectionString: urlBase });
  await db.connect();
  const admin = cliente(urlSupabase, claveServicio);
  const escuelas = await escuelasSinteticas(db, opciones.semilla);
  if (escuelas.length < 2) {
    console.error(
      `No están las dos escuelas sintéticas de la semilla ${opciones.semilla}: corre primero el generador.`,
    );
    await db.end();
    return 1;
  }

  const antes = await contar(db);
  const crucesAntes = await cruces(db);
  const muestras = new Map<string, Muestra>();
  for (const e of escuelas) muestras.set(e.id, await muestra(db, e.id));

  // Clave aleatoria que no se muestra y factor TOTP solo para el ensayo.
  const factores = new Map<
    string,
    { id: string; secreto: string; clave: string }
  >();
  let resultado = 1;
  try {
    for (const e of escuelas) {
      const clave = randomBytes(24).toString('base64url');
      const cambio = await admin.auth.admin.updateUserById(e.auth_usuario_id, {
        password: clave,
      });
      if (cambio.error)
        throw new Error(
          `No se pudo preparar ${e.codigo}: ${cambio.error.message}`,
        );
      const c = cliente(urlSupabase, clavePublica);
      const ingreso = await c.auth.signInWithPassword({
        email: e.correo,
        password: clave,
      });
      if (ingreso.error)
        throw new Error(`No se pudo iniciar sesión en ${e.codigo}`);
      const alta = await c.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `ensayo-pb131-${Date.now()}`,
      });
      if (alta.error)
        throw new Error(
          `No se pudo crear el factor de ${e.codigo}: ${alta.error.message}`,
        );
      const factor = {
        id: alta.data.id,
        secreto: alta.data.totp.secret,
        clave,
      };
      const verificado = await c.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: codigoTotp(factor.secreto),
      });
      if (verificado.error)
        throw new Error(`No se pudo verificar el factor de ${e.codigo}`);
      factores.set(e.id, factor);
    }

    console.log(`Abriendo ${opciones.sesiones} sesiones con segundo factor…`);
    const sesiones: { escuela: Escuela; token: string }[] = [];
    for (let i = 0; i < opciones.sesiones; i++) {
      const escuela = escuelas[i % escuelas.length];
      const f = factores.get(escuela.id)!;
      sesiones.push({
        escuela,
        token: await sesionAal2(
          urlSupabase,
          clavePublica,
          escuela.correo,
          f.clave,
          f,
        ),
      });
    }

    // Aislamiento: una sesión de una escuela no ve el historial de la otra.
    const ajenas: number[] = [];
    for (const s of sesiones.slice(0, Math.min(4, sesiones.length))) {
      const otra = escuelas.find((e) => e.id !== s.escuela.id)!;
      const m = muestras.get(otra.id)!;
      ajenas.push(
        (
          await pedir(
            opciones.api,
            s.token,
            `/convivencia/estudiantes/${m.estudiantes[0]}/historial`,
          )
        ).estado,
      );
      ajenas.push(
        (
          await pedir(
            opciones.api,
            s.token,
            `/convivencia/casos/${m.casos[0]}/historial`,
          )
        ).estado,
      );
    }

    // Calentamiento: una consulta por sesión que no se cuenta.
    await Promise.all(
      sesiones.map((s) =>
        pedir(opciones.api, s.token, '/convivencia/estudiantes'),
      ),
    );

    console.log(
      `Midiendo ${opciones.sesiones} sesiones × ${opciones.consultas} consultas en paralelo…`,
    );
    const medidas: Medida[] = [];
    const inicio = performance.now();
    await Promise.all(
      sesiones.map(async (s, i) => {
        for (const q of consultas(
          muestras.get(s.escuela.id)!,
          opciones.consultas,
          i + 1,
        )) {
          const r = await pedir(opciones.api, s.token, q.ruta);
          medidas.push({
            tipo: q.tipo,
            ruta: q.ruta.replace(/[0-9a-f-]{36}/, ':id'),
            ...r,
          });
        }
      }),
    );
    const segundos = (performance.now() - inicio) / 1000;

    const despues = await contar(db);
    const crucesDespues = await cruces(db);
    // Se compara tabla por tabla: el orden de las filas del conteo puede variar.
    const diferencias: string[] = [];
    for (const escuela of new Set([
      ...Object.keys(antes),
      ...Object.keys(despues),
    ]))
      for (const tabla of TABLAS) {
        const a = antes[escuela]?.[tabla] ?? 0;
        const d = despues[escuela]?.[tabla] ?? 0;
        if (a !== d) diferencias.push(`${tabla} de ${escuela}: ${a} → ${d}`);
      }
    const iguales = diferencias.length === 0;
    const tipos = [...new Set(medidas.map((m) => m.tipo))].sort();
    const total = resumen(medidas, opciones.limiteMs);
    const informe = {
      fecha: new Date().toISOString(),
      maquina: {
        sistema: `${sistema()} ${release()}`,
        procesador: cpus()[0]?.model ?? 'desconocido',
        nucleos_visibles: cpus().length,
        memoria_gb: Math.round(totalmem() / 1024 ** 3),
        node: process.version,
      },
      red: 'Todo local: el ensayo corre en el contenedor de la API y la llama por localhost, la API usa la base y Supabase Auth locales de Docker',
      escenario: {
        escuelas: escuelas.map((e) => e.codigo),
        sesiones: opciones.sesiones,
        consultas_por_sesion: opciones.consultas,
        limite_ms: opciones.limiteMs,
        volumen: Object.fromEntries(
          escuelas.map((e) => [e.codigo, antes[e.id]]),
        ),
      },
      resultado: {
        duracion_s: Number(segundos.toFixed(1)),
        consultas_por_segundo: Number((medidas.length / segundos).toFixed(1)),
        total,
        por_tipo: Object.fromEntries(
          tipos.map((t) => [
            t,
            resumen(
              medidas.filter((m) => m.tipo === t),
              opciones.limiteMs,
            ),
          ]),
        ),
        mas_lentas: [...medidas]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 10)
          .map((m) => `${Math.round(m.ms)} ms ${m.estado} ${m.ruta}`),
        errores: medidas
          .filter((m) => m.estado !== 200)
          .map((m) => `${m.estado} ${m.ruta}`),
      },
      integridad: {
        conteos_iguales_antes_y_despues: iguales,
        diferencias,
        cruces_entre_escuelas_antes: crucesAntes,
        cruces_entre_escuelas_despues: crucesDespues,
        historial_de_otra_escuela: ajenas,
      },
    };
    console.log(JSON.stringify(informe, null, 2));
    const p95 = total.p95_ms <= opciones.limiteMs;
    const aislado = ajenas.every((estado) => estado === 403 || estado === 404);
    const sinCruces = crucesDespues.every((c) => c.n === 0);
    console.log(
      `\nHU-112: p95 ${total.p95_ms} ms ${p95 ? 'dentro' : 'FUERA'} del límite de ${opciones.limiteMs} ms, ${total.errores} errores` +
        `\nHU-117: conteos ${iguales ? 'iguales' : 'DISTINTOS'}, ${sinCruces ? 'sin' : 'CON'} cruces entre escuelas, historial de otra escuela ${aislado ? 'rechazado' : 'VISIBLE'}`,
    );
    resultado =
      p95 && total.errores === 0 && iguales && sinCruces && aislado ? 0 : 2;
  } finally {
    // Se borra el factor del ensayo y queda una clave aleatoria que nadie conoce.
    for (const e of escuelas) {
      const f = factores.get(e.id);
      if (f)
        await admin.auth.admin.mfa.deleteFactor({
          id: f.id,
          userId: e.auth_usuario_id,
        });
      await admin.auth.admin.updateUserById(e.auth_usuario_id, {
        password: randomBytes(24).toString('base64url'),
      });
    }
    await db.end();
  }
  return resultado;
}

principal()
  .then((codigo) => process.exit(codigo))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
