-- PB-063 y PB-064 (HU-055): un encuentro del caso tiene un responsable de
-- Convivencia y su autor es la cuenta que lo registra (CA1); guarda fechas
-- programadas y reales por separado, sin término antes del inicio (CA2);
-- realizado exige fecha real y resultado, y planificado exige fecha
-- programada (CA3); cada asistente guarda su asistencia (CA4); cambiar la
-- fecha exige motivo y la auditoría guarda la anterior y la nueva (CA5); las
-- fechas reales no pueden ser futuras (CA6). Las validaciones de los datos se
-- prueban en apps/api/src/modules/situaciones/encuentros.spec.ts.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(16);

-- Datos ficticios: una escuela con una profesional de Convivencia, un
-- profesor, una estudiante en un caso y otro caso con un plan y una acción.
DO $$
DECLARE
  escuela uuid; admin uuid; persona uuid; conv uuid; profe uuid; estudiante uuid;
  caso_1 uuid; caso_2 uuid; plan uuid; accion uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000007a1', 'admin@encuentros.test', now()),
    ('00000000-0000-4000-8000-0000000007c1', 'conv@encuentros.test', now()),
    ('00000000-0000-4000-8000-0000000007b1', 'profe@encuentros.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000007a1', 'Ada', 'Encuentros', NULL, 'Escuela Encuentros');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000007a1';

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Carla', 'Convivencia')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'CONVIVENCIA', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000007c1', 'conv@encuentros.test') RETURNING id INTO conv;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Pía', 'Profesora')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'PROFESOR', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000007b1', 'profe@encuentros.test') RETURNING id INTO profe;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Sofía', 'Estudiante')
  RETURNING id INTO estudiante;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, estudiante, 'E-001');

  -- Las reglas que miran quién actúa leen app.membresia_id, igual que con la API.
  PERFORM set_config('app.membresia_id', conv::text, true);
  INSERT INTO convi.casos (establecimiento_id, titulo, resumen, fecha_inicio,
    asignado_a_membresia_id, abierto_por)
  VALUES (escuela, 'Caso con encuentros', 'Resumen ficticio.', current_date, conv, conv)
  RETURNING id INTO caso_1;
  INSERT INTO convi.participaciones (establecimiento_id, persona_id, caso_id, rol_contextual)
  VALUES (escuela, estudiante, caso_1, 'AFECTADO');
  INSERT INTO convi.casos (establecimiento_id, titulo, resumen, fecha_inicio,
    asignado_a_membresia_id, abierto_por)
  VALUES (escuela, 'Otro caso', 'Resumen ficticio.', current_date, conv, conv)
  RETURNING id INTO caso_2;
  INSERT INTO convi.planes_intervencion (establecimiento_id, caso_id, objetivo, estado, creado_por)
  VALUES (escuela, caso_2, 'Plan del otro caso', 'ACTIVO', conv) RETURNING id INTO plan;
  INSERT INTO convi.acciones_plan_intervencion (establecimiento_id, plan_intervencion_id,
    descripcion, persona_responsable_id, vence_en)
  VALUES (escuela, plan, 'Acción del otro caso', persona, now() + interval '7 days')
  RETURNING id INTO accion;

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.conv', conv::text, true);
  PERFORM set_config('prueba.profe', profe::text, true);
  PERFORM set_config('prueba.estudiante', estudiante::text, true);
  PERFORM set_config('prueba.caso_1', caso_1::text, true);
  PERFORM set_config('prueba.accion_otro_caso', accion::text, true);
END $$;

CREATE TEMP TABLE encuentro_base AS
SELECT format($$INSERT INTO convi.actuaciones (establecimiento_id, caso_id, tipo_actuacion,
  membresia_responsable_id, objetivo, lugar, programado_en, fin_programado_en, creado_por, accion_plan_id)
  VALUES (%L, %L, 'ENTREVISTA', %%L, 'Conversar con la familia', 'Oficina', %%s, %%s, %%L, %%s)$$,
  current_setting('prueba.escuela'), current_setting('prueba.caso_1')) AS sql;

-- CA1: el responsable es de Convivencia y el autor es quien registra.
SELECT throws_ok(
  format((SELECT sql FROM encuentro_base), current_setting('prueba.profe'),
    $$now() + interval '1 day'$$, 'NULL', current_setting('prueba.conv'), 'NULL'),
  'P0001', 'Responsable de actuación debe ser Convivencia',
  'El responsable del encuentro debe ser de Convivencia');
SELECT throws_ok(
  format((SELECT sql FROM encuentro_base), current_setting('prueba.conv'),
    $$now() + interval '1 day'$$, 'NULL', current_setting('prueba.profe'), 'NULL'),
  'P0001', NULL, 'El autor debe ser la cuenta que registra');
SELECT throws_ok(
  format((SELECT sql FROM encuentro_base), current_setting('prueba.conv'),
    $$now() + interval '1 day'$$, 'NULL', current_setting('prueba.conv'),
    quote_literal(current_setting('prueba.accion_otro_caso'))),
  'P0001', 'Acción de otro caso',
  'No se liga a una acción del plan de otro caso');

-- CA2 y CA3: planificado exige fecha programada y el término no va antes del inicio.
SELECT throws_ok(
  format((SELECT sql FROM encuentro_base), current_setting('prueba.conv'),
    'NULL', 'NULL', current_setting('prueba.conv'), 'NULL'),
  'P0001', 'Indicar fecha programada', 'Un encuentro planificado exige fecha programada');
SELECT throws_ok(
  format((SELECT sql FROM encuentro_base), current_setting('prueba.conv'),
    $$now() + interval '1 day'$$, $$now() + interval '23 hours'$$, current_setting('prueba.conv'), 'NULL'),
  '23514', NULL, 'El término programado no puede ser anterior al inicio');

-- CA6: las fechas programadas sí pueden ser futuras.
DO $$
DECLARE encuentro uuid;
BEGIN
  INSERT INTO convi.actuaciones (establecimiento_id, caso_id, tipo_actuacion,
    membresia_responsable_id, objetivo, lugar, programado_en, fin_programado_en, creado_por)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso_1')::uuid, 'ENTREVISTA',
    current_setting('prueba.conv')::uuid, 'Conversar con la familia', 'Oficina',
    date_trunc('minute', now()) + interval '2 days', date_trunc('minute', now()) + interval '2 days 1 hour',
    current_setting('prueba.conv')::uuid)
  RETURNING id INTO encuentro;
  INSERT INTO convi.participaciones (establecimiento_id, persona_id, actuacion_id, rol_contextual, estado_asistencia)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.estudiante')::uuid,
    encuentro, 'ESTUDIANTE', 'PENDIENTE');
  PERFORM set_config('prueba.encuentro', encuentro::text, true);
END $$;

SELECT is(
  (SELECT estado FROM convi.actuaciones WHERE id = current_setting('prueba.encuentro')::uuid),
  'PLANIFICADA', 'El encuentro nace Planificado con fecha futura');

-- CA4: la asistencia solo existe en encuentros.
SELECT throws_ok(
  format($$INSERT INTO convi.participaciones (establecimiento_id, persona_id, caso_id, rol_contextual,
    estado_asistencia) VALUES (%L, %L, %L, 'AFECTADO', 'ASISTIO')$$,
    current_setting('prueba.escuela'), current_setting('prueba.estudiante'), current_setting('prueba.caso_1')),
  '23514', NULL, 'La asistencia no se guarda fuera de un encuentro');

-- CA5: cambiar la fecha programada exige motivo y la auditoría guarda ambas.
SELECT throws_ok(
  format($$UPDATE convi.actuaciones SET programado_en = programado_en + interval '1 day'
    WHERE id = %L$$, current_setting('prueba.encuentro')),
  'P0001', 'Indicar motivo de reprogramación', 'Reprogramar sin motivo se rechaza');

SELECT set_config('prueba.fecha_original', (SELECT programado_en::text FROM convi.actuaciones
  WHERE id = current_setting('prueba.encuentro')::uuid), true);

DO $$
BEGIN
  PERFORM set_config('app.motivo_cambio', 'La familia no podía ese día', true);
  UPDATE convi.actuaciones SET programado_en = programado_en + interval '1 day',
    fin_programado_en = fin_programado_en + interval '1 day', estado = 'POSPUESTA'
  WHERE id = current_setting('prueba.encuentro')::uuid;
  PERFORM set_config('app.motivo_cambio', '', true);
END $$;

SELECT ok(
  (SELECT (metadatos->'antes'->>'programado_en')::timestamptz = current_setting('prueba.fecha_original')::timestamptz
      AND (metadatos->'despues'->>'programado_en')::timestamptz = current_setting('prueba.fecha_original')::timestamptz + interval '1 day'
      AND metadatos->>'motivo' = 'La familia no podía ese día'
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'actuaciones' AND recurso_id = current_setting('prueba.encuentro')::uuid),
  'La auditoría guarda la fecha anterior, la nueva y el motivo');
SELECT is(
  (SELECT count(*)::int FROM convi.vw_cronologia_caso
   WHERE caso_id = current_setting('prueba.caso_1')::uuid AND tipo = 'ACTUACION_MODIFICADA'),
  1, 'La cronología del caso muestra la reprogramación');

-- CA3 y CA6: realizado exige resultado y las fechas reales no son futuras.
SELECT throws_ok(
  format($$UPDATE convi.actuaciones SET estado = 'REALIZADA', realizado_en = now() - interval '1 hour'
    WHERE id = %L$$, current_setting('prueba.encuentro')),
  'P0001', 'Indicar resultado de la actuación', 'Realizado sin resultado se rechaza');
SELECT throws_ok(
  format($$UPDATE convi.actuaciones SET estado = 'REALIZADA', realizado_en = now() + interval '1 hour',
    resultado = 'Se conversó' WHERE id = %L$$, current_setting('prueba.encuentro')),
  'P0001', 'Las fechas reales no pueden ser futuras', 'Una fecha real futura se rechaza');

UPDATE convi.participaciones SET estado_asistencia = 'ASISTIO'
WHERE actuacion_id = current_setting('prueba.encuentro')::uuid;
UPDATE convi.actuaciones SET estado = 'REALIZADA', realizado_en = now() - interval '2 hours',
  fin_real_en = now() - interval '1 hour', resultado = 'Se acordó un plan de trabajo'
WHERE id = current_setting('prueba.encuentro')::uuid;

SELECT is(
  (SELECT estado || ' / ' || (SELECT string_agg(estado_asistencia, ',') FROM convi.participaciones
     WHERE actuacion_id = a.id)
   FROM convi.actuaciones a WHERE id = current_setting('prueba.encuentro')::uuid),
  'REALIZADA / ASISTIO', 'Queda Realizado con la asistencia de cada participante');
SELECT ok(
  (SELECT programado_en = current_setting('prueba.fecha_original')::timestamptz + interval '1 day'
      AND realizado_en IS NOT NULL
   FROM convi.actuaciones WHERE id = current_setting('prueba.encuentro')::uuid),
  'Las fechas programadas y las reales se guardan por separado (CA2)');

-- El resultado ya registrado no se sobrescribe sin motivo.
SELECT throws_ok(
  format($$UPDATE convi.actuaciones SET resultado = 'Otro resultado' WHERE id = %L$$,
    current_setting('prueba.encuentro')),
  'P0001', 'La actuación ya fue realizada, corregir su resultado requiere motivo',
  'Cambiar el resultado de un encuentro realizado exige motivo');
-- Aun con motivo, el término real no va antes del inicio real (CA2).
SELECT set_config('app.motivo_cambio', 'Corrección de la hora', true);
SELECT throws_ok(
  format($$UPDATE convi.actuaciones SET fin_real_en = realizado_en - interval '1 minute' WHERE id = %L$$,
    current_setting('prueba.encuentro')),
  '23514', NULL, 'El término real no puede ser anterior al inicio real');
SELECT set_config('app.motivo_cambio', '', true);

SELECT * FROM finish();
ROLLBACK;
