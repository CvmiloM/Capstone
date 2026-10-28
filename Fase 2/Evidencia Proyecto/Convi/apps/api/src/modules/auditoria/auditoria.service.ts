import { Inject, Injectable } from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  leerCursor,
  LIMITE_AUDITORIA,
  paginaAuditoria,
  validarFiltros,
  normalizarBusqueda,
  type FilaAuditoria,
} from './auditoria.js';
import { CAMPOS_ADMINISTRATIVOS, OPCIONES_AUDITORIA } from './opciones.js';

@Injectable()
export class AuditoriaService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  administrativa(sesion: Sesion, consulta: unknown) {
    const filtros = validarFiltros(consulta);
    const cursor = leerCursor(
      (consulta as Record<string, unknown> | undefined)?.antes,
    );
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      async (db) => {
        const { rows } = await db.query<FilaAuditoria>(
          `SELECT e.id, e.codigo_accion AS tipo, e.tipo_recurso AS recurso,
                e.recurso_id AS referencia, e.codigo_resultado AS resultado,
                to_char(e.ocurrido_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha,
                p.nombres || ' ' || p.apellidos AS autor,
                detalle.referencia_nombre, cambios.campos_modificados
         FROM convi.eventos_auditoria e
         LEFT JOIN convi.membresias_establecimiento m
           ON m.id = e.membresia_actor_id AND m.establecimiento_id = e.establecimiento_id
         LEFT JOIN convi.personas p ON p.id = m.persona_id AND p.establecimiento_id = e.establecimiento_id
         LEFT JOIN LATERAL (
           SELECT CASE e.tipo_recurso
             WHEN 'establecimientos' THEN coalesce(e.metadatos->'despues'->>'nombre', e.metadatos->'antes'->>'nombre',
               (SELECT nombre FROM convi.establecimientos WHERE id = e.recurso_id AND id = e.establecimiento_id))
             WHEN 'documentos_institucionales' THEN coalesce(e.metadatos->'despues'->>'titulo', e.metadatos->'antes'->>'titulo',
               (SELECT titulo FROM convi.documentos_institucionales WHERE id = e.recurso_id AND establecimiento_id = e.establecimiento_id))
             WHEN 'versiones_documento' THEN nullif(concat_ws(' — ',
               (SELECT d.titulo FROM convi.versiones_documento v
                 JOIN convi.documentos_institucionales d ON d.id = v.documento_id AND d.establecimiento_id = v.establecimiento_id
                 WHERE v.id = e.recurso_id AND v.establecimiento_id = e.establecimiento_id),
               coalesce(e.metadatos->'despues'->>'etiqueta_version', e.metadatos->'antes'->>'etiqueta_version',
                 (SELECT etiqueta_version FROM convi.versiones_documento WHERE id = e.recurso_id AND establecimiento_id = e.establecimiento_id))), '')
             WHEN 'anios_academicos' THEN coalesce(e.metadatos->'despues'->>'anio', e.metadatos->'antes'->>'anio')
             WHEN 'niveles_educativos' THEN coalesce(e.metadatos->'despues'->>'nombre', e.metadatos->'antes'->>'nombre')
             WHEN 'cursos' THEN coalesce(e.metadatos->'despues'->>'nombre', e.metadatos->'antes'->>'nombre')
             WHEN 'personas' THEN nullif(concat_ws(' ',
               coalesce(e.metadatos->'despues'->>'nombres', e.metadatos->'antes'->>'nombres'),
               coalesce(e.metadatos->'despues'->>'apellidos', e.metadatos->'antes'->>'apellidos')), '')
             WHEN 'estudiantes' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos || ' — ' || estudiante.codigo_estudiante
                 FROM convi.estudiantes estudiante JOIN convi.personas persona ON persona.id = estudiante.persona_id AND persona.establecimiento_id = estudiante.establecimiento_id
                 WHERE estudiante.id = e.recurso_id AND estudiante.establecimiento_id = e.establecimiento_id)
             WHEN 'membresias_establecimiento' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos FROM convi.membresias_establecimiento cuenta
                 JOIN convi.personas persona ON persona.id = cuenta.persona_id AND persona.establecimiento_id = cuenta.establecimiento_id
                 WHERE cuenta.id = e.recurso_id AND cuenta.establecimiento_id = e.establecimiento_id)
             WHEN 'apoderados_estudiante' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos || ' — Apoderado de ' || alumno.nombres || ' ' || alumno.apellidos
                 FROM convi.apoderados_estudiante vinculo
                 JOIN convi.personas persona ON persona.id = vinculo.persona_apoderado_id AND persona.establecimiento_id = vinculo.establecimiento_id
                 JOIN convi.estudiantes estudiante ON estudiante.id = vinculo.estudiante_id AND estudiante.establecimiento_id = vinculo.establecimiento_id
                 JOIN convi.personas alumno ON alumno.id = estudiante.persona_id AND alumno.establecimiento_id = estudiante.establecimiento_id
                 WHERE vinculo.id = e.recurso_id AND vinculo.establecimiento_id = e.establecimiento_id)
             WHEN 'matriculas' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos || ' — ' || curso.nombre || ' — ' || anio.anio::text
                 FROM convi.matriculas matricula
                 JOIN convi.estudiantes estudiante ON estudiante.id = matricula.estudiante_id AND estudiante.establecimiento_id = matricula.establecimiento_id
                 JOIN convi.personas persona ON persona.id = estudiante.persona_id AND persona.establecimiento_id = estudiante.establecimiento_id
                 JOIN convi.cursos curso ON curso.id = matricula.curso_id AND curso.establecimiento_id = matricula.establecimiento_id
                 JOIN convi.anios_academicos anio ON anio.id = matricula.anio_academico_id AND anio.establecimiento_id = matricula.establecimiento_id
                 WHERE matricula.id = e.recurso_id AND matricula.establecimiento_id = e.establecimiento_id)
             WHEN 'asignaciones_docentes' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos || ' — ' || curso.nombre
                 FROM convi.asignaciones_docentes asignacion
                 JOIN convi.membresias_establecimiento cuenta ON cuenta.id = asignacion.membresia_id AND cuenta.establecimiento_id = asignacion.establecimiento_id
                 JOIN convi.personas persona ON persona.id = cuenta.persona_id AND persona.establecimiento_id = cuenta.establecimiento_id
                 JOIN convi.cursos curso ON curso.id = asignacion.curso_id AND curso.establecimiento_id = asignacion.establecimiento_id
                 WHERE asignacion.id = e.recurso_id AND asignacion.establecimiento_id = e.establecimiento_id)
             WHEN 'accesos_apoderado' THEN
               (SELECT persona.nombres || ' ' || persona.apellidos FROM convi.accesos_apoderado acceso
                 JOIN convi.membresias_establecimiento cuenta ON cuenta.id = acceso.membresia_apoderado_id AND cuenta.establecimiento_id = acceso.establecimiento_id
                 JOIN convi.personas persona ON persona.id = cuenta.persona_id AND persona.establecimiento_id = cuenta.establecimiento_id
                 WHERE acceso.id = e.recurso_id AND acceso.establecimiento_id = e.establecimiento_id)
             WHEN 'categorias_convivencia' THEN coalesce(e.metadatos->'despues'->>'nombre', e.metadatos->'antes'->>'nombre')
             WHEN 'protocolos' THEN coalesce(e.metadatos->'despues'->>'nombre', e.metadatos->'antes'->>'nombre')
             WHEN 'versiones_protocolo' THEN
               (SELECT protocolo.nombre || ' — Versión ' || coalesce(e.metadatos->'despues'->>'numero_version', e.metadatos->'antes'->>'numero_version', v.numero_version::text)
                 FROM convi.versiones_protocolo v JOIN convi.protocolos protocolo ON protocolo.id = v.protocolo_id AND protocolo.establecimiento_id = v.establecimiento_id
                 WHERE v.id = e.recurso_id AND v.establecimiento_id = e.establecimiento_id)
           END AS referencia_nombre
         ) detalle ON true
         LEFT JOIN LATERAL (
           SELECT array_agg(c.value ORDER BY c.value) AS campos_modificados
           FROM jsonb_each_text(coalesce($15::jsonb->e.tipo_recurso, '{}'::jsonb)) c
           WHERE jsonb_typeof(e.metadatos->'antes') = 'object'
             AND jsonb_typeof(e.metadatos->'despues') = 'object'
             AND e.metadatos->'antes'->c.key IS DISTINCT FROM e.metadatos->'despues'->c.key
         ) cambios ON true
         WHERE e.establecimiento_id = convi.establecimiento_actual()
           AND ($1::timestamptz IS NULL OR (e.ocurrido_en, e.id, e.codigo_accion) < ($1::timestamptz, $2::uuid, $3::text))
           AND ($5::text = '' OR position($5 in translate(lower(coalesce(p.nombres || ' ' || p.apellidos, 'Proceso del sistema')), 'áéíóúüñ', 'aeiouun')) > 0)
           AND ($6::date IS NULL OR e.ocurrido_en >= $6::date::timestamptz)
           AND ($7::date IS NULL OR e.ocurrido_en < ($7::date + 1)::timestamptz)
           AND ($9::text IS NULL OR e.tipo_recurso = $9)
           AND ($10::text IS NULL OR e.codigo_accion = $10)
           AND ($11::text IS NULL OR e.codigo_resultado = $11
             OR ($11 = 'OK' AND e.codigo_resultado = 'EXITO')
             OR ($11 = 'ERROR' AND e.codigo_resultado = 'FALLIDO'))
           AND (cardinality($8::text[]) = 0 OR NOT EXISTS (
             SELECT 1 FROM unnest($8::text[]) palabra
             WHERE position(palabra in translate(lower(replace(concat_ws(' ',
               coalesce(p.nombres || ' ' || p.apellidos, 'Proceso del sistema'),
               e.codigo_accion, e.tipo_recurso, e.codigo_resultado, e.recurso_id::text,
               detalle.referencia_nombre, array_to_string(cambios.campos_modificados, ' '),
               $12::jsonb->>e.tipo_recurso, $13::jsonb->>e.codigo_accion,
               $14::jsonb->>e.codigo_resultado), '_', ' ')), 'áéíóúüñ', 'aeiouun')) = 0))
         ORDER BY e.ocurrido_en DESC, e.id DESC, e.codigo_accion DESC LIMIT $4`,
          [
            cursor?.fecha ?? null,
            cursor?.id ?? null,
            cursor?.tipo ?? null,
            LIMITE_AUDITORIA + 1,
            normalizarBusqueda(filtros.colaborador),
            filtros.fecha || filtros.desde || null,
            filtros.fecha || filtros.hasta || null,
            normalizarBusqueda(filtros.palabras).split(/\s+/).filter(Boolean),
            filtros.recurso || null,
            filtros.accion || null,
            filtros.resultado || null,
            JSON.stringify(OPCIONES_AUDITORIA.recursos),
            JSON.stringify(OPCIONES_AUDITORIA.acciones),
            JSON.stringify(OPCIONES_AUDITORIA.resultados),
            JSON.stringify(CAMPOS_ADMINISTRATIVOS),
          ],
        );
        return paginaAuditoria(rows, false);
      },
    );
  }

  cronologia(sesion: Sesion, casoId: string, antes: unknown) {
    const cursor = leerCursor(antes);
    return this.cuentas.operar(
      sesion,
      { tipo: 'caso', id: casoId, perfiles: ['CONVIVENCIA'] },
      async (db) => {
        const { rows } = await db.query<FilaAuditoria>(
          `WITH cronologia AS (
           SELECT origen_id, tipo, fecha_registro, fecha_evento, descripcion, actor_id
           FROM convi.vw_cronologia_caso WHERE caso_id = $1
           UNION ALL
           SELECT e.id, 'RESPONSABLE_SITUACION', e.ocurrido_en, e.ocurrido_en,
                  'Cambio de responsable de la situación ' || s.codigo, e.membresia_actor_id
           FROM convi.eventos_auditoria e
           JOIN convi.situaciones s ON s.id = e.recurso_id AND s.establecimiento_id = e.establecimiento_id
           WHERE e.tipo_recurso = 'situaciones' AND e.codigo_accion = 'MODIFICACION' AND s.caso_id = $1
             AND e.metadatos->'antes'->>'asignado_a_membresia_id'
                 IS DISTINCT FROM e.metadatos->'despues'->>'asignado_a_membresia_id'
         )
         SELECT c.origen_id AS id, c.tipo, coalesce(e.tipo_recurso, CASE c.tipo
                  WHEN 'SITUACION' THEN 'situaciones'
                  WHEN 'REVISION' THEN 'revisiones_convivencia'
                  WHEN 'ESTADO' THEN 'historial_estados_caso'
                  WHEN 'ACTUACION' THEN 'actuaciones'
                  WHEN 'COMPROMISO' THEN 'compromisos'
                  WHEN 'COMPROMISO_REVISADO' THEN 'revisiones_compromisos'
                  WHEN 'COMUNICACION' THEN 'comunicaciones'
                  WHEN 'EVIDENCIA' THEN 'evidencias'
                  WHEN 'PROTOCOLO' THEN 'protocolos_caso'
                  WHEN 'ACLARACION' THEN 'aclaraciones_situacion'
                  WHEN 'RESPUESTA_ACLARACION' THEN 'aclaraciones_situacion'
                  ELSE 'casos' END) AS recurso,
                coalesce(e.recurso_id, c.origen_id) AS referencia, coalesce(e.codigo_resultado, 'OK') AS resultado,
                to_char(c.fecha_registro AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha,
                to_char(c.fecha_evento AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS fecha_evento,
                p.nombres || ' ' || p.apellidos AS autor,
                c.descripcion || CASE WHEN e.metadatos->'antes'->>r.campo IS DISTINCT FROM e.metadatos->'despues'->>r.campo
                  THEN ', responsable anterior: ' || coalesce(pa.nombres || ' ' || pa.apellidos, 'Sin responsable') ||
                       ', nuevo responsable: ' || coalesce(pn.nombres || ' ' || pn.apellidos, 'Sin responsable')
                  ELSE '' END AS descripcion
         FROM cronologia c
         LEFT JOIN convi.eventos_auditoria e ON e.id = c.origen_id
         LEFT JOIN LATERAL (SELECT CASE WHEN e.tipo_recurso = 'actuaciones'
           THEN 'membresia_responsable_id' ELSE 'asignado_a_membresia_id' END AS campo) r ON true
         LEFT JOIN convi.membresias_establecimiento ma ON ma.id = (e.metadatos->'antes'->>r.campo)::uuid
         LEFT JOIN convi.personas pa ON pa.id = ma.persona_id
         LEFT JOIN convi.membresias_establecimiento mn ON mn.id = (e.metadatos->'despues'->>r.campo)::uuid
         LEFT JOIN convi.personas pn ON pn.id = mn.persona_id
         LEFT JOIN convi.membresias_establecimiento m ON m.id = c.actor_id
         LEFT JOIN convi.personas p ON p.id = m.persona_id
         WHERE ($2::timestamptz IS NULL OR (c.fecha_registro, c.origen_id, c.tipo) < ($2::timestamptz, $3::uuid, $4::text))
         ORDER BY c.fecha_registro DESC, c.origen_id DESC, c.tipo DESC LIMIT $5`,
          [
            casoId,
            cursor?.fecha ?? null,
            cursor?.id ?? null,
            cursor?.tipo ?? null,
            LIMITE_AUDITORIA + 1,
          ],
        );
        return paginaAuditoria(rows, true);
      },
    );
  }
}
