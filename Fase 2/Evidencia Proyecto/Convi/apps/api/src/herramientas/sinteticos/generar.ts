import { Client } from 'pg';
import {
  actualizarEstadisticas,
  borrarEscuelas,
  CANTIDAD_REGLAS,
  cargarPlan,
  escuelasExistentes,
  identidadesExistentes,
  verificar,
} from './carga.js';
import {
  borrarIdentidades,
  clienteAdministrador,
  crearIdentidades,
} from './cuentas.js';
import {
  AYUDA,
  esServidorLocal,
  leerOpciones,
  servidorDe,
} from './opciones.js';
import { generarPlan, MINIMO_SITUACIONES, type Plan } from './plan.js';

// PB-159 (HU-137): comando del generador de datos sintéticos. Se corre dentro
// del contenedor de la API, que ya tiene las variables de la base y de
// Supabase:
//   docker compose exec api node apps/api/dist/herramientas/sinteticos/generar.js --semilla 2026

const LARGO_MINIMO_CLAVE = 8;

/** Lee una clave sin mostrarla en la pantalla. */
function pedirClave(pregunta: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const entrada = process.stdin;
    if (!entrada.isTTY) {
      rechazar(
        new Error(
          'Para escribir la clave hace falta una terminal interactiva.',
        ),
      );
      return;
    }
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let clave = '';
    const terminar = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off('data', alLeer);
      process.stdout.write('\n');
    };
    function alLeer(texto: string) {
      for (const caracter of texto) {
        if (caracter === '\r' || caracter === '\n') {
          terminar();
          resolver(clave);
          return;
        }
        if (caracter === '\u0003') {
          terminar();
          rechazar(new Error('Generación cancelada.'));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b')
          clave = clave.slice(0, -1);
        else clave += caracter;
      }
    }
    entrada.on('data', alLeer);
  });
}

function variable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor)
    throw new Error(`Falta la variable ${nombre} en el contenedor de la API.`);
  return valor;
}

function mostrarResumen(plan: Plan) {
  const r = plan.resumen;
  const filas: [string, string | number][] = [
    ['Escuelas', plan.escuelas.map((e) => e.codigo).join(', ')],
    [
      'Estudiantes (activos hoy)',
      `${r.estudiantes} (${r.estudiantes_activos})`,
    ],
    ['Matrículas', r.matriculas],
    ['Personal con cuenta', r.personal],
    ['Cursos', r.cursos],
    ['Situaciones', r.situaciones],
    [
      'Por año del hecho',
      Object.entries(r.situaciones_por_anio)
        .map(([a, n]) => `${a}: ${n}`)
        .join(', '),
    ],
    [
      'Por estado',
      Object.entries(r.situaciones_por_estado)
        .map(([e, n]) => `${e}: ${n}`)
        .join(', '),
    ],
    ['Participaciones', r.participaciones],
    ['Decisiones', r.decisiones],
    ['Aclaraciones', r.aclaraciones],
    ['Casos', r.casos],
    [
      'Casos por estado',
      Object.entries(r.casos_por_estado)
        .map(([e, n]) => `${e}: ${n}`)
        .join(', '),
    ],
    ['Cambios de estado de casos', r.cambios_de_estado],
  ];
  for (const [nombre, valor] of filas)
    console.log(`  ${nombre.padEnd(28)} ${valor}`);
}

async function principal(): Promise<number> {
  const opciones = leerOpciones(process.argv.slice(2));
  if (opciones.ayuda) {
    console.log(AYUDA);
    return 0;
  }

  const urlBase = variable('SUPABASE_DB_URL');
  const urlSupabase = variable('SUPABASE_URL');
  const claveServicio =
    process.env.SUPABASE_SECRET_KEY || variable('SUPABASE_SERVICE_ROLE_KEY');
  const servidor = servidorDe(urlBase) ?? 'desconocido';
  // Decisión del PO: en la nube solo con un permiso explícito.
  const local = esServidorLocal(urlBase) && esServidorLocal(urlSupabase);
  if (!local && !opciones.permitirNube) {
    console.error(
      `La base ${servidor} no es la local, para generar datos ahí agrega --permitir-nube después de acordarlo con el equipo.`,
    );
    return 1;
  }

  let clave: string | null = null;
  if (opciones.claveConvivencia) {
    clave = await pedirClave(
      'Clave para la cuenta de Convivencia de cada escuela: ',
    );
    const repetida = await pedirClave('Repite la clave: ');
    if (clave !== repetida) throw new Error('Las claves no coinciden.');
    if (clave.length < LARGO_MINIMO_CLAVE)
      throw new Error(
        `La clave debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`,
      );
  }

  const inicio = Date.now();
  console.log(
    `Generando con la semilla ${opciones.semilla} en la base ${local ? 'local' : 'de la nube'} (${servidor})`,
  );
  if (opciones.situaciones < MINIMO_SITUACIONES)
    console.log(
      `Aviso: el ensayo de rendimiento pide al menos ${MINIMO_SITUACIONES} situaciones.`,
    );
  const plan = generarPlan({
    semilla: opciones.semilla,
    situaciones: opciones.situaciones,
  });
  const administrador = clienteAdministrador(urlSupabase, claveServicio);
  const db = new Client({ connectionString: urlBase });
  await db.connect();
  const creadas: string[] = [];
  try {
    // CA3: solo se borran escuelas con el código y la marca de esta semilla.
    const existentes = await escuelasExistentes(
      db,
      plan.escuelas.map((e) => e.codigo),
      plan.semilla,
    );
    if (existentes.some((e) => !e.marcada)) {
      console.error(
        `Ya hay una escuela con el código ${existentes.find((e) => !e.marcada)?.codigo} que no fue creada por el generador, no se toca.`,
      );
      return 1;
    }
    if (existentes.length > 0) {
      if (!opciones.reemplazar) {
        console.error(
          `Las escuelas sintéticas de la semilla ${plan.semilla} ya existen, agrega --reemplazar para borrarlas y crearlas de nuevo.`,
        );
        return 1;
      }
      await db.query('BEGIN');
      const identidades = await borrarEscuelas(
        db,
        existentes.map((e) => e.id),
      );
      await db.query('COMMIT');
      const sinBorrar = await borrarIdentidades(administrador, identidades);
      console.log(
        `Se borraron las ${existentes.length} escuelas sintéticas anteriores de esta semilla.`,
      );
      if (sinBorrar.length > 0)
        throw new Error(
          `No se pudieron borrar ${sinBorrar.length} cuentas anteriores.`,
        );
    }
    // Cuentas sueltas de una generación que falló a medias.
    const sueltas = await identidadesExistentes(
      db,
      plan.cuentas.map((c) => c.correo),
    );
    if (sueltas.length > 0) {
      if (!opciones.reemplazar) {
        console.error(
          `Ya existen ${sueltas.length} cuentas con correos de esta semilla, agrega --reemplazar para borrarlas.`,
        );
        return 1;
      }
      const sinBorrar = await borrarIdentidades(
        administrador,
        sueltas.map((s) => s.id),
      );
      if (sinBorrar.length > 0)
        throw new Error(
          `No se pudieron borrar ${sinBorrar.length} cuentas anteriores.`,
        );
    }

    await crearIdentidades(administrador, plan.cuentas, clave, creadas);
    await db.query('BEGIN');
    await cargarPlan(db, plan, {
      entorno: local ? 'local' : 'nube',
      servidor,
      generadoEn: new Date().toISOString(),
    });
    const fallas = await verificar(
      db,
      plan.escuelas.map((e) => e.id),
    );
    if (fallas.length > 0) {
      await db.query('ROLLBACK');
      console.error(
        'No se guardó nada porque los datos no cumplen estas reglas:',
      );
      for (const f of fallas) console.error(`  ${f.regla}: ${f.cantidad}`);
      await borrarIdentidades(administrador, creadas);
      return 1;
    }
    await db.query('COMMIT');
    creadas.length = 0;
    await actualizarEstadisticas(db);

    console.log(
      `Listo en ${Math.round((Date.now() - inicio) / 1000)} s, los datos cumplen las ${CANTIDAD_REGLAS} reglas revisadas:`,
    );
    mostrarResumen(plan);
    const conAcceso = plan.cuentas.filter((c) => c.conAcceso);
    if (clave)
      console.log(
        `Cuentas de Convivencia para entrar con la clave que escribiste: ${conAcceso.map((c) => c.correo).join(', ')}`,
      );
    return 0;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    if (creadas.length > 0) await borrarIdentidades(administrador, creadas);
    throw error;
  } finally {
    await db.end();
  }
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
