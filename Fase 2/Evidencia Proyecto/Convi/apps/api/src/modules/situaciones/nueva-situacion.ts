import { BadRequestException } from '@nestjs/common';

// PB-042 (HU-035): datos que envía el profesor al registrar una situación.
// Se validan aquí aunque el formulario también lo haga: una petición directa
// no puede saltarse estas reglas (HU-119).
export const URGENCIAS = ['NORMAL', 'URGENTE', 'INMEDIATA'] as const;
export const ROLES_PARTICIPANTE = [
  'AFECTADO',
  'INVOLUCRADO',
  'TESTIGO',
] as const;
export const LARGO_MAXIMO = { lugar: 120, descripcion: 4000 } as const;
export const MAXIMO_PARTICIPANTES = 40;

export type NuevaSituacion = {
  curso_id: string;
  /** Fecha y hora del hecho en la hora de la escuela, con forma AAAA-MM-DDTHH:MM. */
  ocurrido_en: string;
  lugar: string | null;
  urgencia: (typeof URGENCIAS)[number];
  categoria_id: string | null;
  descripcion: string;
  participantes: {
    estudiante_id: string;
    rol: (typeof ROLES_PARTICIPANTE)[number];
  }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** HU-035 CA5: la respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los datos marcados. No se registró la situación.',
    errores,
  });
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function esUno<T extends string>(
  lista: readonly T[],
  valor: unknown,
): valor is T {
  return typeof valor === 'string' && lista.includes(valor as T);
}

// Rechaza fechas que no existen, como el 30 de febrero o las 25:00.
function fechaHoraValida(valor: string) {
  const partes = FECHA_HORA.exec(valor);
  if (!partes) return false;
  const [anio, mes, dia, hora, minuto] = partes.slice(1).map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia &&
    fecha.getUTCHours() === hora &&
    fecha.getUTCMinutes() === minuto
  );
}

// Reglas comunes al registro del profesor (PB-042) y de Convivencia (PB-043).
function validarComun(
  datos: Record<string, unknown>,
  errores: Record<string, string>,
) {
  const ocurridoEn = texto(datos.ocurrido_en);
  if (!fechaHoraValida(ocurridoEn))
    errores.ocurrido_en = 'Indica la fecha y la hora del hecho.';

  const lugar = texto(datos.lugar);
  if (lugar.length > LARGO_MAXIMO.lugar)
    errores.lugar = `El lugar admite hasta ${LARGO_MAXIMO.lugar} caracteres.`;

  // CA3: urgencia Normal salvo que se declare Urgente o Inmediata.
  const valorUrgencia = datos.urgencia ?? 'NORMAL';
  const urgencia = esUno(URGENCIAS, valorUrgencia) ? valorUrgencia : null;
  if (!urgencia) errores.urgencia = 'Elige Normal, Urgente o Inmediata.';

  const categoriaId = texto(datos.categoria_id).toLowerCase();
  if (categoriaId && !UUID.test(categoriaId))
    errores.categoria_id = 'Elige una categoría de la lista.';

  const descripcion = texto(datos.descripcion);
  if (!descripcion) errores.descripcion = 'Describe lo que ocurrió.';
  else if (descripcion.length > LARGO_MAXIMO.descripcion)
    errores.descripcion = `La descripción admite hasta ${LARGO_MAXIMO.descripcion} caracteres.`;

  // CA2: al menos un estudiante y cada uno con su rol en el hecho.
  const lista: unknown[] = Array.isArray(datos.participantes)
    ? datos.participantes
    : [];
  const participantes: NuevaSituacion['participantes'] = [];
  for (const elemento of lista) {
    const participante = (
      typeof elemento === 'object' && elemento !== null ? elemento : {}
    ) as Record<string, unknown>;
    const estudianteId = texto(participante.estudiante_id).toLowerCase();
    const rol = esUno(ROLES_PARTICIPANTE, participante.rol)
      ? participante.rol
      : null;
    if (!UUID.test(estudianteId) || !rol) {
      errores.participantes = 'Indica el rol de cada estudiante.';
      break;
    }
    participantes.push({ estudiante_id: estudianteId, rol });
  }
  if (!errores.participantes) {
    if (participantes.length === 0)
      errores.participantes = 'Agrega al menos un estudiante.';
    else if (participantes.length > MAXIMO_PARTICIPANTES)
      errores.participantes = `Puedes agregar hasta ${MAXIMO_PARTICIPANTES} estudiantes.`;
    else if (
      new Set(participantes.map((p) => p.estudiante_id)).size !==
      participantes.length
    )
      errores.participantes = 'Cada estudiante se agrega una sola vez.';
  }

  return {
    ocurrido_en: ocurridoEn,
    lugar: lugar || null,
    urgencia,
    categoria_id: categoriaId || null,
    descripcion,
    participantes,
  };
}

function comoObjeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

/**
 * Revisa la forma de los datos sin consultar la base. Que el curso sea del
 * profesor, que la categoría esté activa y que cada estudiante esté
 * matriculado en el curso se comprueba después, dentro de la transacción.
 */
export function validarNuevaSituacion(cuerpo: unknown): NuevaSituacion {
  const datos = comoObjeto(cuerpo);
  const errores: Record<string, string> = {};

  const cursoId = texto(datos.curso_id).toLowerCase();
  if (!UUID.test(cursoId)) errores.curso_id = 'Elige uno de tus cursos.';

  const comun = validarComun(datos, errores);
  const urgencia = comun.urgencia;
  if (!urgencia || Object.keys(errores).length > 0)
    throw errorDeCampos(errores);

  return { ...comun, curso_id: cursoId, urgencia };
}

// PB-043 (HU-036): quién informó la situación cuando no la registra un profesor.
export const ORIGENES = [
  'ESTUDIANTE',
  'APODERADO',
  'FUNCIONARIO',
  'OTRO',
] as const;

export type SituacionConvivencia = Omit<NuevaSituacion, 'curso_id'> & {
  /** Curso del hecho; opcional porque puede involucrar a varios cursos. */
  curso_id: string | null;
  tipo_origen: (typeof ORIGENES)[number];
  /** Persona que informó (CA1), si se conoce; nunca con origen Otro. */
  informante_persona_id: string | null;
};

/**
 * Datos de una situación que registra Convivencia (HU-036). Exige lo mismo que
 * el registro del profesor (CA3), más el origen; el curso es opcional y los
 * estudiantes pueden ser de cualquier curso de la escuela.
 */
export function validarSituacionConvivencia(
  cuerpo: unknown,
): SituacionConvivencia {
  const datos = comoObjeto(cuerpo);
  const errores: Record<string, string> = {};

  const cursoId = texto(datos.curso_id).toLowerCase();
  if (cursoId && !UUID.test(cursoId))
    errores.curso_id = 'Elige un curso de la lista.';

  // CA1: el origen es obligatorio; el informante, cuando corresponde.
  const origen = esUno(ORIGENES, datos.tipo_origen) ? datos.tipo_origen : null;
  if (!origen)
    errores.tipo_origen =
      'Indica quién informó: estudiante, apoderado, funcionario u otro.';
  const informanteId = texto(datos.informante_persona_id).toLowerCase();
  if (informanteId && (!UUID.test(informanteId) || origen === 'OTRO'))
    errores.informante_persona_id = 'Elige a la persona de la lista.';

  const comun = validarComun(datos, errores);
  const urgencia = comun.urgencia;
  if (!origen || !urgencia || Object.keys(errores).length > 0)
    throw errorDeCampos(errores);

  return {
    ...comun,
    curso_id: cursoId || null,
    urgencia,
    tipo_origen: origen,
    informante_persona_id: informanteId || null,
  };
}
