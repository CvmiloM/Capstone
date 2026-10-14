-- PB-138, PB-139 y PB-140 (HU-118 y HU-119): reglas de las situaciones, las
-- aclaraciones y las cuentas invitadas que asegura la base, aunque una
-- petición se salte la pantalla o la API. Las validaciones de la API están en
-- apps/api/src/modules/**/*.spec.ts (pnpm --filter @convi/api test).
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(20);

-- Datos ficticios: una escuela con su administrador, dos profesores, una
-- profesional de Convivencia, dos cursos, dos estudiantes y una categoría.
DO $$
DECLARE
  escuela uuid; admin uuid; anio uuid; nivel uuid; curso_a uuid; curso_b uuid;
  persona uuid; profe_1 uuid; profe_2 uuid; conv uuid; estudiante uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000001a1', 'admin@reglas.test', now()),
    ('00000000-0000-4000-8000-0000000001b1', 'profe1@reglas.test', now()),
    ('00000000-0000-4000-8000-0000000001b2', 'profe2@reglas.test', now()),
    ('00000000-0000-4000-8000-0000000001c1', 'conv@reglas.test', now()),
    ('00000000-0000-4000-8000-0000000001d1', 'otra@reglas.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000001a1', 'Ada', 'Reglas', NULL, 'Escuela Reglas');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000001a1';

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Paula', 'Uno')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'PROFESOR', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000001b1', 'profe1@reglas.test') RETURNING id INTO profe_1;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Pablo', 'Dos')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'PROFESOR', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000001b2', 'profe2@reglas.test') RETURNING id INTO profe_2;
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Carla', 'Convivencia')
  RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, activado_en, auth_usuario_id, correo_invitacion)
  VALUES (escuela, persona, 'CONVIVENCIA', 'ACTIVO', admin, now(), now(),
    '00000000-0000-4000-8000-0000000001c1', 'conv@reglas.test') RETURNING id INTO conv;

  INSERT INTO convi.anios_academicos (establecimiento_id, anio, fecha_inicio, fecha_fin, estado)
  VALUES (escuela, 2026, '2026-03-01', '2026-12-18', 'ACTIVO') RETURNING id INTO anio;
  INSERT INTO convi.niveles_educativos (establecimiento_id, codigo, nombre, orden, ciclo, tramo)
  VALUES (escuela, '1M', '1° Medio', 9, 'MEDIA', 'MEDIA_1') RETURNING id INTO nivel;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio, '1MA', '1° Medio A', nivel, 'A') RETURNING id INTO curso_a;
  INSERT INTO convi.cursos (establecimiento_id, anio_academico_id, codigo, nombre, nivel_id, seccion)
  VALUES (escuela, anio, '1MB', '1° Medio B', nivel, 'B') RETURNING id INTO curso_b;
  INSERT INTO convi.asignaciones_docentes (establecimiento_id, curso_id, membresia_id, rol_asignacion, fecha_inicio)
  VALUES (escuela, curso_a, profe_1, 'PROFESOR_JEFE', '2026-03-01'),
         (escuela, curso_b, profe_2, 'PROFESOR_JEFE', '2026-03-01');

  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Sofía', 'Estudiante')
  RETURNING id INTO persona;
  INSERT INTO convi.estudiantes (establecimiento_id, persona_id, codigo_estudiante)
  VALUES (escuela, persona, 'R-001') RETURNING id INTO estudiante;
  INSERT INTO convi.matriculas (establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en)
  VALUES (escuela, estudiante, curso_a, anio, '2026-03-01');
  PERFORM set_config('prueba.persona_estudiante', persona::text, true);

  INSERT INTO convi.categorias_convivencia (establecimiento_id, nombre) VALUES (escuela, 'Conflicto');

  -- Persona sin cuenta, para intentar invitarla.
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos) VALUES (escuela, 'Iván', 'Sin Cuenta')
  RETURNING id INTO persona;
  PERFORM set_config('prueba.persona_libre', persona::text, true);

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.admin', admin::text, true);
  PERFORM set_config('prueba.profe_1', profe_1::text, true);
  PERFORM set_config('prueba.profe_2', profe_2::text, true);
  PERFORM set_config('prueba.conv', conv::text, true);
  PERFORM set_config('prueba.curso_a', curso_a::text, true);
  PERFORM set_config('prueba.curso_b', curso_b::text, true);
  -- Las reglas que miran quién actúa leen app.membresia_id, igual que con la API.
  PERFORM set_config('app.membresia_id', profe_1::text, true);
END $$;

-- Situación base registrada por el profesor 1 en su curso, con una estudiante.
DO $$
DECLARE situacion uuid;
BEGIN
  INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
    tipo_origen, ocurrido_en, descripcion)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe_1')::uuid,
    current_setting('prueba.curso_a')::uuid, 'PROFESOR', now() - interval '1 hour',
    'Situación ficticia de prueba.')
  RETURNING id INTO situacion;
  INSERT INTO convi.participaciones (establecimiento_id, persona_id, situacion_id, rol_contextual)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.persona_estudiante')::uuid,
    situacion, 'AFECTADO');
  PERFORM set_config('prueba.situacion', situacion::text, true);
END $$;

-- ===== PB-140 (HU-119): reglas del registro que no dependen de la pantalla =====

-- 1 y 2. Llega Nueva y con un código legible y correlativo (HU-035 CA3).
SELECT matches(
  (SELECT codigo FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  '^SIT-[0-9]{4}-00001$',
  'La primera situación de la escuela recibe el código SIT-AAAA-00001');
SELECT is(
  (SELECT estado FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  'NUEVA',
  'Una situación registrada queda Nueva');

-- 3. Nadie la crea en otro estado, aunque lo pida directamente.
SELECT throws_ok(
  $$INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
      tipo_origen, ocurrido_en, descripcion, estado)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe_1')::uuid,
      current_setting('prueba.curso_a')::uuid, 'PROFESOR', now(), 'x', 'EN_REVISION')$$,
  'P0001', 'Una situación nueva inicia NUEVA',
  'Una situación no puede nacer En revisión');

-- 4. Un profesor solo registra en un curso donde tiene asignación vigente (HU-035 CA1).
SELECT throws_ok(
  $$INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
      tipo_origen, ocurrido_en, descripcion)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe_1')::uuid,
      current_setting('prueba.curso_b')::uuid, 'PROFESOR', now(), 'x')$$,
  'P0001', 'Curso no asignado al profesor',
  'Un profesor no registra situaciones de un curso que no tiene asignado');

-- 5. Lo enviado no se edita: la descripción se conserva (HU-035 CA6).
SELECT throws_ok(
  $$UPDATE convi.situaciones SET descripcion = 'Otra versión'
    WHERE id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'El reporte original se conserva, registrar aclaración o nueva revisión',
  'La descripción de una situación enviada no se modifica');

-- ===== PB-138 (HU-118): un fallo intermedio no deja registros incompletos =====

-- 6. Una situación sin estudiantes no se guarda: la base la rechaza al confirmar
--    y la transacción completa se revierte (HU-035 CA2 y CA5).
SELECT throws_ok(
  $prueba$DO $x$ BEGIN
      INSERT INTO convi.situaciones (establecimiento_id, reportado_por_membresia_id, curso_contexto_id,
        tipo_origen, ocurrido_en, descripcion)
      VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.profe_1')::uuid,
        current_setting('prueba.curso_a')::uuid, 'PROFESOR', now(), 'Sin estudiantes');
      SET CONSTRAINTS ALL IMMEDIATE;
    END $x$$prueba$,
  'P0001', 'La situación debe incluir al menos un estudiante',
  'Una situación sin estudiantes se rechaza al confirmar la transacción');
SELECT is(
  (SELECT count(*) FROM convi.situaciones WHERE descripcion = 'Sin estudiantes'),
  0::bigint,
  'El intento fallido no dejó una situación incompleta');
SET CONSTRAINTS ALL DEFERRED;

-- ===== HU-037 CA3: la urgencia cambia solo con motivo, y queda auditada =====

-- 8. Sin motivo se rechaza.
SELECT throws_ok(
  $$UPDATE convi.situaciones SET urgencia = 'URGENTE'
    WHERE id = current_setting('prueba.situacion')::uuid$$,
  'P0001', 'Indicar motivo de la actualización',
  'Cambiar la urgencia sin motivo se rechaza');

-- 9. Con motivo se guarda en la auditoría, con quién lo hizo.
DO $$ BEGIN
  PERFORM set_config('app.membresia_id', current_setting('prueba.conv'), true);
  PERFORM set_config('app.motivo_cambio', 'Informaron una lesión', true);
  UPDATE convi.situaciones SET urgencia = 'URGENTE' WHERE id = current_setting('prueba.situacion')::uuid;
  PERFORM set_config('app.motivo_cambio', '', true);
END $$;
SELECT is(
  (SELECT metadatos->>'motivo' FROM convi.eventos_auditoria
   WHERE recurso_id = current_setting('prueba.situacion')::uuid
     AND membresia_actor_id = current_setting('prueba.conv')::uuid
     AND metadatos->'despues'->>'urgencia' = 'URGENTE'),
  'Informaron una lesión',
  'El cambio de urgencia queda auditado con su motivo y quién lo hizo');

-- ===== PB-139 (HU-118): una decisión sobre información vieja no sobrescribe =====

-- 10. Convivencia decide indicando una revisión anterior que ya no es la última.
SELECT throws_ok(
  $$INSERT INTO convi.revisiones_convivencia (establecimiento_id, situacion_id, tipo_revision,
      resultado, fundamento, revisado_por, revision_anterior_id)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
      'DECISION', 'INFORMACION_SOLICITADA', 'Decidida con datos viejos',
      current_setting('prueba.conv')::uuid, gen_random_uuid())$$,
  'P0001', 'La revisión cambió, recargar antes de decidir',
  'Una decisión tomada sobre una revisión desactualizada se rechaza');

-- 11. Con la última revisión correcta, la decisión cambia el estado (HU-038 CA1).
INSERT INTO convi.revisiones_convivencia (establecimiento_id, situacion_id, tipo_revision,
  resultado, fundamento, revisado_por, revision_anterior_id)
VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
  'DECISION', 'INFORMACION_SOLICITADA', 'Se pidió una aclaración al profesor',
  current_setting('prueba.conv')::uuid, NULL);
SELECT is(
  (SELECT estado FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  'INFORMACION_SOLICITADA',
  'La decisión de pedir información deja la situación en Información solicitada');

-- ===== Aclaraciones (HU-038 y HU-042) =====

-- 12. Solo se pregunta al profesor que registró la situación (HU-038 CA2).
SELECT throws_ok(
  $$INSERT INTO convi.aclaraciones_situacion (establecimiento_id, situacion_id, solicitado_por,
      profesor_destinatario_id, pregunta)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
      current_setting('prueba.conv')::uuid, current_setting('prueba.profe_2')::uuid, '¿?')$$,
  'P0001', 'Solicitar al profesor autor del reporte',
  'Una aclaración no se dirige a otro profesor');

DO $$
DECLARE aclaracion uuid;
BEGIN
  INSERT INTO convi.aclaraciones_situacion (establecimiento_id, situacion_id, solicitado_por,
    profesor_destinatario_id, pregunta)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.situacion')::uuid,
    current_setting('prueba.conv')::uuid, current_setting('prueba.profe_1')::uuid,
    '¿Había un adulto presente?')
  RETURNING id INTO aclaracion;
  PERFORM set_config('prueba.aclaracion', aclaracion::text, true);
END $$;

-- 13. La pregunta enviada no se modifica (HU-038 CA3).
SELECT throws_ok(
  $$UPDATE convi.aclaraciones_situacion SET pregunta = 'Otra pregunta'
    WHERE id = current_setting('prueba.aclaracion')::uuid$$,
  'P0001', 'Conservar solicitud original',
  'La pregunta de una aclaración no se modifica');

-- 14. Solo el profesor destinatario responde (HU-042 CA3).
DO $$ BEGIN PERFORM set_config('app.membresia_id', current_setting('prueba.profe_2'), true); END $$;
SELECT throws_ok(
  $$UPDATE convi.aclaraciones_situacion
    SET estado = 'RESPONDIDA', respuesta = 'No me corresponde',
        respondido_por = current_setting('prueba.profe_2')::uuid
    WHERE id = current_setting('prueba.aclaracion')::uuid$$,
  'P0001', 'Solo el profesor destinatario responde',
  'Otro profesor no puede responder la aclaración');

-- 15. Al responder la última pendiente, la situación vuelve a En revisión (HU-042 CA4).
DO $$ BEGIN
  PERFORM set_config('app.membresia_id', current_setting('prueba.profe_1'), true);
  UPDATE convi.aclaraciones_situacion
  SET estado = 'RESPONDIDA', respuesta = 'Sí, un inspector.',
      respondido_por = current_setting('prueba.profe_1')::uuid
  WHERE id = current_setting('prueba.aclaracion')::uuid;
END $$;
SELECT is(
  (SELECT estado FROM convi.situaciones WHERE id = current_setting('prueba.situacion')::uuid),
  'EN_REVISION',
  'Responder la última aclaración pendiente devuelve la situación a En revisión');

-- 16. PB-139: una respuesta enviada no se sobrescribe (HU-042 CA3).
SELECT throws_ok(
  $$UPDATE convi.aclaraciones_situacion SET respuesta = 'Cambio mi respuesta'
    WHERE id = current_setting('prueba.aclaracion')::uuid$$,
  'P0001', 'La respuesta enviada se conserva, incorporar otra solicitud',
  'Una respuesta enviada no se sobrescribe');

-- ===== Cuentas invitadas (HU-009 y HU-003) =====

-- 17. Solo un administrador activo invita cuentas (HU-009 CA4).
SELECT throws_ok(
  $$INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil,
      estado, invitado_por, invitado_en, correo_invitacion)
    VALUES (current_setting('prueba.escuela')::uuid,
      current_setting('prueba.persona_libre')::uuid, 'PROFESOR', 'PENDIENTE',
      current_setting('prueba.profe_1')::uuid, now(), 'invitada@reglas.test')$$,
  'P0001', 'Solo un administrador activo invita cuentas',
  'Un profesor no puede invitar cuentas');

-- 18. El perfil de una cuenta no cambia (HU-009 CA4).
SELECT throws_ok(
  $$UPDATE convi.membresias_establecimiento SET codigo_perfil = 'CONVIVENCIA'
    WHERE id = current_setting('prueba.profe_1')::uuid$$,
  'P0001', 'El perfil de una cuenta no cambia, otro perfil requiere otra cuenta con otro correo',
  'El perfil de una cuenta no cambia');

-- 19 y 20. Una invitación solo la activa la identidad con el correo invitado (HU-003).
DO $$
DECLARE persona uuid; invitada uuid;
BEGIN
  INSERT INTO convi.personas (establecimiento_id, nombres, apellidos)
  VALUES (current_setting('prueba.escuela')::uuid, 'Irene', 'Invitada') RETURNING id INTO persona;
  INSERT INTO convi.membresias_establecimiento (establecimiento_id, persona_id, codigo_perfil, estado,
    invitado_por, invitado_en, correo_invitacion)
  VALUES (current_setting('prueba.escuela')::uuid, persona, 'PROFESOR', 'PENDIENTE',
    current_setting('prueba.admin')::uuid, now(), 'irene@reglas.test') RETURNING id INTO invitada;
  PERFORM set_config('prueba.invitada', invitada::text, true);
END $$;
SELECT throws_ok(
  $$SELECT convi.activar_invitacion(current_setting('prueba.invitada')::uuid,
      '00000000-0000-4000-8000-0000000001d1')$$,
  'P0001', 'La invitación no corresponde a este correo',
  'Una invitación no se activa con la identidad de otro correo');
SELECT is(
  (SELECT estado FROM convi.membresias_establecimiento WHERE id = current_setting('prueba.invitada')::uuid),
  'PENDIENTE',
  'La invitación sigue Pendiente después del intento rechazado');

SELECT * FROM finish();
ROLLBACK;
