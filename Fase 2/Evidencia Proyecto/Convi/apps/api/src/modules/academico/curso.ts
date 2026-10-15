import { BadRequestException } from '@nestjs/common';

// PB-015 (HU-013): datos que envía el administrador para los cursos y las
// asignaciones de profesores. Se validan aquí aunque el formulario también lo
// haga: una petición directa no puede saltarse estas reglas.
export const LARGO_MAXIMO = { codigo: 40, nombre: 120, seccion: 20 } as const;
export const ROLES = ['PROFESOR_JEFE', 'PROFESOR'] as const;
export type Rol = (typeof ROLES)[number];

// Decisión del PO: los cursos y sus asignaciones solo se crean o cambian en
// años Planificados o Activos; un año Cerrado queda de solo lectura (HU-018).
export const ANIOS_EDITABLES = ['PLANIFICADO', 'ACTIVO'];

export type DatosCurso = {
  /** En mayúsculas y sin espacios, por ejemplo 1A. */
  codigo: string;
  nombre: string;
  seccion: string | null;
  nivel_id: string;
};

export type NuevoCurso = DatosCurso & { anio_academico_id: string };

export type NuevaAsignacion = {
  membresia_id: string;
  rol: Rol;
  /** AAAA-MM-DD. */
  fecha_inicio: string;
  fecha_fin: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO = /^[A-Z0-9_-]+$/;
const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(
  errores: Record<string, string>,
  mensaje = 'Revisa los datos marcados. No se guardó el curso.',
) {
  return new BadRequestException({ mensaje, errores });
}

export function objeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

export function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

export function esUuid(valor: string) {
  return UUID.test(valor);
}

// Rechaza fechas que no existen, como el 30 de febrero.
export function fechaValida(valor: string) {
  const partes = FECHA.exec(valor);
  if (!partes) return false;
  const [anio, mes, dia] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

function revisarCurso(
  datos: Record<string, unknown>,
  errores: Record<string, string>,
): DatosCurso {
  // El código se guarda en mayúsculas para que 1A y 1a no sean dos cursos.
  const codigo = texto(datos.codigo).toUpperCase();
  if (!codigo) errores.codigo = 'Ingresa el código del curso, por ejemplo 1A.';
  else if (codigo.length > LARGO_MAXIMO.codigo)
    errores.codigo = `Usa como máximo ${LARGO_MAXIMO.codigo} caracteres.`;
  else if (!CODIGO.test(codigo))
    errores.codigo =
      'Usa solo letras, números, guion o guion bajo, sin espacios.';

  const nombre = texto(datos.nombre);
  if (!nombre) errores.nombre = 'Ingresa el nombre del curso.';
  else if (nombre.length > LARGO_MAXIMO.nombre)
    errores.nombre = `Usa como máximo ${LARGO_MAXIMO.nombre} caracteres.`;

  const seccion = texto(datos.seccion);
  if (seccion.length > LARGO_MAXIMO.seccion)
    errores.seccion = `Usa como máximo ${LARGO_MAXIMO.seccion} caracteres.`;

  const nivelId = texto(datos.nivel_id).toLowerCase();
  if (!esUuid(nivelId)) errores.nivel_id = 'Elige el nivel del curso.';

  return { codigo, nombre, seccion: seccion || null, nivel_id: nivelId };
}

/** Datos para editar un curso: el año no se envía porque nunca cambia. */
export function validarCurso(cuerpo: unknown): DatosCurso {
  const errores: Record<string, string> = {};
  const curso = revisarCurso(objeto(cuerpo), errores);
  if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return curso;
}

/** Datos para crear un curso, con el año al que pertenece (CA1). */
export function validarNuevoCurso(cuerpo: unknown): NuevoCurso {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};
  const curso = revisarCurso(datos, errores);
  const anioId = texto(datos.anio_academico_id).toLowerCase();
  if (!esUuid(anioId))
    errores.anio_academico_id = 'Elige el año académico del curso.';
  if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return { ...curso, anio_academico_id: anioId };
}

const MENSAJE_ASIGNACION =
  'Revisa los datos marcados. No se guardó la asignación.';

/** Profesor, rol y fechas de una asignación nueva. */
export function validarNuevaAsignacion(cuerpo: unknown): NuevaAsignacion {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  const membresiaId = texto(datos.membresia_id).toLowerCase();
  if (!esUuid(membresiaId)) errores.membresia_id = 'Elige un profesor.';

  const rol = texto(datos.rol);
  if (!(ROLES as readonly string[]).includes(rol))
    errores.rol = 'Elige si es profesor jefe o profesor del curso.';

  const fechaInicio = texto(datos.fecha_inicio);
  if (!fechaValida(fechaInicio))
    errores.fecha_inicio = 'Ingresa la fecha de inicio de la asignación.';

  const fechaFin = texto(datos.fecha_fin);
  if (fechaFin && !fechaValida(fechaFin))
    errores.fecha_fin = 'Ingresa una fecha válida.';
  else if (fechaFin && fechaValida(fechaInicio) && fechaFin < fechaInicio)
    errores.fecha_fin = 'El último día no puede ser anterior al inicio.';

  if (Object.keys(errores).length > 0)
    throw errorDeCampos(errores, MENSAJE_ASIGNACION);
  return {
    membresia_id: membresiaId,
    rol: rol as Rol,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin || null,
  };
}

/** CA4: terminar una asignación registra su último día. */
export function validarTermino(cuerpo: unknown): string {
  const fechaFin = texto(objeto(cuerpo).fecha_fin);
  if (fechaValida(fechaFin)) return fechaFin;
  throw errorDeCampos(
    { fecha_fin: 'Ingresa el último día de la asignación.' },
    'Revisa los datos marcados. No se terminó la asignación.',
  );
}