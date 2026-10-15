import { BadRequestException } from '@nestjs/common';

// PB-030 (HU-023): datos que envían el administrador o Convivencia para las
// categorías de situaciones. Se validan aquí aunque el formulario también lo
// haga: una petición directa no puede saltarse estas reglas.
// El nombre tiene el largo de convi.categorias_convivencia; la descripción no
// tiene límite en la base y la API la deja en 500.
export const LARGO_MAXIMO = { nombre: 120, descripcion: 500 } as const;
export const ESTADOS = ['ACTIVO', 'INACTIVO'] as const;
export type EstadoCategoria = (typeof ESTADOS)[number];

export type DatosCategoria = {
  nombre: string;
  descripcion: string | null;
};

const MENSAJE = 'Revisa los datos marcados. No se guardó la categoría.';

function objeto(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({ mensaje: MENSAJE, errores });
}

/** CA1: nombre obligatorio y descripción opcional. Sirve para crear y editar. */
export function validarCategoria(cuerpo: unknown): DatosCategoria {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};

  // Los espacios repetidos se juntan, para que "Agresión  física" y
  // "Agresión física" no parezcan dos categorías.
  const nombre = texto(datos.nombre).replace(/\s+/g, ' ');
  if (!nombre) errores.nombre = 'Ingresa el nombre de la categoría.';
  else if (nombre.length > LARGO_MAXIMO.nombre)
    errores.nombre = `Usa como máximo ${LARGO_MAXIMO.nombre} caracteres.`;

  const descripcion = texto(datos.descripcion);
  if (descripcion.length > LARGO_MAXIMO.descripcion)
    errores.descripcion = `Usa como máximo ${LARGO_MAXIMO.descripcion} caracteres.`;

  if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return { nombre, descripcion: descripcion || null };
}

/** CA2: una categoría se desactiva o se vuelve a activar. */
export function validarEstado(cuerpo: unknown): EstadoCategoria {
  const estado = texto(objeto(cuerpo).estado);
  if ((ESTADOS as readonly string[]).includes(estado))
    return estado as EstadoCategoria;
  throw new BadRequestException({
    mensaje: 'Indica si la categoría queda activa o inactiva.',
    errores: { estado: 'Elige Activa o Inactiva.' },
  });
}