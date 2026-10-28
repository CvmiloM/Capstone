import { BadRequestException } from '@nestjs/common';
import { CAMPOS_ADMINISTRATIVOS, OPCIONES_AUDITORIA } from './opciones.js';

export const LIMITE_AUDITORIA = 50;
type Cursor = { fecha: string; id: string; tipo: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leerCursor(entrada: unknown): Cursor | null {
  if (entrada === undefined || entrada === '') return null;
  try {
    if (typeof entrada !== 'string' || !/^[\w-]{1,400}$/.test(entrada))
      throw new Error();
    const datos: unknown = JSON.parse(
      Buffer.from(entrada, 'base64url').toString(),
    );
    if (!Array.isArray(datos) || datos.length !== 3) throw new Error();
    const [fecha, id, tipo] = datos as unknown[];
    if (
      typeof fecha !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(fecha) ||
      !Number.isFinite(Date.parse(fecha)) ||
      new Date(fecha).toISOString().slice(0, 19) !== fecha.slice(0, 19) ||
      fecha.startsWith('0000') ||
      typeof id !== 'string' ||
      !UUID.test(id) ||
      typeof tipo !== 'string' ||
      !/^[A-Z_]{1,80}$/.test(tipo)
    )
      throw new Error();
    return { fecha, id, tipo };
  } catch {
    throw new BadRequestException('La página del historial no es válida');
  }
}

export type FilaAuditoria = {
  id: string;
  tipo: string;
  recurso: string;
  referencia: string | null;
  fecha: string;
  autor: string | null;
  resultado: string;
  descripcion?: string | null;
  fecha_evento?: string | null;
  referencia_nombre?: string | null;
  campos_modificados?: string[] | null;
};

function detalleAdministrativo(e: FilaAuditoria) {
  const permitidos = CAMPOS_ADMINISTRATIVOS[e.recurso];
  const campos = (e.campos_modificados ?? []).filter((c) =>
    Object.values(permitidos ?? {}).includes(c),
  );
  return {
    referencia_nombre: permitidos ? e.referencia_nombre || null : null,
    resumen: !permitidos
      ? 'El detalle de este registro no se muestra en la auditoría administrativa'
      : campos.length
        ? `Se actualizaron estos datos: ${campos.join(', ')}`
        : 'Este evento no conserva un desglose de los datos modificados',
  };
}

// La respuesta se construye campo por campo, nunca se entrega metadatos al navegador.
export function paginaAuditoria(filas: FilaAuditoria[], contenido: boolean) {
  const visibles = filas.slice(0, LIMITE_AUDITORIA);
  const ultima = visibles.at(-1);
  return {
    opciones: OPCIONES_AUDITORIA,
    eventos: visibles.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      recurso: e.recurso,
      referencia: e.referencia,
      fecha: e.fecha,
      autor: e.autor,
      resultado: e.resultado,
      ...(contenido
        ? {
            descripcion: e.descripcion ?? null,
            fecha_evento: e.fecha_evento ?? null,
          }
        : detalleAdministrativo(e)),
    })),
    siguiente:
      filas.length > LIMITE_AUDITORIA && ultima
        ? Buffer.from(
            JSON.stringify([ultima.fecha, ultima.id, ultima.tipo]),
          ).toString('base64url')
        : null,
  };
}

const CAMPOS_FILTRO = [
  'colaborador',
  'fecha',
  'desde',
  'hasta',
  'palabras',
  'recurso',
  'accion',
  'resultado',
] as const;

export function validarFiltros(entrada: unknown) {
  const datos = entrada ?? {};
  if (
    typeof datos !== 'object' ||
    Array.isArray(datos) ||
    Object.keys(datos).some(
      (c) =>
        c !== 'antes' &&
        !CAMPOS_FILTRO.includes(c as (typeof CAMPOS_FILTRO)[number]),
    )
  )
    throw new BadRequestException('Los filtros no son válidos');
  const filtros = Object.fromEntries(
    CAMPOS_FILTRO.map((campo) => {
      const v = (datos as Record<string, unknown>)[campo] ?? '';
      if (
        typeof v !== 'string' ||
        v.length > (campo === 'palabras' ? 160 : 100)
      )
        throw new BadRequestException('Revisa el texto de los filtros');
      return [campo, v.trim().replace(/\s+/g, ' ')];
    }),
  ) as Record<(typeof CAMPOS_FILTRO)[number], string>;
  for (const campo of ['fecha', 'desde', 'hasta'] as const) {
    const v = filtros[campo];
    if (
      v &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        v.startsWith('0000') ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      throw new BadRequestException('Elige una fecha válida');
  }
  if (filtros.fecha && (filtros.desde || filtros.hasta))
    throw new BadRequestException(
      'Elige una fecha específica o un rango, usa solo una de las dos opciones',
    );
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta)
    throw new BadRequestException(
      'La fecha Desde debe ser anterior o igual a Hasta',
    );
  for (const campo of ['recurso', 'accion', 'resultado'] as const) {
    if (filtros[campo] && !/^[a-zA-Z_]{1,80}$/.test(filtros[campo]))
      throw new BadRequestException('Elige una opción válida para el filtro');
  }
  if (filtros.palabras.split(/\s+/).filter(Boolean).length > 10)
    throw new BadRequestException('Usa como máximo diez palabras clave');
  return filtros;
}

export const normalizarBusqueda = (texto: string) =>
  texto
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => 'aeiouun'['áéíóúüñ'.indexOf(c)]);
