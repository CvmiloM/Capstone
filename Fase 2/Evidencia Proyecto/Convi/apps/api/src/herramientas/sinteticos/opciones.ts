import { MINIMO_SITUACIONES, SEMILLA_VALIDA } from './plan.js';

// PB-159: opciones del comando del generador y reconocimiento del entorno.

export type Opciones = {
  ayuda: boolean;
  semilla: string;
  situaciones: number;
  /** Borra las escuelas sintéticas de esta semilla y las vuelve a crear. */
  reemplazar: boolean;
  /** Decisión del PO: la nube solo con un permiso explícito. */
  permitirNube: boolean;
  /** Pide una clave para la cuenta de Convivencia de cada escuela. */
  claveConvivencia: boolean;
};

export const AYUDA = `Generador de datos sintéticos de CONVI (PB-159)

Crea dos escuelas ficticias con tres años de historia: cursos, estudiantes,
matrículas, personal, al menos 10 000 situaciones, decisiones y casos.
Nunca escribe en escuelas existentes y solo borra las sintéticas de la semilla.

Uso, desde la carpeta Convi:
  docker compose exec api node apps/api/dist/herramientas/sinteticos/generar.js [opciones]

  --semilla <texto>       Letras, números o guiones (por defecto 2026)
  --situaciones <número>  Total de situaciones (por defecto 10000)
  --reemplazar            Si ya existen las escuelas de esa semilla, las borra
                          y las vuelve a crear
  --clave-convivencia     Pide una clave para la cuenta de Convivencia de cada
                          escuela, que así puede iniciar sesión
  --permitir-nube         Permite correrlo en una base que no es la local
  --ayuda                 Muestra este texto`;

function invalido(mensaje: string): never {
  throw new Error(`${mensaje}, usa --ayuda para ver las opciones.`);
}

export function leerOpciones(argumentos: string[]): Opciones {
  const opciones: Opciones = {
    ayuda: false,
    semilla: '2026',
    situaciones: MINIMO_SITUACIONES,
    reemplazar: false,
    permitirNube: false,
    claveConvivencia: false,
  };
  for (let i = 0; i < argumentos.length; i++) {
    const argumento = argumentos[i];
    const valor = () => {
      const siguiente = argumentos[++i];
      if (siguiente === undefined || siguiente.startsWith('--'))
        invalido(`Falta el valor de ${argumento}`);
      return siguiente;
    };
    switch (argumento) {
      case '--ayuda':
      case '-h':
      case '--help':
        opciones.ayuda = true;
        break;
      case '--semilla':
        opciones.semilla = valor();
        if (!SEMILLA_VALIDA.test(opciones.semilla))
          invalido('La semilla usa de 1 a 20 letras, números o guiones');
        break;
      case '--situaciones': {
        const texto = valor();
        const numero = Number(texto);
        if (!/^\d+$/.test(texto) || numero < 100 || numero > 200_000)
          invalido('Las situaciones van de 100 a 200000');
        opciones.situaciones = numero;
        break;
      }
      case '--reemplazar':
        opciones.reemplazar = true;
        break;
      case '--permitir-nube':
        opciones.permitirNube = true;
        break;
      case '--clave-convivencia':
        opciones.claveConvivencia = true;
        break;
      default:
        invalido(`No conozco la opción ${argumento}`);
    }
  }
  return opciones;
}

const SERVIDORES_LOCALES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'host.docker.internal',
  'kong',
  'db',
]);

/** Servidor de una URL sin usuario ni clave, o null si no se puede leer. */
export function servidorDe(direccion: string): string | null {
  try {
    const url = new URL(direccion);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return null;
  }
}

/** La base local de Docker (Supabase CLI), nunca la nube. */
export function esServidorLocal(direccion: string): boolean {
  let servidor: string;
  try {
    servidor = new URL(direccion).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    SERVIDORES_LOCALES.has(servidor) ||
    servidor.startsWith('supabase_') ||
    servidor.endsWith('.localhost')
  );
}
