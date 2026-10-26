import { BadRequestException } from '@nestjs/common';
import {
  validarArchivo,
  type ArchivoSubido,
} from '../situaciones/archivo-evidencia.js';

export const TIPOS_DOCUMENTO = [
  'RICE',
  'FUENTE_PROTOCOLO',
  'PLAN',
  'POLITICA',
  'PLANTILLA',
  'OTRO',
] as const;

function cuerpo(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
    ? (valor as Record<string, unknown>)
    : {};
}

function texto(datos: Record<string, unknown>, campo: string) {
  return typeof datos[campo] === 'string'
    ? datos[campo].normalize('NFC').trim().replace(/\s+/g, ' ')
    : '';
}

export function validarCarga(
  valor: unknown,
  archivo: ArchivoSubido | undefined,
  nuevo: boolean,
) {
  const datos = cuerpo(valor),
    errores: Record<string, string> = {};
  const titulo = texto(datos, 'titulo'),
    etiqueta = texto(datos, 'etiqueta_version');
  const tipo = TIPOS_DOCUMENTO.find((t) => t === datos.tipo_documento);
  if (nuevo && (!titulo || titulo.length > 220))
    errores.titulo = 'Escribe un título de hasta 220 caracteres';
  if (nuevo && !tipo) errores.tipo_documento = 'Elige el tipo de documento';
  if (!etiqueta || etiqueta.length > 60)
    errores.etiqueta_version =
      'Escribe una etiqueta de hasta 60 caracteres, por ejemplo 2026 o 2026 corregida';
  const revisado = validarArchivo(archivo);
  if ('error' in revisado) errores.archivo = revisado.error;
  else if (!['pdf', 'docx'].includes(revisado.formato))
    errores.archivo = 'Adjunta un documento PDF o Word DOCX';
  if ('error' in revisado || Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados, no se guardó el documento',
      errores,
    });
  return { titulo, tipo: tipo!, etiqueta, archivo: revisado };
}

export function validarVigencia(valor: unknown, cierre = false) {
  const datos = cuerpo(valor),
    errores: Record<string, string> = {};
  const desde = texto(datos, 'vigente_desde'),
    hasta = texto(datos, 'vigente_hasta');
  function valida(fecha: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < '0001-01-01')
      return false;
    const d = new Date(`${fecha}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === fecha
    );
  }
  if (!cierre && !valida(desde))
    errores.vigente_desde = 'Indica una fecha de inicio válida';
  if ((hasta || cierre) && !valida(hasta))
    errores.vigente_hasta = 'Indica una fecha de término válida';
  if (!cierre && desde && hasta && hasta < desde)
    errores.vigente_hasta = 'El término no puede ser anterior al inicio';
  if (Object.keys(errores).length)
    throw new BadRequestException({
      mensaje: 'Revisa las fechas marcadas',
      errores,
    });
  return { desde, hasta: hasta || null };
}
