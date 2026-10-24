-- PB-142 (HU-121): la fecha del hecho y la del registro se guardan por
-- separado, y cada cambio relevante conserva su autor, su motivo y los
-- movimientos anteriores, aunque una petición se salte la pantalla o la API.
-- La lectura del historial en la API está en
-- apps/api/src/modules/situaciones/cambios-situacion.spec.ts.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(22);

-- Datos ficticios: una escuela con su administrador, un profesor, dos
-- profesionales de Convivencia, un curso y una estudiante.
DO $$
DECLARE
  escuela uuid; admin uuid; anio uuid; nivel uuid; curso uuid;
  persona uuid; profe uuid; conv_1 uuid; conv_2 uuid; estudiante uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000002a1', 'admin@fechas.test', now()),
    ('00000000-0000-4000-8000-0000000002b1', 'profe@fechas.test', now()),
    ('00000000-0000-4000-8000-0000000002c1', 'conv1@fechas.test', now()),
    ('00000000-0000-4000-8000-0000000002c2', 'conv2@fechas.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000002a1', 'Ada', 'Fechas', NULL, 'Escuela Fechas');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000002a1';

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Pía', 'Profesora')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'PROFESOR', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000002b1', 'profe@fechas.test') RETURNING id INTO profe;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Carla', 'Uno')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'CONVIVENCIA', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000002c1', 'conv1@fechas.test') RETURNING id INTO conv_1;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Cristián', 'Dos')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'CONVIVENCIA', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000002c2', 'conv2@fechas.test') RETURNING id INTO conv_2;

  INSERT INTO convi.anios_academicos (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
  VALUES (escuela, 2026, '2026-03-01', '2026-12-18', 'ACTIVO') RETURNING id INTO anio;
  INSERT INTO convi.niveles_educativos (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
  VALUES (escuela, '1M', '1° Medio', 9, 'MEDIA', 'MEDIA_1') RETURNING id INTO nivel;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio, '1MA', '1° Medio A', nivel, 'A') RETURNING id INTO curso;
  INSERT INTO convi.asignaciones_docentes (establecimiento_id, curso_id, membresia_id, rol_asignacion, fecha_inicio)
  VALUES (escuela, curso, profe, 'PROFESOR_JEFE', '2026-03-01');

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Sofía', 'Estudiante')
  RETURNING id INTO persona;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, persona, 'F-001') RETURNING id INTO estudiante;
  INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
  VALUES (escuela, estudiante, curso, anio, '2026-03-01');

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.profe', profe::text, true);
  PERFORM set_config('prueba.conv_1', conv_1::text, true);
  PERFORM set_config('prueba.conv_2', conv_2::text, true);
  PERFORM set_config('prueba.curso', curso::text, true);
  PERFORM set_config('prueba.persona_estudiante', persona::text, true);
  -- Las reglas que miran quién actúa leen app.membresia_id, igual que con la API.
  PERFORM set_config('app.membresia_id', profe::text, true);
END $$;

-- ===== Situaciones: fecha del hecho y fecha del registro =====

-- Situación del profesor que ocurrió hace dos días; se intenta indicar
-- también una fecha de registro antigua.
DO $$
DECLARE situacion uuid;
BEGIN
  PERFORM set_config('prueba.ocurrido', (now() - interval '2 days')::text, true);
  INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
    tipo_origen, ocurrido_en, reportado_en, descripcion)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe')::uuid,
    current_setting('prueba.curso')::uuid, 'PROFESOR', current_setting('prueba.ocurrido')::timestamptz,
    '2020-01-01 08:00:00-03', 'Situación ficticia de prueba.')
  RETURNING id INTO situacion;
  INSERT INTO convi.participaciones (establecimiento_id, persona_id, situacion_id, rol_contextual)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.persona_estudiante')::uuid,
    situacion, 'AFECTADO');
  PERFORM set_config('prueba.situacion', situacion::text, true);
END $$;

-- 1. La fecha del hecho queda como se indicó.
SELECT is(
  (SELECT ocurrido_en FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  current_setting('prueba.ocurrido')::timestamptz,
  'La situación guarda la fecha del hecho que se indicó');

-- 2. La fecha del registro la pone el servidor, aunque se envíe otra.
SELECT ok(
  (SELECT reportado_en >= now() FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  'La fecha de registro de la situación es la del servidor, no la enviada');

-- 3 y 4. Ninguna de las dos fechas se cambia después.
SELECT throws_ok(
  $$UPDATE convi.situaciones SET ocurrido_en = now() - interval '5 days'
    WHERE id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'El reporte original se conserva, registrar aclaración o nueva revisión',
  'La fecha del hecho de una situación no se cambia');
SELECT throws_ok(
  $$UPDATE convi.situaciones SET reportado_en = now() - interval '5 days'
    WHERE id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'El reporte original se conserva, registrar aclaración o nueva revisión',
  'La fecha de registro de una situación no se cambia');

-- 5. Un registro histórico de Convivencia guarda el hecho antiguo y la fecha real.
DO $$
DECLARE situacion uuid;
BEGIN
  PERFORM set_config('app.membresia_id', current_setting('prueba.conv_1'), true);
  INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, tipo_origen,
    ocurrido_en, reportado_en, descripcion, registro_historico)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.conv_1')::uuid, 'OTRO',
    '2025-05-12 10:30:00-04', '2025-05-12 10:30:00-04', 'Hecho de 2025 registrado después.', true)
  RETURNING id INTO situacion;
  INSERT INTO convi.participaciones (establecimiento_id, persona_id, situacion_id, rol_contextual)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.persona_estudiante')::uuid,
    situacion, 'AFECTADO');
  PERFORM set_config('prueba.historica', situacion::text, true);
END $$;
SELECT ok(
  (SELECT registro_historico AND ocurrido_en = '2025-05-12 10:30:00-04' AND reportado_en >= now()
   FROM convi.situaciones WHERE id = current_setting('prueba.historica')::uuid),
  'Un registro histórico mantiene la fecha indicada del hecho y la fecha real del servidor');

-- 6. Solo Convivencia hace registros históricos.
SELECT throws_ok(
  $$INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
      tipo_origen, ocurrido_en, descripcion, registro_historico)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe')::uuid,
      current_setting('prueba.curso')::uuid, 'PROFESOR', '2025-05-12 10:30:00-04', 'x', true)$$,
  'P0001', 'El registro histórico corresponde a Convivencia',
  'Un profesor no hace registros históricos');

-- ===== Situaciones: autor y motivo de cada cambio =====

-- 7. Asignar el responsable sin motivo se rechaza.
SELECT throws_ok(
  $$UPDATE convi.situaciones SET asignado_a_membresia_id = current_setting('prueba.conv_1')::uuid
    WHERE id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'Indicar motivo de la actualización',
  'Cambiar el responsable sin motivo se rechaza');

-- 8. Con motivo queda auditado: antes, después, quién y por qué.
DO $$ BEGIN
  PERFORM set_config('app.motivo_cambio', 'Se hace cargo Cristián', true);
  PERFORM set_config('app.membresia_id', current_setting('prueba.conv_1'), true);
  UPDATE convi.situaciones SET asignado_a_membresia_id = current_setting('prueba.conv_2')::uuid
  WHERE id = current_setting('prueba.situacion')::uuid;
  PERFORM set_config('app.motivo_cambio', '', true);
END $$;
SELECT is(
  (SELECT count(*) FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'situaciones' AND recurso_id = current_setting('prueba.situacion')::uuid
     AND membresia_actor_id = current_setting('prueba.conv_1')::uuid
     AND metadatos->'antes'->>'asignado_a_membresia_id' IS NULL
     AND metadatos->'despues'->>'asignado_a_membresia_id' = current_setting('prueba.conv_2')
     AND metadatos->>'motivo' = 'Se hace cargo Cristián'),
  1::bigint,
  'El cambio de responsable queda con el anterior, el nuevo, quién lo hizo y el motivo');

-- 9. Las decisiones sucesivas se agregan sin reemplazar las anteriores.
DO $$
DECLARE primera uuid;
BEGIN
  UPDATE convi.situaciones SET estado = 'EN_REVISION' WHERE id = current_setting('prueba.situacion')::uuid;
  INSERT INTO convi.revisiones_convivencia (establecimiento_id, situacion_id, tipo_revision,
    resultado, fundamento, revisado_por, revision_anterior_id)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
    'DECISION', 'ANTECEDENTE', 'Primera decisión', current_setting('prueba.conv_1')::uuid, NULL)
  RETURNING id INTO primera;
  INSERT INTO convi.revisiones_convivencia (establecimiento_id, situacion_id, tipo_revision,
    resultado, fundamento, revisado_por, revision_anterior_id)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
    'DECISION', 'DESCARTADA', 'Reconsideración de la decisión Antecedente: era un duplicado',
    current_setting('prueba.conv_1')::uuid, primera);
  PERFORM set_config('prueba.decision', primera::text, true);
END $$;
SELECT is(
  (SELECT string_agg(resultado || ':' || fundamento, ' | ' ORDER BY revisado_en, fundamento)
   FROM convi.revisiones_convivencia
   WHERE situacion_id = current_setting('prueba.situacion')::uuid AND tipo_revision = 'DECISION'),
  'ANTECEDENTE:Primera decisión | DESCARTADA:Reconsideración de la decisión Antecedente: era un duplicado',
  'Una situación conserva todas sus decisiones con su fundamento');

-- 10. La auditoría guarda cada cambio de estado de la situación, en orden.
SELECT is(
  (SELECT count(*) FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'situaciones' AND recurso_id = current_setting('prueba.situacion')::uuid
     AND (metadatos->'antes'->>'estado', metadatos->'despues'->>'estado') IN
       (('NUEVA', 'EN_REVISION'), ('EN_REVISION', 'ANTECEDENTE'), ('ANTECEDENTE', 'DESCARTADA'))
     AND membresia_actor_id = current_setting('prueba.conv_1')::uuid),
  3::bigint,
  'Cada cambio de estado de la situación queda en la auditoría con quién lo hizo');

-- 11 y 12. Una decisión registrada no se edita ni se borra.
SELECT throws_ok(
  $$UPDATE convi.revisiones_convivencia SET fundamento = 'Otro fundamento'
    WHERE id = current_setting('prueba.decision')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'El fundamento de una decisión no se modifica');
SELECT throws_ok(
  $$DELETE FROM convi.revisiones_convivencia WHERE id = current_setting('prueba.decision')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'Una decisión no se borra');

-- 13 y 14. La auditoría tampoco se edita ni se borra.
SELECT throws_ok(
  $$UPDATE convi.eventos_auditoria SET metadatos = '{}'::jsonb
    WHERE recurso_id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'Un evento de auditoría no se modifica');
SELECT throws_ok(
  $$DELETE FROM convi.eventos_auditoria WHERE recurso_id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'Un evento de auditoría no se borra');

-- ===== Casos: fecha de inicio, fecha de registro y movimientos de estado =====

-- Caso con inicio en 2025 abierto hoy; se intenta indicar una fecha de registro antigua.
DO $$
DECLARE caso uuid;
BEGIN
  INSERT INTO convi.casos (establecimiento_id, titulo, resumen, fecha_inicio,
    asignado_a_membresia_id, abierto_por, registrado_en, abierto_en)
  VALUES (current_setting('prueba.escuela')::uuid, 'Caso de prueba', 'Resumen ficticio.',
    '2025-05-12', current_setting('prueba.conv_1')::uuid, current_setting('prueba.conv_1')::uuid,
    '2020-01-01 08:00:00-03', '2020-01-01 08:00:00-03')
  RETURNING id INTO caso;
  PERFORM set_config('prueba.caso', caso::text, true);
END $$;

-- 15. El caso guarda la fecha de inicio indicada y la del servidor al registrarlo.
SELECT ok(
  (SELECT fecha_inicio = '2025-05-12' AND registrado_en >= now() AND abierto_en = registrado_en
   FROM convi.casos WHERE id = current_setting('prueba.caso')::uuid),
  'El caso guarda la fecha de inicio indicada y la fecha real del registro');

-- 16. La fecha de registro del caso no se cambia.
SELECT throws_ok(
  $$UPDATE convi.casos SET registrado_en = now() - interval '5 days'
    WHERE id = current_setting('prueba.caso')::uuid$$,
  'P0001', 'Conservar fecha y autor de registro',
  'La fecha de registro de un caso no se cambia');

-- 17. El estado del caso no se cambia sin dejar un movimiento.
SELECT throws_ok(
  $$UPDATE convi.casos SET estado_actual = 'EN_REVISION'
    WHERE id = current_setting('prueba.caso')::uuid$$,
  'P0001', 'Cambiar estado mediante historial_estados_caso',
  'El estado del caso solo cambia con un movimiento en su historial');

-- 18. Un movimiento sin motivo se rechaza.
SELECT throws_ok(
  $$INSERT INTO convi.historial_estados_caso (establecimiento_id, caso_id, estado_anterior,
      estado_nuevo, cambiado_por, motivo)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso')::uuid,
      'EN_ANALISIS', 'EN_REVISION', current_setting('prueba.conv_1')::uuid, '  ')$$,
  'P0001', 'Indicar motivo del cambio',
  'Un cambio de estado del caso sin motivo se rechaza');

-- 19. Dos cambios de estado: los dos movimientos se conservan, con autor y motivo.
INSERT INTO convi.historial_estados_caso (establecimiento_id, caso_id, estado_anterior,
  estado_nuevo, cambiado_por, motivo)
VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso')::uuid,
  'EN_ANALISIS', 'EN_REVISION', current_setting('prueba.conv_1')::uuid, 'Se revisan los antecedentes');
INSERT INTO convi.historial_estados_caso (establecimiento_id, caso_id, estado_anterior,
  estado_nuevo, cambiado_por, motivo)
VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso')::uuid,
  'EN_REVISION', 'EN_INTERVENCION', current_setting('prueba.conv_2')::uuid, 'Se define un plan');
SELECT is(
  (SELECT string_agg(estado_anterior || '>' || estado_nuevo || ':' || motivo, ' | '
     ORDER BY CASE estado_nuevo WHEN 'EN_REVISION' THEN 1 ELSE 2 END)
   FROM convi.historial_estados_caso
   WHERE caso_id = current_setting('prueba.caso')::uuid
     AND cambiado_por IN (current_setting('prueba.conv_1')::uuid, current_setting('prueba.conv_2')::uuid)),
  'EN_ANALISIS>EN_REVISION:Se revisan los antecedentes | EN_REVISION>EN_INTERVENCION:Se define un plan',
  'Los cambios de estado del caso conservan sus movimientos previos');

-- 20. Un movimiento hecho con el estado viejo a la vista se rechaza.
SELECT throws_ok(
  $$INSERT INTO convi.historial_estados_caso (establecimiento_id, caso_id, estado_anterior,
      estado_nuevo, cambiado_por, motivo)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso')::uuid,
      'EN_ANALISIS', 'EN_SEGUIMIENTO', current_setting('prueba.conv_1')::uuid, 'Con datos viejos')$$,
  'P0001', 'El caso cambió, recargar antes de decidir',
  'Un cambio de estado sobre un estado desactualizado se rechaza');

-- 21 y 22. Un movimiento registrado no se edita ni se borra.
SELECT throws_ok(
  $$UPDATE convi.historial_estados_caso SET motivo = 'Otro motivo'
    WHERE caso_id = current_setting('prueba.caso')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'El motivo de un cambio de estado del caso no se modifica');
SELECT throws_ok(
  $$DELETE FROM convi.historial_estados_caso WHERE caso_id = current_setting('prueba.caso')::uuid$$,
  'P0001', 'Registro histórico inmutable, incorporar una nueva entrada',
  'Un movimiento del historial del caso no se borra');

SELECT * FROM finish();
ROLLBACK;
