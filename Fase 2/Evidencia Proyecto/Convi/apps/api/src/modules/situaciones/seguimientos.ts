import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { fechaHora } from './encuentros.js';
import { ZONA_ESCUELA } from './plan-intervencion.js';

export const ESTADOS_COMPROMISO = [
  'PENDIENTE',
  'EN_PROGRESO',
  'COMPLETADO',
  'VENCIDO',
  'CANCELADO',
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = /^[0-9a-f]{32}$/;
export function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}
function campos(cuerpo: unknown) {
  const datos = objeto(cuerpo),
    errores: Record<string, string> = {};
  return {
    datos,
    errores,
    texto(nombre: string, max: number, opcional = false) {
      const valor =
        typeof datos[nombre] === 'string' ? datos[nombre].trim() : '';
      if ((!valor && !opcional) || valor.length > max)
        errores[nombre] = `Indica un texto de hasta ${max} caracteres`;
      return valor;
    },
    id(nombre: string, opcional = false) {
      const valor = datos[nombre];
      if (opcional && (valor === '' || valor == null)) return null;
      if (typeof valor !== 'string' || !UUID.test(valor))
        errores[nombre] = 'Elige una opción válida';
      return typeof valor === 'string' ? valor : '';
    },
    fecha(nombre: string) {
      const valor = fechaHora(datos[nombre]);
      if (!valor) errores[nombre] = 'Indica una fecha y hora válidas';
      return valor!;
    },
    version() {
      if (typeof datos.version !== 'string' || !VERSION.test(datos.version))
        errores.version = 'Recarga la página antes de continuar';
      return datos.version as string;
    },
    terminar() {
      if (Object.keys(errores).length)
        throw new BadRequestException({
          mensaje: 'Revisa los datos marcados',
          errores,
        });
    },
  };
}
export function validarCompromiso(cuerpo: unknown) {
  const c = campos(cuerpo);
  const datos = {
    descripcion: c.texto('descripcion', 2000),
    persona_responsable_id: c.id('persona_responsable_id')!,
    vence_en: c.fecha('vence_en'),
    actuacion_origen_id: c.id('actuacion_origen_id', true),
  };
  c.terminar();
  return datos;
}
export function validarSeguimiento(cuerpo: unknown) {
  const c = campos(cuerpo);
  const datos = {
    objetivo: c.texto('objetivo', 1000),
    responsable_id: c.id('responsable_id')!,
    programado_en: c.fecha('programado_en'),
  };
  c.terminar();
  return datos;
}
export function validarRevision(cuerpo: unknown) {
  const c = campos(cuerpo);
  const estado = ESTADOS_COMPROMISO.find((e) => e === c.datos.estado_observado);
  if (!estado) c.errores.estado_observado = 'Elige el cumplimiento observado';
  const datos = {
    compromiso_id: c.id('compromiso_id')!,
    estado_observado: estado!,
    observacion: c.texto('observacion', 2000),
    version: c.version(),
  };
  c.terminar();
  return datos;
}
export function validarResultadoSeguimiento(cuerpo: unknown) {
  const c = campos(cuerpo);
  const datos = {
    realizado_en: c.fecha('realizado_en'),
    resultado: c.texto('resultado', 4000),
    proxima_accion: c.texto('proxima_accion', 2000),
    version: c.version(),
    revisiones: [] as ReturnType<typeof validarRevision>[],
    siguiente: null as ReturnType<typeof validarSeguimiento> | null,
  };
  if (!Array.isArray(c.datos.revisiones) || c.datos.revisiones.length > 100)
    c.errores.revisiones = 'Revisa hasta 100 compromisos por seguimiento';
  else {
    datos.revisiones = c.datos.revisiones.map(validarRevision);
    if (
      new Set(datos.revisiones.map((r) => r.compromiso_id)).size !==
      datos.revisiones.length
    )
      c.errores.revisiones =
        'Un compromiso solo se revisa una vez por seguimiento';
  }
  if (c.datos.siguiente != null)
    datos.siguiente = validarSeguimiento(c.datos.siguiente);
  if (datos.siguiente && datos.siguiente.programado_en <= datos.realizado_en)
    c.errores.programado_en =
      'El siguiente seguimiento debe ser posterior a lo realizado';
  c.terminar();
  return datos;
}

export async function compromisosDelCaso(db: PoolClient, casoId: string) {
  return (
    await db.query(
      `SELECT c.id, c.descripcion, c.persona_responsable_id, p.nombres || ' ' || p.apellidos AS responsable,
    c.estado, c.vence_en, c.completado_en, c.nota_cumplimiento, c.actuacion_origen_id,
    a.objetivo AS origen, autor.nombres || ' ' || autor.apellidos AS creado_por, c.creado_en,
    to_char(c.vence_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD"T"HH24:MI') AS vence_local,
    c.estado NOT IN ('COMPLETADO','CANCELADO') AND c.vence_en < now() AS vencido,
    md5(to_jsonb(c)::text) AS version,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'actuacion_id',r.actuacion_id,
      'estado',r.estado_observado,'observacion',r.observacion,'registrado_en',r.registrado_en,
      'autor',rp.nombres || ' ' || rp.apellidos) ORDER BY r.registrado_en DESC,r.id)
      FROM convi.revisiones_compromisos r JOIN convi.membresias_establecimiento rm ON rm.id=r.creado_por
      JOIN convi.personas rp ON rp.id=rm.persona_id WHERE r.compromiso_id=c.id),'[]'::jsonb) AS revisiones
    FROM convi.compromisos c JOIN convi.personas p ON p.id=c.persona_responsable_id
    JOIN convi.membresias_establecimiento m ON m.id=c.creado_por JOIN convi.personas autor ON autor.id=m.persona_id
    LEFT JOIN convi.actuaciones a ON a.id=c.actuacion_origen_id
    WHERE c.caso_id=$1 ORDER BY c.estado IN ('COMPLETADO','CANCELADO'),c.vence_en,c.id`,
      [casoId],
    )
  ).rows;
}
export async function seguimientosDelCaso(db: PoolClient, casoId: string) {
  return (
    await db.query(
      `SELECT a.id,a.estado,a.objetivo,a.programado_en,a.realizado_en,a.resultado,a.proxima_accion,
    a.seguimiento_anterior_id,a.proximo_seguimiento_en,md5(to_jsonb(a)::text) AS version,
    to_char(a.programado_en AT TIME ZONE ${ZONA_ESCUELA}, 'YYYY-MM-DD"T"HH24:MI') AS programado_local,
    p.nombres || ' ' || p.apellidos AS responsable,
    (SELECT s.id FROM convi.actuaciones s WHERE s.seguimiento_anterior_id=a.id) AS siguiente_id,
    coalesce((SELECT jsonb_agg(jsonb_build_object('fecha_anterior',e.metadatos->'antes'->>'programado_en',
       'fecha_nueva',e.metadatos->'despues'->>'programado_en','motivo',e.metadatos->>'motivo',
       'ocurrido_en',e.ocurrido_en) ORDER BY e.ocurrido_en DESC)
       FROM convi.eventos_auditoria e WHERE e.tipo_recurso='actuaciones' AND e.recurso_id=a.id
       AND e.metadatos->'antes'->>'programado_en' IS DISTINCT FROM e.metadatos->'despues'->>'programado_en'),'[]'::jsonb) AS reprogramaciones
    FROM convi.actuaciones a JOIN convi.membresias_establecimiento m ON m.id=a.membresia_responsable_id
    JOIN convi.personas p ON p.id=m.persona_id WHERE a.caso_id=$1 AND a.tipo_actuacion='SEGUIMIENTO'
    ORDER BY a.estado IN ('PLANIFICADA','POSPUESTA') DESC,a.programado_en,a.id`,
      [casoId],
    )
  ).rows;
}
