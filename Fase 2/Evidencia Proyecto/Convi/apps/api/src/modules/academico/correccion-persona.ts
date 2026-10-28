import { errorDeCampos } from './curso.js';

// PB-021 (HU-016 CA2): corregir una ficha no puede convertirla en la de otra
// persona. Vale para la ficha del estudiante y para la de sus contactos; en
// ambos casos se conserva el mismo registro de convi.personas.

export type IdentidadPersona = {
  nombres: string;
  apellidos: string;
  /** Sin puntos y con guion, o null si no tiene. */
  rut: string | null;
};

const AVISO_OTRA_PERSONA =
  'Para cambiar nombres y apellidos a la vez, la ficha tiene que tener RUT y mantenerlo.';

// Sin mayúsculas, tildes ni espacios de más: pasar de "jose  perez" a
// "José Pérez" corrige la escritura, no cambia el nombre.
function comparable(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Decisión del PO: si cambian a la vez los nombres y los apellidos, ya no es
 * una corrección sino otra persona, salvo que el RUT registrado se mantenga
 * (por ejemplo, un cambio de nombre legal de la misma persona).
 */
export function esOtraPersona(
  antes: IdentidadPersona,
  despues: IdentidadPersona,
) {
  const cambianNombres =
    comparable(antes.nombres) !== comparable(despues.nombres);
  const cambianApellidos =
    comparable(antes.apellidos) !== comparable(despues.apellidos);
  const mismoRut = antes.rut !== null && antes.rut === despues.rut;
  return cambianNombres && cambianApellidos && !mismoRut;
}

/** El error 400 con los dos campos marcados y la explicación del formulario. */
export function errorOtraPersona(mensaje: string) {
  return errorDeCampos(
    { nombres: AVISO_OTRA_PERSONA, apellidos: AVISO_OTRA_PERSONA },
    mensaje,
  );
}
