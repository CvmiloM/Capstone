import { BadRequestException } from '@nestjs/common';

// PB-002 (HU-002): datos para crear el establecimiento y su primer
// administrador. Se validan aquí aunque el formulario también lo haga: una
// petición directa no puede saltarse estas reglas (HU-119).
// Los largos máximos son los de convi.establecimientos y convi.personas.
export const LARGO_MAXIMO = {
  nombre: 180,
  codigo: 40,
  region: 100,
  comuna: 100,
  direccion: 200,
  telefono_escuela: 40,
  correo_contacto: 180,
  nombres: 100,
  apellidos: 120,
  telefono: 40,
} as const;

export type NuevaEscuela = {
  nombre: string;
  codigo: string | null;
  region: string | null;
  comuna: string | null;
  direccion: string | null;
  telefono_escuela: string | null;
  correo_contacto: string | null;
  /** Zona horaria IANA; si no viene, el modelo usa America/Santiago (CA2). */
  zona_horaria: string | null;
  // Ficha del administrador, recogida al crear la cuenta (PB-001).
  nombres: string;
  apellidos: string;
  telefono: string | null;
};

// Mismo patrón que convi.correo_valido.
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ZONAS_HORARIAS = new Set(Intl.supportedValuesOf('timeZone'));

/** La respuesta indica cada campo con problema, con la clave igual al campo enviado. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los datos marcados. No se creó el establecimiento.',
    errores,
  });
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

/** Revisa la forma de los datos sin consultar la base. */
export function validarNuevaEscuela(cuerpo: unknown): NuevaEscuela {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const leer = (campo: keyof typeof LARGO_MAXIMO) => {
    const valor = texto(datos[campo]);
    if (valor.length > LARGO_MAXIMO[campo])
      errores[campo] = `Usa como máximo ${LARGO_MAXIMO[campo]} caracteres.`;
    return valor;
  };

  const nombre = leer('nombre');
  if (!nombre) errores.nombre = 'Ingresa el nombre del establecimiento.';
  const nombres = leer('nombres');
  if (!nombres) errores.nombres = 'Faltan tus nombres.';
  const apellidos = leer('apellidos');
  if (!apellidos) errores.apellidos = 'Faltan tus apellidos.';

  const correo = leer('correo_contacto');
  if (correo && !errores.correo_contacto && !FORMATO_CORREO.test(correo))
    errores.correo_contacto = 'Ingresa un correo válido.';

  const zona = texto(datos.zona_horaria);
  if (zona && !ZONAS_HORARIAS.has(zona))
    errores.zona_horaria = 'Elige una zona horaria de la lista.';

  const opcionales = {
    codigo: leer('codigo') || null,
    region: leer('region') || null,
    comuna: leer('comuna') || null,
    direccion: leer('direccion') || null,
    telefono_escuela: leer('telefono_escuela') || null,
    telefono: leer('telefono') || null,
  };

  if (Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return {
    nombre,
    nombres,
    apellidos,
    correo_contacto: correo || null,
    zona_horaria: zona || null,
    ...opcionales,
  };
}