import { BadRequestException } from '@nestjs/common';

// PB-085 (HU-074): calendario de Convivencia. Reglas sin base de datos: el mes
// pedido y los tipos de evento. Los eventos salen de la vista convi.vw_calendario
// (security_invoker), así que la seguridad por fila de cada tabla de origen
// decide qué se ve, y el calendario no guarda copias (CA2).

export const TIPOS_EVENTO = [
  'ACTUACION',
  'COMPROMISO',
  'PASO_PROTOCOLO',
  'ACCION_INTERVENCION',
  'PLAN_GESTION',
] as const;

export type TipoEvento = (typeof TIPOS_EVENTO)[number];

/** Más eventos que estos en un mes no se muestran: el calendario lo avisa. */
export const MAXIMO_EVENTOS = 1500;

const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * ?mes=AAAA-MM (por defecto el mes actual de la escuela) y ?tipos= con los
 * tipos separados por coma (por defecto todos).
 */
export function leerFiltrosCalendario(consulta: Record<string, unknown> = {}): {
  mes: string | null;
  tipos: TipoEvento[] | null;
} {
  const mes = consulta.mes;
  if (mes !== undefined && mes !== '') {
    const valor = typeof mes === 'string' ? MES.exec(mes) : null;
    if (!valor || Number(valor[1]) < 2000 || Number(valor[1]) > 2100)
      throw new BadRequestException('Revisa el mes del calendario.');
  }
  const tipos = consulta.tipos;
  let lista: TipoEvento[] | null = null;
  if (tipos !== undefined && tipos !== '') {
    const partes = typeof tipos === 'string' ? tipos.split(',') : [];
    const validos = partes.filter((t): t is TipoEvento =>
      TIPOS_EVENTO.some((x) => x === t),
    );
    if (validos.length === 0 || validos.length !== partes.length)
      throw new BadRequestException('Revisa los tipos de evento.');
    lista = [...new Set(validos)];
  }
  return {
    mes: typeof mes === 'string' && mes !== '' ? mes : null,
    tipos: lista,
  };
}

/** Estados en que el evento ya no está pendiente, por tabla de origen. */
export const ESTADOS_TERMINADOS = [
  'REALIZADA',
  'CANCELADA',
  'COMPLETADO',
  'CANCELADO',
  'OMITIDO',
] as const;
