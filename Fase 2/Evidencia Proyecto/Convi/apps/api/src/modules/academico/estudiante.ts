import { errorDeCampos, esUuid, fechaValida, objeto, texto } from './curso.js';

// PB-017 y PB-018 (HU-014): ficha del estudiante y su matrícula. Se validan
// aquí aunque el formulario también lo haga: una petición directa no puede
// saltarse estas reglas.
// Largos de convi.personas y convi.estudiantes; la dirección no tiene límite
// en la base y la API la deja en 200.
export const LARGO_MAXIMO_ESTUDIANTE = {
  codigo_estudiante: 60,
  nombres: 100,
  apellidos: 120,
  correo: 180,
  telefono: 40,
  direccion: 200,
} as const;

export type DatosEstudiante = {
  /** En mayúsculas y sin espacios, por ejemplo 2028-015. */
  codigo_estudiante: string;
  nombres: string;
  apellidos: string;
  /** Sin puntos y con guion, por ejemplo 12345678-5. */
  rut: string | null;
  /** AAAA-MM-DD. */
  fecha_nacimiento: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
};

export type NuevaMatricula = {
  curso_id: string;
  /** AAAA-MM-DD. */
  matriculado_en: string;
};

export type FiltroNomina = {
  buscar: string;
  curso: string | null;
  pagina: number;
};

const MENSAJE_FICHA = 'Revisa los datos marcados. No se guardó la ficha.';
const MENSAJE_MATRICULA =
  'Revisa los datos marcados. No se guardó la matrícula.';

const CODIGO = /^[A-Z0-9_-]+$/;
// Mismo criterio que convi.correo_valido.
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TELEFONO = /^\+?[0-9 ()-]+$/;

/**
 * Deja el RUT como lo guarda la base (12345678-5: sin puntos, con guion y K
 * mayúscula) y revisa su dígito verificador. Devuelve null si no es válido.
 */
export function normalizarRut(valor: string): string | null {
  const limpio = valor.replace(/[.\s-]/g, '').toUpperCase();
  if (!/^[0-9]+[0-9K]$/.test(limpio)) return null;
  // Sin ceros a la izquierda, para que 01234567-8 y 1234567-8 sean el mismo.
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, '');
  const digito = limpio.slice(-1);
  if (cuerpo.length < 7 || cuerpo.length > 8) return null;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return digito === esperado ? `${cuerpo}-${digito}` : null;
}

/** 2028-03-02 → 02-03-2028, para los mensajes. */
export function fechaLegible(fecha: string) {
  return fecha.split('-').reverse().join('-');
}

function opcional(
  datos: Record<string, unknown>,
  campo: keyof typeof LARGO_MAXIMO_ESTUDIANTE,
  errores: Record<string, string>,
) {
  const valor = texto(datos[campo]);
  if (valor.length > LARGO_MAXIMO_ESTUDIANTE[campo])
    errores[campo] =
      `Usa como máximo ${LARGO_MAXIMO_ESTUDIANTE[campo]} caracteres.`;
  return valor || null;
}

/**
 * CA1: nombres, apellidos y código son obligatorios; RUT, fecha de
 * nacimiento, dirección, correo y teléfono, opcionales. Sirve para crear y
 * para corregir la ficha. La fecha futura se revisa en el servicio, con el
 * día de hoy de la escuela.
 */
export function validarEstudiante(cuerpo: unknown): DatosEstudiante {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  // El código se guarda en mayúsculas para que a15 y A15 no sean dos estudiantes.
  const codigo = texto(datos.codigo_estudiante).toUpperCase();
  if (!codigo) errores.codigo_estudiante = 'Ingresa el código del estudiante.';
  else if (codigo.length > LARGO_MAXIMO_ESTUDIANTE.codigo_estudiante)
    errores.codigo_estudiante = `Usa como máximo ${LARGO_MAXIMO_ESTUDIANTE.codigo_estudiante} caracteres.`;
  else if (!CODIGO.test(codigo))
    errores.codigo_estudiante =
      'Usa solo letras, números, guion o guion bajo, sin espacios.';

  const nombres = texto(datos.nombres);
  if (!nombres) errores.nombres = 'Ingresa los nombres del estudiante.';
  else if (nombres.length > LARGO_MAXIMO_ESTUDIANTE.nombres)
    errores.nombres = `Usa como máximo ${LARGO_MAXIMO_ESTUDIANTE.nombres} caracteres.`;

  const apellidos = texto(datos.apellidos);
  if (!apellidos) errores.apellidos = 'Ingresa los apellidos del estudiante.';
  else if (apellidos.length > LARGO_MAXIMO_ESTUDIANTE.apellidos)
    errores.apellidos = `Usa como máximo ${LARGO_MAXIMO_ESTUDIANTE.apellidos} caracteres.`;

  const rutEscrito = texto(datos.rut);
  const rut = rutEscrito ? normalizarRut(rutEscrito) : null;
  if (rutEscrito && !rut)
    errores.rut =
      'El RUT no es válido. Revisa los números y el dígito verificador.';

  const fechaNacimiento = texto(datos.fecha_nacimiento);
  if (fechaNacimiento && !fechaValida(fechaNacimiento))
    errores.fecha_nacimiento = 'Ingresa una fecha válida.';
  else if (fechaNacimiento && fechaNacimiento < '1900-01-01')
    errores.fecha_nacimiento = 'Revisa el año de nacimiento.';

  const correo = opcional(datos, 'correo', errores)?.toLowerCase() ?? null;
  if (correo && !errores.correo && !CORREO.test(correo))
    errores.correo = 'Ingresa un correo válido, por ejemplo nombre@correo.cl.';

  const telefono = opcional(datos, 'telefono', errores);
  if (
    telefono &&
    !errores.telefono &&
    (!TELEFONO.test(telefono) || telefono.replace(/\D/g, '').length < 8)
  )
    errores.telefono =
      'Ingresa un teléfono válido, por ejemplo +56 9 1234 5678.';

  const direccion = opcional(datos, 'direccion', errores);

  if (Object.keys(errores).length > 0)
    throw errorDeCampos(errores, MENSAJE_FICHA);
  return {
    codigo_estudiante: codigo,
    nombres,
    apellidos,
    rut,
    fecha_nacimiento: fechaNacimiento || null,
    correo,
    telefono,
    direccion,
  };
}

/** CA3: la matrícula indica el curso y su fecha de inicio; el año es el del curso. */
export function validarMatricula(cuerpo: unknown): NuevaMatricula {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  const cursoId = texto(datos.curso_id).toLowerCase();
  if (!esUuid(cursoId)) errores.curso_id = 'Elige el curso.';

  const matriculadoEn = texto(datos.matriculado_en);
  if (!fechaValida(matriculadoEn))
    errores.matriculado_en = 'Ingresa la fecha de inicio de la matrícula.';

  if (Object.keys(errores).length > 0)
    throw errorDeCampos(errores, MENSAJE_MATRICULA);
  return { curso_id: cursoId, matriculado_en: matriculadoEn };
}

/** Búsqueda de la nómina: texto libre, curso opcional y página desde 1. */
export function validarFiltro(
  buscar: unknown,
  curso: unknown,
  pagina: unknown,
): FiltroNomina {
  const cursoId = texto(curso).toLowerCase();
  const numero = Number(texto(pagina) || '1');
  return {
    buscar: texto(buscar).slice(0, 100),
    curso: esUuid(cursoId) ? cursoId : null,
    pagina: Number.isInteger(numero) && numero >= 1 ? numero : 1,
  };
}