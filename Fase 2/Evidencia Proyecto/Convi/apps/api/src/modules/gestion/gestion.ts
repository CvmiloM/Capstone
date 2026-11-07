import { BadRequestException } from '@nestjs/common';
import { esDia } from '../situaciones/plan-intervencion.js';

export const TIPOS = [
  'planes',
  'objetivos',
  'acciones',
  'actividades',
] as const;
export type TipoGestion = (typeof TIPOS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function errorCampo(campo: string, mensaje: string): never {
  throw new BadRequestException({
    mensaje: 'Revisa los datos marcados.',
    errores: { [campo]: mensaje },
  });
}
export function objeto(valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    throw new BadRequestException('Los datos no son válidos.');
  return valor as Record<string, unknown>;
}
export function texto(
  d: Record<string, unknown>,
  campo: string,
  max: number,
  requerido = true,
): string | null {
  const v = d[campo];
  if (v !== undefined && v !== null && typeof v !== 'string')
    errorCampo(campo, 'Escribe un texto válido.');
  const t = typeof v === 'string' ? v.trim() : '';
  if ((!t && requerido) || t.length > max)
    errorCampo(
      campo,
      `Escribe ${requerido ? 'entre 1 y' : 'hasta'} ${max} caracteres.`,
    );
  return t || null;
}
export function uuid(d: Record<string, unknown>, campo: string): string {
  if (typeof d[campo] !== 'string' || !UUID.test(d[campo]))
    errorCampo(campo, 'Selecciona una opción válida.');
  return d[campo];
}
export function tipoGestion(tipo: string): TipoGestion {
  if (!TIPOS.includes(tipo as TipoGestion))
    throw new BadRequestException('La sección no existe.');
  return tipo as TipoGestion;
}
export function version(d: Record<string, unknown>): string {
  if (typeof d.version !== 'string' || !/^[a-f0-9]{32}$/.test(d.version))
    errorCampo('version', 'Recarga la página antes de guardar.');
  return d.version;
}
export function motivo(d: Record<string, unknown>): string {
  const t = texto(d, 'motivo', 500)!;
  if (t.length < 10)
    errorCampo('motivo', 'Explica el motivo con al menos 10 caracteres.');
  return t;
}
export function fecha(
  d: Record<string, unknown>,
  campo: string,
  requerida = true,
): string | null {
  const t = texto(d, campo, 16, requerida);
  if (!t) return null;
  if (
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t) ||
    !esDia(t.slice(0, 10)) ||
    Number(t.slice(11, 13)) > 23 ||
    Number(t.slice(14)) > 59
  )
    errorCampo(campo, 'Elige una fecha y hora válidas.');
  return t;
}
function numero(d: Record<string, unknown>, campo: string): number | null {
  const v = d[campo];
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e15)
    errorCampo(campo, 'Escribe un número válido.');
  return v;
}
export function datosObjetivo(cuerpo: unknown) {
  const d = objeto(cuerpo);
  if (
    !Number.isSafeInteger(d.orden) ||
    Number(d.orden) < 1 ||
    Number(d.orden) > 1000000
  )
    errorCampo('orden', 'El orden debe ser un número entero mayor que cero.');
  return {
    titulo: texto(d, 'titulo', 220)!,
    descripcion: texto(d, 'descripcion', 4000, false),
    orden: Number(d.orden),
  };
}
export function datosAccion(cuerpo: unknown) {
  const d = objeto(cuerpo);
  const meta = numero(d, 'meta_indicador'),
    valor = numero(d, 'valor_indicador');
  const nombre = texto(d, 'nombre_indicador', 220, false),
    unidad = texto(d, 'unidad_indicador', 40, false);
  if ((meta !== null || valor !== null) && (!nombre || !unidad))
    errorCampo('nombre_indicador', 'Indica qué vas a medir y su unidad.');
  return {
    titulo: texto(d, 'titulo', 220)!,
    descripcion: texto(d, 'descripcion', 4000)!,
    persona_responsable_id: uuid(d, 'persona_responsable_id'),
    publico_objetivo: texto(d, 'publico_objetivo', 180)!,
    evidencia_esperada: texto(d, 'evidencia_esperada', 2000)!,
    nombre_indicador: nombre,
    unidad_indicador: unidad,
    meta_indicador: meta,
    valor_indicador: valor,
  };
}
export function datosActividad(cuerpo: unknown) {
  const d = objeto(cuerpo);
  const inicio = fecha(d, 'inicio_programado')!,
    fin = fecha(d, 'fin_programado')!;
  if (fin < inicio)
    errorCampo('fin_programado', 'El término no puede ser anterior al inicio.');
  return {
    titulo: texto(d, 'titulo', 220)!,
    descripcion: texto(d, 'descripcion', 4000, false),
    persona_responsable_id: uuid(d, 'persona_responsable_id'),
    inicio_programado: inicio,
    fin_programado: fin,
    lugar: texto(d, 'lugar', 160, false),
  };
}
export function datosCreacion(cuerpo: unknown) {
  const d = objeto(cuerpo);
  const id = uuid(d, 'id'),
    anio = uuid(d, 'anio_academico_id'),
    nombre = texto(d, 'nombre', 220)!;
  if ((d.objetivo === undefined) !== (d.accion === undefined))
    errorCampo(
      'objetivo',
      'Prepara el objetivo y la primera acción antes de confirmar.',
    );
  return {
    id,
    anio_academico_id: anio,
    nombre,
    objetivo: d.objetivo === undefined ? null : datosObjetivo(d.objetivo),
    accion: d.accion === undefined ? null : datosAccion(d.accion),
  };
}
export function datosResultado(cuerpo: unknown, actividad: boolean) {
  const d = objeto(cuerpo);
  const estado = texto(d, 'estado', 30)!;
  if (
    !['PLANIFICADO', 'EN_PROGRESO', 'COMPLETADO', 'CANCELADO'].includes(estado)
  )
    errorCampo('estado', 'Selecciona un estado válido.');
  const resumen = texto(d, 'resumen_resultado', 4000, estado === 'COMPLETADO');
  const completado = fecha(d, 'completado_en', estado === 'COMPLETADO');
  const inicio = actividad
    ? fecha(d, 'inicio_real', estado === 'COMPLETADO')
    : null;
  const fin = actividad ? fecha(d, 'fin_real', estado === 'COMPLETADO') : null;
  if (fin && (!inicio || fin < inicio))
    errorCampo('fin_real', 'El término real no puede ser anterior al inicio.');
  return {
    estado,
    resumen_resultado: resumen,
    completado_en: completado,
    inicio_real: inicio,
    fin_real: fin,
    valor_indicador: actividad ? null : numero(d, 'valor_indicador'),
  };
}
export function filtrosGestion(q: Record<string, unknown>) {
  const pagina =
    q.pagina === undefined || q.pagina === '' ? 1 : Number(q.pagina);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000)
    errorCampo('pagina', 'La página no es válida.');
  const buscar = texto(q, 'q', 120, false) ?? '';
  const anio = q.anio === undefined || q.anio === '' ? null : Number(q.anio);
  if (anio !== null && (!Number.isInteger(anio) || anio < 2000 || anio > 2200))
    errorCampo('anio', 'Indica un año válido.');
  for (const campo of ['plan_id', 'objetivo_id', 'accion_id', 'seleccionado'])
    if (q[campo]) uuid(q, campo);
  return { pagina, buscar, anio };
}
