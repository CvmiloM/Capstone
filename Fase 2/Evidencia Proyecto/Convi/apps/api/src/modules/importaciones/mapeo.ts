import { esUuid, objeto, texto } from '../academico/curso.js';
import { CAMPOS, USO_DEL_ANIO } from './campos.js';
import { errorDeCampos, type TipoImportacion } from './importacion.js';
import {
  FORMATOS_FECHA,
  type FormatoFecha,
  TRATAMIENTOS_DUPLICADO,
  type TratamientoDuplicado,
} from './valores.js';

// PB-020 (HU-015 CA3): lo que envía el administrador para revisar las filas:
// qué campo de CONVI trae cada columna, el año, cómo vienen las fechas y qué
// hacer con los duplicados. Se valida aquí aunque el formulario también lo
// haga: una petición directa no puede saltarse estas reglas.

export type Revision = {
  /** Columna del archivo → clave del campo; solo las columnas que se importan. */
  mapeo: Record<string, string>;
  anio_academico_id: string | null;
  formato_fecha: FormatoFecha;
  duplicados: TratamientoDuplicado;
};

const MENSAJE = 'Revisa los datos marcados. No se revisaron las filas.';

export function validarRevision(
  cuerpo: unknown,
  tipo: TipoImportacion,
  columnas: string[],
): Revision {
  const datos = objeto(cuerpo);
  const elegido = objeto(datos.mapeo);
  const errores: Record<string, string> = {};
  const campos = CAMPOS[tipo];

  const ajena = Object.keys(elegido).find((c) => !columnas.includes(c));
  if (ajena)
    errores.mapeo = `La columna "${ajena}" no está en el archivo. Recarga la página.`;

  // En el orden del archivo, para juntar las columnas de un mismo campo así.
  const mapeo: Record<string, string> = {};
  const columnasDe = new Map<string, string[]>();
  for (const columna of columnas) {
    const clave = texto(elegido[columna]);
    if (!clave) continue;
    if (!campos.some((c) => c.clave === clave)) {
      errores.mapeo = `Elige un campo de la lista para la columna "${columna}".`;
      continue;
    }
    mapeo[columna] = clave;
    columnasDe.set(clave, [...(columnasDe.get(clave) ?? []), columna]);
  }

  if (!errores.mapeo) {
    const repetido = campos.find(
      (c) => !c.unir && (columnasDe.get(c.clave)?.length ?? 0) > 1,
    );
    const faltan = campos.filter(
      (c) => c.obligatorio && !columnasDe.has(c.clave),
    );
    if (repetido)
      errores.mapeo = `El campo ${repetido.titulo} está en más de una columna: ${columnasDe
        .get(repetido.clave)
        ?.map((c) => `"${c}"`)
        .join(' y ')}. Deja solo una.`;
    else if (faltan.length > 0)
      errores.mapeo = `Falta relacionar ${faltan.length === 1 ? 'el campo obligatorio' : 'los campos obligatorios'}: ${faltan
        .map((c) => c.titulo)
        .join(', ')}.`;
  }

  // El año se pide para cursos, matrículas y asignaciones, y para estudiantes
  // solo si traen su curso.
  const uso = USO_DEL_ANIO[tipo];
  const pideAnio =
    uso === 'SIEMPRE' || (uso === 'CON_CURSO' && columnasDe.has('curso'));
  const anioId = texto(datos.anio_academico_id).toLowerCase();
  if (pideAnio && !esUuid(anioId))
    errores.anio_academico_id = 'Elige el año académico.';

  const formato = texto(datos.formato_fecha);
  if (!(FORMATOS_FECHA as readonly string[]).includes(formato))
    errores.formato_fecha = 'Elige cómo vienen escritas las fechas.';

  const duplicados = texto(datos.duplicados);
  if (!(TRATAMIENTOS_DUPLICADO as readonly string[]).includes(duplicados))
    errores.duplicados = 'Elige qué hacer con los registros que ya existen.';

  if (Object.keys(errores).length > 0) throw errorDeCampos(errores, MENSAJE);
  return {
    mapeo,
    anio_academico_id: pideAnio ? anioId : null,
    formato_fecha: formato as FormatoFecha,
    duplicados: duplicados as TratamientoDuplicado,
  };
}

/**
 * Los valores de la fila por campo. Las columnas se recorren en el orden del
 * archivo (jsonb no conserva el orden de las claves del mapeo); si un campo
 * trae varias (Apellidos), se juntan con un espacio.
 */
export function valoresDeFila(
  datos: Record<string, string>,
  mapeo: Record<string, string>,
  columnas: string[],
) {
  const valores: Record<string, string> = {};
  for (const columna of columnas) {
    const clave = mapeo[columna];
    const valor = (datos[columna] ?? '').trim();
    if (!clave || !valor) continue;
    valores[clave] = valores[clave] ? `${valores[clave]} ${valor}` : valor;
  }
  return valores;
}