import { errorDeCampos, esUuid, fechaValida, objeto, texto } from './curso.js';
import { LARGO_MAXIMO_ESTUDIANTE, normalizarRut } from './estudiante.js';

const MENSAJE = 'Revisa los datos marcados, no se guardó el vínculo';

export function validarVinculo(cuerpo: unknown) {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};
  const persona = texto(datos.persona_apoderado_id).toLowerCase();
  if (
    (datos.persona_apoderado_id != null &&
      typeof datos.persona_apoderado_id !== 'string') ||
    (persona && !esUuid(persona))
  )
    errores.persona_apoderado_id = 'Elige una persona de tu escuela';
  const relacion = texto(datos.tipo_relacion);
  if (!relacion || relacion.length > 60)
    errores.tipo_relacion = 'Indica la relación, hasta 60 caracteres';
  for (const campo of ['es_principal', 'puede_ser_contactado'])
    if (typeof datos[campo] !== 'boolean') errores[campo] = 'Indica Sí o No';
  const desde = texto(datos.activo_desde);
  const hasta = texto(datos.activo_hasta);
  if (
    (datos.activo_desde != null && typeof datos.activo_desde !== 'string') ||
    (desde && !fechaValida(desde))
  )
    errores.activo_desde = 'Ingresa una fecha válida';
  if (
    (datos.activo_hasta != null && typeof datos.activo_hasta !== 'string') ||
    (hasta && !fechaValida(hasta))
  )
    errores.activo_hasta = 'Ingresa una fecha válida';
  else if (desde && hasta && hasta < desde)
    errores.activo_hasta = 'El término no puede ser anterior al inicio';
  if (Object.keys(errores).length) throw errorDeCampos(errores, MENSAJE);
  const nueva = persona ? null : validarPersona(datos.persona);
  return {
    persona_apoderado_id: persona || null,
    persona: nueva,
    tipo_relacion: relacion,
    es_principal: datos.es_principal as boolean,
    puede_ser_contactado: datos.puede_ser_contactado as boolean,
    activo_desde: desde || null,
    activo_hasta: hasta || null,
  };
}

function validarPersona(cuerpo: unknown) {
  const datos = objeto(cuerpo);
  const errores: Record<string, string> = {};
  const campos = [
    'nombres',
    'apellidos',
    'correo',
    'telefono',
    'direccion',
  ] as const;
  const valores = Object.fromEntries(
    campos.map((campo) => [campo, texto(datos[campo])]),
  ) as Record<(typeof campos)[number], string>;
  for (const campo of campos) {
    if (datos[campo] != null && typeof datos[campo] !== 'string')
      errores[campo] = 'Ingresa un texto válido';
    else if (valores[campo].length > LARGO_MAXIMO_ESTUDIANTE[campo])
      errores[campo] = `Usa hasta ${LARGO_MAXIMO_ESTUDIANTE[campo]} caracteres`;
  }
  if (!valores.nombres) errores.nombres = 'Ingresa los nombres';
  if (!valores.apellidos) errores.apellidos = 'Ingresa los apellidos';
  const rutEscrito = texto(datos.rut);
  const rut = rutEscrito ? normalizarRut(rutEscrito) : null;
  if (
    (datos.rut != null && typeof datos.rut !== 'string') ||
    (rutEscrito && !rut)
  )
    errores.rut = 'Revisa el RUT y su dígito verificador';
  const correo = valores.correo.toLowerCase();
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))
    errores.correo = 'Ingresa un correo válido';
  if (
    valores.telefono &&
    (!/^\+?[0-9 ()-]+$/.test(valores.telefono) ||
      valores.telefono.replace(/\D/g, '').length < 8)
  )
    errores.telefono = 'Ingresa un teléfono válido';
  if (Object.keys(errores).length) throw errorDeCampos(errores, MENSAJE);
  return {
    ...valores,
    rut,
    correo: correo || null,
    telefono: valores.telefono || null,
    direccion: valores.direccion || null,
  };
}

export function validarFinVinculo(cuerpo: unknown) {
  const fecha = texto(objeto(cuerpo).activo_hasta);
  if (!fechaValida(fecha))
    throw errorDeCampos(
      { activo_hasta: 'Indica una fecha de término válida' },
      MENSAJE,
    );
  return fecha;
}
