import { BadRequestException } from '@nestjs/common';

// PB-014 (HU-012): datos que envía el administrador al crear o editar un nivel
// educativo. Se validan aquí aunque el formulario también lo haga: una
// petición directa no puede saltarse estas reglas.
export const CICLOS = ['PARVULARIA', 'BASICA', 'MEDIA'] as const;
export type Ciclo = (typeof CICLOS)[number];

// Decisión del PO: el tramo sale de una lista cerrada por ciclo, igual para
// todas las escuelas, para que la analítica agrupe los cursos de la misma
// forma (CA3). La base solo exige que el tramo esté escrito como código.
export const TRAMOS: Record<Ciclo, readonly string[]> = {
  PARVULARIA: ['PRIMER_NIVEL', 'SEGUNDO_NIVEL', 'TERCER_NIVEL'],
  BASICA: ['PRIMER_CICLO', 'SEGUNDO_CICLO'],
  MEDIA: ['FORMACION_GENERAL', 'FORMACION_DIFERENCIADA'],
};

// Mismos largos que las columnas de convi.niveles_educativos.
export const LARGO_MAXIMO = { codigo: 30, nombre: 80 } as const;
export const ORDEN_MAXIMO = 999;

export type DatosNivel = {
  /** En mayúsculas y sin espacios, por ejemplo B1. */
  codigo: string;
  nombre: string;
  orden: number;
  ciclo: Ciclo;
  tramo: string;
};

const CODIGO = /^[A-Z0-9_-]+$/;

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los datos marcados. No se guardó el nivel.',
    errores,
  });
}

function objeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// Acepta el orden como número o como texto con solo dígitos.
function leerOrden(valor: unknown) {
  const numero =
    typeof valor === 'number'
      ? valor
      : typeof valor === 'string' && /^\d+$/.test(valor.trim())
        ? Number(valor.trim())
        : NaN;
  return Number.isInteger(numero) ? numero : null;
}

function esCiclo(valor: string): valor is Ciclo {
  return (CICLOS as readonly string[]).includes(valor);
}

/**
 * Revisa la forma de los datos sin consultar la base. Que el código y el
 * orden no se repitan en la escuela lo asegura la base (CA1), y qué se puede
 * cambiar de un nivel con cursos se decide en el servicio.
 */
export function validarDatosNivel(cuerpo: unknown): DatosNivel {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  // El código se guarda en mayúsculas para que B1 y b1 no sean dos niveles.
  const codigo = texto(datos.codigo).toUpperCase();
  if (!codigo) errores.codigo = 'Ingresa el código del nivel, por ejemplo B1.';
  else if (codigo.length > LARGO_MAXIMO.codigo)
    errores.codigo = `Usa como máximo ${LARGO_MAXIMO.codigo} caracteres.`;
  else if (!CODIGO.test(codigo))
    errores.codigo =
      'Usa solo letras, números, guion o guion bajo, sin espacios.';

  const nombre = texto(datos.nombre);
  if (!nombre) errores.nombre = 'Ingresa el nombre del nivel.';
  else if (nombre.length > LARGO_MAXIMO.nombre)
    errores.nombre = `Usa como máximo ${LARGO_MAXIMO.nombre} caracteres.`;

  const orden = leerOrden(datos.orden);
  if (orden === null || orden < 1 || orden > ORDEN_MAXIMO)
    errores.orden = `Ingresa un número entre 1 y ${ORDEN_MAXIMO}.`;

  const ciclo = texto(datos.ciclo);
  const tramo = texto(datos.tramo);
  if (!esCiclo(ciclo)) {
    errores.ciclo = 'Elige Parvularia, Básica o Media.';
  } else if (!TRAMOS[ciclo].includes(tramo)) {
    errores.tramo = 'Elige uno de los tramos de ese ciclo.';
  }

  if (orden === null || !esCiclo(ciclo) || Object.keys(errores).length > 0)
    throw errorDeCampos(errores);
  return { codigo, nombre, orden, ciclo, tramo };
}

/** Activar o desactivar: el cuerpo trae { activo: true } o { activo: false }. */
export function validarActivo(cuerpo: unknown): boolean {
  const { activo } = objeto(cuerpo);
  if (typeof activo === 'boolean') return activo;
  throw errorDeCampos({
    activo: 'Indica si quieres activar o desactivar el nivel.',
  });
}