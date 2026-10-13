import { BadRequestException } from '@nestjs/common';

// PB-013 (HU-011): datos que envía el administrador al crear o editar un año
// académico. Se validan aquí aunque el formulario también lo haga: una petición
// directa no puede saltarse estas reglas.
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2200;
export const ESTADOS_ANIO = ['PLANIFICADO', 'ACTIVO', 'CERRADO'] as const;
export type EstadoAnio = (typeof ESTADOS_ANIO)[number];

export type DatosAnio = {
  anio: number;
  /** Con forma AAAA-MM-DD, o null si no se indica. */
  fecha_inicio: string | null;
  fecha_fin: string | null;
};

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los datos marcados. No se guardó el año académico.',
    errores,
  });
}

function objeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

// Acepta el año como número o como texto con solo dígitos.
function leerAnio(valor: unknown) {
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && /^\d+$/.test(valor.trim())
        ? Number(valor.trim())
        : NaN;
  return Number.isInteger(numero) ? numero : null;
}

// Rechaza fechas que no existen, como el 30 de febrero.
function fechaValida(valor: string) {
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

/**
 * Revisa la forma de los datos sin consultar la base. Que el año no se repita
 * en la escuela lo asegura la base, y si se puede cambiar el número del año se
 * decide en el servicio, según el estado y los cursos del año.
 */
export function validarDatosAnio(cuerpo: unknown): DatosAnio {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  // CA1: el año va entre 2000 y 2200.
  const anio = leerAnio(datos.anio);
  if (anio === null || anio < ANIO_MINIMO || anio > ANIO_MAXIMO)
    errores.anio = `Ingresa un año entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.`;

  // Las fechas son opcionales; un campo vacío queda sin fecha.
  const fechas: Pick<DatosAnio, 'fecha_inicio' | 'fecha_fin'> = {
    fecha_inicio: null,
    fecha_fin: null,
  };
  for (const campo of ['fecha_inicio', 'fecha_fin'] as const) {
    const valor = datos[campo];
    if (valor === undefined || valor === null || valor === '') continue;
    if (typeof valor === 'string' && fechaValida(valor.trim()))
      fechas[campo] = valor.trim();
    else errores[campo] = 'Ingresa una fecha válida.';
  }
  // CA2: si se indican las dos fechas, el término no es anterior al inicio.
  if (
    fechas.fecha_inicio &&
    fechas.fecha_fin &&
    fechas.fecha_fin < fechas.fecha_inicio
  )
    errores.fecha_fin =
      'La fecha de término no puede ser anterior a la de inicio.';

  if (anio === null || Object.keys(errores).length > 0)
    throw errorDeCampos(errores);
  return { anio, ...fechas };
}

/** Un año solo se activa o se cierra: nunca vuelve a Planificado. */
export function validarCambioEstado(cuerpo: unknown): 'ACTIVO' | 'CERRADO' {
  const { estado } = objeto(cuerpo);
  if (estado === 'ACTIVO' || estado === 'CERRADO') return estado;
  throw errorDeCampos({ estado: 'Indica si quieres activar o cerrar el año.' });
}