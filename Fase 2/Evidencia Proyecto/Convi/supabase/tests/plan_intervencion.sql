-- PB-061 y PB-062 (HU-054): el plan de intervención pertenece a un caso y
-- puede indicar un protocolo aplicado del mismo caso (CA1); completar o
-- cancelar el plan exige motivo, la base registra la fecha de término y la
-- auditoría guarda el cambio (CA5); una acción completada guarda su fecha de
-- cumplimiento, que no puede ser futura (CA3), y corregirla exige motivo con
-- el valor anterior y el nuevo en la auditoría (CA4). Las validaciones de los
-- datos se prueban en apps/api/src/modules/situaciones/plan-intervencion.spec.ts.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(16);

-- Datos ficticios: una escuela con su administrador, una profesional de
-- Convivencia, un profesor y dos casos; el segundo tiene un protocolo aplicado.
DO $$
DECLARE
  escuela uuid; admin uuid; persona uuid; conv uuid; profe uuid;
  caso_1 uuid; caso_2 uuid; protocolo uuid; version uuid; aplicado uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000006a1', 'admin@plan.test', now()),
    ('00000000-0000-4000-8000-0000000006c1', 'conv@plan.test', now()),
    ('00000000-0000-4000-8000-0000000006b1', 'profe@plan.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000006a1', 'Ada', 'Plan', NULL, 'Escuela Plan');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000006a1';

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Carla', 'Convivencia')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'CONVIVENCIA', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000006c1', 'conv@plan.test') RETURNING id INTO conv;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Pía', 'Profesora')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'PROFESOR', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000006b1', 'profe@plan.test') RETURNING id INTO profe;

  INSERT INTO convi.casos (establecimiento_id, titulo, resumen, fecha_inicio,
    asignado_a_membresia_id, abierto_por)
  VALUES (escuela, 'Caso con plan', 'Resumen ficticio.', current_date, conv, conv)
  RETURNING id INTO caso_1;
  INSERT INTO convi.casos (establecimiento_id, titulo, resumen, fecha_inicio,
    asignado_a_membresia_id, abierto_por)
  VALUES (escuela, 'Otro caso', 'Resumen ficticio.', current_date, conv, conv)
  RETURNING id INTO caso_2;

  -- Publicar exige un documento de origen con su archivo; para no armarlo, el
  -- protocolo publicado y su aplicación se insertan sin disparadores (lo que
  -- se prueba aquí es el plan, no la publicación).
  SET LOCAL session_replication_role = replica;
  INSERT INTO convi.protocolos (establecimiento_id, codigo, nombre)
  VALUES (escuela, 'P-PLAN', 'Protocolo de prueba') RETURNING id INTO protocolo;
  INSERT INTO convi.versiones_protocolo (establecimiento_id, protocolo_id, numero_version,
    estado, revisado_por, publicado_en, notas, creado_por, vigente_desde)
  VALUES (escuela, protocolo, 1, 'PUBLICADO', conv, now(), 'Procedencia ficticia', conv, current_date)
  RETURNING id INTO version;
  INSERT INTO convi.protocolos_caso (establecimiento_id, caso_id, version_protocolo_id,
    aplicado_por, fundamento)
  VALUES (escuela, caso_2, version, conv, 'Fundamento ficticio') RETURNING id INTO aplicado;
  SET LOCAL session_replication_role = origin;
  PERFORM set_config('app.membresia_id', conv::text, true);

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.conv', conv::text, true);
  PERFORM set_config('prueba.persona_profe', persona::text, true);
  PERFORM set_config('prueba.caso_1', caso_1::text, true);
  PERFORM set_config('prueba.caso_2', caso_2::text, true);
  PERFORM set_config('prueba.aplicado', aplicado::text, true);
END $$;

-- CA1: el plan nace con su objetivo y su autor; el protocolo debe ser del mismo caso.
SELECT throws_ok(
  format($$INSERT INTO convi.planes_intervencion (establecimiento_id, caso_id,
    protocolo_caso_id, objetivo, creado_por) VALUES (%L, %L, %L, 'Objetivo', %L)$$,
    current_setting('prueba.escuela'), current_setting('prueba.caso_1'),
    current_setting('prueba.aplicado'), current_setting('prueba.conv')),
  'P0001', 'Protocolo de otro caso',
  'El plan no puede originarse en el protocolo aplicado de otro caso');

DO $$
DECLARE plan uuid; accion uuid;
BEGIN
  INSERT INTO convi.planes_intervencion (establecimiento_id, caso_id, objetivo, creado_por)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso_1')::uuid,
    'Mejorar la convivencia en el curso', current_setting('prueba.conv')::uuid)
  RETURNING id INTO plan;
  INSERT INTO convi.acciones_plan_intervencion (establecimiento_id, plan_intervencion_id,
    descripcion, persona_responsable_id, vence_en)
  VALUES (current_setting('prueba.escuela')::uuid, plan, 'Entrevista con la familia',
    current_setting('prueba.persona_profe')::uuid, now() + interval '7 days')
  RETURNING id INTO accion;
  PERFORM set_config('prueba.plan', plan::text, true);
  PERFORM set_config('prueba.accion', accion::text, true);
END $$;

SELECT is(
  (SELECT estado FROM convi.planes_intervencion WHERE id = current_setting('prueba.plan')::uuid),
  'BORRADOR', 'El plan empieza Borrador por defecto');
SELECT is(
  (SELECT estado FROM convi.acciones_plan_intervencion WHERE id = current_setting('prueba.accion')::uuid),
  'PENDIENTE', 'La acción empieza Pendiente (CA2)');

-- CA3: una acción completada guarda su fecha de cumplimiento, nunca futura.
SELECT throws_ok(
  format($$UPDATE convi.acciones_plan_intervencion SET estado = 'COMPLETADO', notas = 'Hecho'
    WHERE id = %L$$, current_setting('prueba.accion')),
  '23514', NULL, 'Completar exige la fecha de cumplimiento');
SELECT throws_ok(
  format($$UPDATE convi.acciones_plan_intervencion SET estado = 'COMPLETADO', notas = 'Hecho',
    completado_en = now() + interval '1 day' WHERE id = %L$$, current_setting('prueba.accion')),
  'P0001', 'La fecha de cumplimiento no puede ser futura',
  'La base rechaza una fecha de cumplimiento futura');

-- CA4: corregir la descripción, el responsable o el vencimiento exige motivo.
SELECT throws_ok(
  format($$UPDATE convi.acciones_plan_intervencion SET descripcion = 'Otra descripción'
    WHERE id = %L$$, current_setting('prueba.accion')),
  'P0001', 'Indicar motivo para corregir la acción',
  'Corregir una acción sin motivo se rechaza');

-- La huella que compara el servidor (PB-139) cambia con cada cambio guardado.
SELECT set_config('prueba.version', (SELECT md5(to_jsonb(a)::text)
  FROM convi.acciones_plan_intervencion a WHERE id = current_setting('prueba.accion')::uuid), true);

DO $$
BEGIN
  PERFORM set_config('app.motivo_cambio', 'La descripción tenía un error', true);
  UPDATE convi.acciones_plan_intervencion SET descripcion = 'Entrevista con el apoderado'
  WHERE id = current_setting('prueba.accion')::uuid;
  PERFORM set_config('app.motivo_cambio', '', true);
END $$;

SELECT is(
  (SELECT metadatos->>'motivo' FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'acciones_plan_intervencion' AND recurso_id = current_setting('prueba.accion')::uuid
   ORDER BY ocurrido_en DESC LIMIT 1),
  'La descripción tenía un error', 'La auditoría guarda el motivo de la corrección');
SELECT is(
  (SELECT (metadatos->'antes'->>'descripcion') || ' → ' || (metadatos->'despues'->>'descripcion')
   FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'acciones_plan_intervencion' AND recurso_id = current_setting('prueba.accion')::uuid
   ORDER BY ocurrido_en DESC LIMIT 1),
  'Entrevista con la familia → Entrevista con el apoderado',
  'La auditoría guarda el valor anterior y el nuevo');
SELECT isnt(
  (SELECT md5(to_jsonb(a)::text) FROM convi.acciones_plan_intervencion a
   WHERE id = current_setting('prueba.accion')::uuid),
  current_setting('prueba.version'), 'La huella de la acción cambia al corregirla');

-- Completar con una fecha que ya ocurrió no pide motivo; corregirla después sí.
UPDATE convi.acciones_plan_intervencion SET estado = 'COMPLETADO', notas = 'Se realizó la entrevista',
  completado_en = date_trunc('day', now())
WHERE id = current_setting('prueba.accion')::uuid;
SELECT is(
  (SELECT estado FROM convi.acciones_plan_intervencion WHERE id = current_setting('prueba.accion')::uuid),
  'COMPLETADO', 'La acción se completa con notas y fecha de cumplimiento');
SELECT throws_ok(
  format($$UPDATE convi.acciones_plan_intervencion SET notas = 'Otra nota' WHERE id = %L$$,
    current_setting('prueba.accion')),
  'P0001', 'Indicar motivo para corregir la acción',
  'Corregir una acción completada exige motivo');

-- CA5: completar o cancelar el plan exige motivo; activar un borrador no.
UPDATE convi.planes_intervencion SET estado = 'ACTIVO' WHERE id = current_setting('prueba.plan')::uuid;
SELECT is(
  (SELECT estado FROM convi.planes_intervencion WHERE id = current_setting('prueba.plan')::uuid),
  'ACTIVO', 'Un borrador se activa sin motivo');
SELECT throws_ok(
  format($$UPDATE convi.planes_intervencion SET estado = 'COMPLETADO' WHERE id = %L$$,
    current_setting('prueba.plan')),
  'P0001', 'Indicar motivo para completar, cancelar o reabrir',
  'Completar el plan sin motivo se rechaza');

-- Una acción nueva queda pendiente y el plan igual se completa (CA5).
INSERT INTO convi.acciones_plan_intervencion (establecimiento_id, plan_intervencion_id,
  descripcion, persona_responsable_id, vence_en)
VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.plan')::uuid,
  'Taller con el curso', current_setting('prueba.persona_profe')::uuid, now() + interval '14 days');

DO $$
BEGIN
  PERFORM set_config('app.motivo_cambio', 'Se cumplieron los objetivos', true);
  UPDATE convi.planes_intervencion SET estado = 'COMPLETADO', completado_en = NULL
  WHERE id = current_setting('prueba.plan')::uuid;
  PERFORM set_config('app.motivo_cambio', '', true);
END $$;

SELECT ok(
  (SELECT completado_en IS NOT NULL FROM convi.planes_intervencion
   WHERE id = current_setting('prueba.plan')::uuid),
  'La base registra la fecha de término aunque queden acciones pendientes');
SELECT is(
  (SELECT metadatos->>'motivo' FROM convi.eventos_auditoria
   WHERE tipo_recurso = 'planes_intervencion' AND recurso_id = current_setting('prueba.plan')::uuid
     AND metadatos->'despues'->>'estado' = 'COMPLETADO'),
  'Se cumplieron los objetivos', 'La auditoría guarda el término del plan con su motivo');

-- Un plan cancelado no guarda fecha de completado; la fecha queda en la auditoría.
DO $$
DECLARE plan uuid;
BEGIN
  INSERT INTO convi.planes_intervencion (establecimiento_id, caso_id, protocolo_caso_id,
    objetivo, estado, creado_por)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.caso_2')::uuid,
    current_setting('prueba.aplicado')::uuid, 'Plan del protocolo', 'ACTIVO',
    current_setting('prueba.conv')::uuid)
  RETURNING id INTO plan;
  PERFORM set_config('app.motivo_cambio', 'El estudiante se trasladó', true);
  UPDATE convi.planes_intervencion SET estado = 'CANCELADO' WHERE id = plan;
  PERFORM set_config('app.motivo_cambio', '', true);
  PERFORM set_config('prueba.plan_2', plan::text, true);
END $$;

SELECT ok(
  (SELECT estado = 'CANCELADO' AND completado_en IS NULL FROM convi.planes_intervencion
   WHERE id = current_setting('prueba.plan_2')::uuid),
  'Un plan del protocolo aplicado del mismo caso se cancela con motivo');

SELECT * FROM finish();
ROLLBACK;
