-- PB-150 (HU-129 CA1): lo publicado no se sobrescribe. Una versión publicada
-- o archivada de un documento institucional, una versión publicada de un
-- protocolo y sus pasos, y un informe publicado rechazan cualquier cambio de
-- contenido (proteger_version y validar_integracion); la corrección es otra
-- versión o una edición nueva que referencia a la anterior, y la anterior
-- queda igual. La API tampoco puede borrarlos.
-- Ejecutar con Supabase local arriba: npx.cmd --yes supabase@2.117.0 test db
-- Todo ocurre dentro de una transacción que se revierte: no deja datos.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(20);

-- Datos ficticios: una escuela con su administrador, el reglamento publicado,
-- un protocolo publicado con dos pasos y un informe publicado.
DO $$
DECLARE
  escuela uuid; admin uuid; archivo uuid; otro_archivo uuid;
  documento uuid; version_rice uuid; protocolo uuid; version_protocolo uuid;
  informe uuid;
BEGIN
  INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('00000000-0000-4000-8000-0000000150a1', 'admin@publicados.test', now());
  escuela := convi.registrar_primer_administrador(
    '00000000-0000-4000-8000-0000000150a1', 'Ada', 'Publicados', NULL, 'Escuela Publicados');
  SELECT id INTO admin FROM convi.membresias_establecimiento
  WHERE auth_usuario_id = '00000000-0000-4000-8000-0000000150a1';
  -- La auditoría lee quién actúa de app.membresia_id, igual que con la API.
  PERFORM set_config('app.membresia_id', admin::text, true);

  INSERT INTO convi.archivos (establecimiento_id, clave_almacenamiento, nombre_original,
    tipo_mime, tamano_bytes, sha256, subido_por)
  VALUES (escuela, escuela || '/documentos/rice-2026.pdf', 'rice-2026.pdf',
    'application/pdf', 1000, repeat('a', 64), admin) RETURNING id INTO archivo;
  INSERT INTO convi.archivos (establecimiento_id, clave_almacenamiento, nombre_original,
    tipo_mime, tamano_bytes, sha256, subido_por)
  VALUES (escuela, escuela || '/documentos/rice-2026-corregido.pdf', 'rice-2026-corregido.pdf',
    'application/pdf', 1200, repeat('b', 64), admin) RETURNING id INTO otro_archivo;

  INSERT INTO convi.documentos_institucionales (establecimiento_id, tipo_documento, titulo)
  VALUES (escuela, 'RICE', 'Reglamento interno') RETURNING id INTO documento;
  INSERT INTO convi.versiones_documento (establecimiento_id, documento_id, etiqueta_version,
    archivo_id, subido_por)
  VALUES (escuela, documento, '2026', archivo, admin) RETURNING id INTO version_rice;
  UPDATE convi.versiones_documento
  SET estado = 'PUBLICADO', publicado_en = now(), vigente_desde = current_date
  WHERE id = version_rice;

  INSERT INTO convi.protocolos (establecimiento_id, codigo, nombre)
  VALUES (escuela, 'PROT-ACOSO', 'Protocolo de acoso escolar') RETURNING id INTO protocolo;
  INSERT INTO convi.versiones_protocolo (establecimiento_id, protocolo_id, numero_version,
    version_documento_origen_id, creado_por)
  VALUES (escuela, protocolo, 1, version_rice, admin) RETURNING id INTO version_protocolo;
  INSERT INTO convi.pasos_protocolo (establecimiento_id, version_protocolo_id, orden_paso, nombre)
  VALUES (escuela, version_protocolo, 1, 'Recibir la denuncia'),
         (escuela, version_protocolo, 2, 'Entrevistar a los involucrados');
  UPDATE convi.versiones_protocolo
  SET estado = 'PUBLICADO', revisado_por = admin, publicado_en = now(), vigente_desde = current_date
  WHERE id = version_protocolo;

  INSERT INTO convi.informes (establecimiento_id, titulo, periodo_desde, periodo_hasta,
    archivo_id, creado_por)
  VALUES (escuela, 'Informe del primer semestre', '2026-03-01', '2026-07-31', archivo, admin)
  RETURNING id INTO informe;
  UPDATE convi.informes SET estado = 'PUBLICADO', publicado_en = now() WHERE id = informe;

  PERFORM set_config('prueba.escuela', escuela::text, true);
  PERFORM set_config('prueba.admin', admin::text, true);
  PERFORM set_config('prueba.otro_archivo', otro_archivo::text, true);
  PERFORM set_config('prueba.documento', documento::text, true);
  PERFORM set_config('prueba.version_rice', version_rice::text, true);
  PERFORM set_config('prueba.protocolo', protocolo::text, true);
  PERFORM set_config('prueba.version_protocolo', version_protocolo::text, true);
  PERFORM set_config('prueba.informe', informe::text, true);
END $$;

-- ===== Reglamento y documentos institucionales =====

SELECT throws_ok(
  $$UPDATE convi.versiones_documento SET archivo_id = current_setting('prueba.otro_archivo')::uuid
    WHERE id = current_setting('prueba.version_rice')::uuid$$,
  'P0001', 'Contenido publicado inmutable',
  'Documento: el archivo de una versión publicada no se reemplaza'
);

SELECT throws_ok(
  $$UPDATE convi.versiones_documento SET etiqueta_version = '2026 corregida'
    WHERE id = current_setting('prueba.version_rice')::uuid$$,
  'P0001', 'Contenido publicado inmutable',
  'Documento: la etiqueta de una versión publicada no cambia'
);

SELECT throws_ok(
  $$UPDATE convi.versiones_documento SET estado = 'BORRADOR'
    WHERE id = current_setting('prueba.version_rice')::uuid$$,
  'P0001', 'Una versión publicada no vuelve a borrador',
  'Documento: una versión publicada no vuelve a borrador'
);

SELECT lives_ok(
  $$INSERT INTO convi.versiones_documento (establecimiento_id, documento_id, etiqueta_version,
      archivo_id, subido_por)
    VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.documento')::uuid,
      '2026 corregida', current_setting('prueba.otro_archivo')::uuid,
      current_setting('prueba.admin')::uuid)$$,
  'Documento: la corrección se sube como otra versión del mismo documento'
);

SELECT lives_ok(
  $$UPDATE convi.versiones_documento SET estado = 'ARCHIVADO', vigente_hasta = current_date
    WHERE id = current_setting('prueba.version_rice')::uuid$$,
  'Documento: la versión publicada se puede archivar y cerrar su vigencia'
);

SELECT throws_ok(
  $$UPDATE convi.versiones_documento SET archivo_id = current_setting('prueba.otro_archivo')::uuid
    WHERE id = current_setting('prueba.version_rice')::uuid$$,
  'P0001', 'Contenido publicado inmutable',
  'Documento: una versión archivada tampoco cambia su contenido'
);

SELECT is(
  (SELECT etiqueta_version || ' · ' || a.nombre_original
   FROM convi.versiones_documento v JOIN convi.archivos a ON a.id = v.archivo_id
   WHERE v.id = current_setting('prueba.version_rice')::uuid),
  '2026 · rice-2026.pdf',
  'Documento: la versión anterior conserva su etiqueta y su archivo original'
);

SELECT is(
  (SELECT count(*)::int FROM convi.versiones_documento
   WHERE documento_id = current_setting('prueba.documento')::uuid),
  2,
  'Documento: quedan las dos versiones, la original y la corregida'
);

-- ===== Protocolos =====

SELECT throws_ok(
  $$UPDATE convi.versiones_protocolo SET notas = 'Cambio después de publicar'
    WHERE id = current_setting('prueba.version_protocolo')::uuid$$,
  'P0001', 'Contenido publicado inmutable',
  'Protocolo: una versión publicada no cambia su contenido'
);

SELECT throws_ok(
  $$UPDATE convi.pasos_protocolo SET nombre = 'Otro paso'
    WHERE version_protocolo_id = current_setting('prueba.version_protocolo')::uuid AND orden_paso = 1$$,
  'P0001', 'Pasos publicados inmutables',
  'Protocolo: un paso publicado no se edita'
);

SELECT throws_ok(
  $$INSERT INTO convi.pasos_protocolo (establecimiento_id, version_protocolo_id, orden_paso, nombre)
    VALUES (current_setting('prueba.escuela')::uuid,
      current_setting('prueba.version_protocolo')::uuid, 3, 'Paso agregado')$$,
  'P0001', 'No agregar pasos a versión publicada',
  'Protocolo: no se agregan pasos a una versión publicada'
);

SELECT throws_ok(
  $$DELETE FROM convi.pasos_protocolo
    WHERE version_protocolo_id = current_setting('prueba.version_protocolo')::uuid AND orden_paso = 2$$,
  'P0001', 'Pasos publicados inmutables',
  'Protocolo: un paso publicado no se borra'
);

-- La corrección es la versión 2, que parte con una copia de los pasos (igual
-- que nuevaVersion en protocolos.service.ts) y se edita mientras es borrador.
DO $$
DECLARE nueva uuid;
BEGIN
  INSERT INTO convi.versiones_protocolo (establecimiento_id, protocolo_id, numero_version,
    version_documento_origen_id, creado_por)
  VALUES (current_setting('prueba.escuela')::uuid, current_setting('prueba.protocolo')::uuid, 2,
    current_setting('prueba.version_rice')::uuid, current_setting('prueba.admin')::uuid)
  RETURNING id INTO nueva;
  INSERT INTO convi.pasos_protocolo (establecimiento_id, version_protocolo_id, orden_paso, nombre)
  SELECT establecimiento_id, nueva, orden_paso, nombre FROM convi.pasos_protocolo
  WHERE version_protocolo_id = current_setting('prueba.version_protocolo')::uuid;
  UPDATE convi.pasos_protocolo SET nombre = 'Recibir la denuncia por escrito'
  WHERE version_protocolo_id = nueva AND orden_paso = 1;
  PERFORM set_config('prueba.version_protocolo_2', nueva::text, true);
END $$;

SELECT is(
  (SELECT string_agg(nombre, ' / ' ORDER BY orden_paso) FROM convi.pasos_protocolo
   WHERE version_protocolo_id = current_setting('prueba.version_protocolo_2')::uuid),
  'Recibir la denuncia por escrito / Entrevistar a los involucrados',
  'Protocolo: la corrección es la versión 2 con sus propios pasos'
);

SELECT is(
  (SELECT string_agg(nombre, ' / ' ORDER BY orden_paso) FROM convi.pasos_protocolo
   WHERE version_protocolo_id = current_setting('prueba.version_protocolo')::uuid),
  'Recibir la denuncia / Entrevistar a los involucrados',
  'Protocolo: la versión publicada conserva sus pasos'
);

-- ===== Informes =====

SELECT throws_ok(
  $$UPDATE convi.informes SET titulo = 'Informe corregido'
    WHERE id = current_setting('prueba.informe')::uuid$$,
  'P0001', 'El informe publicado se conserva, crear nueva edición',
  'Informe: un informe publicado no se modifica'
);

SELECT throws_ok(
  $$UPDATE convi.informes SET estado = 'BORRADOR'
    WHERE id = current_setting('prueba.informe')::uuid$$,
  'P0001', 'El informe publicado se conserva, crear nueva edición',
  'Informe: un informe publicado no vuelve a borrador'
);

SELECT lives_ok(
  $$INSERT INTO convi.informes (establecimiento_id, titulo, periodo_desde, periodo_hasta,
      creado_por, informe_anterior_id)
    VALUES (current_setting('prueba.escuela')::uuid, 'Informe del primer semestre, corregido',
      '2026-03-01', '2026-07-31', current_setting('prueba.admin')::uuid,
      current_setting('prueba.informe')::uuid)$$,
  'Informe: la corrección es una edición nueva que referencia al publicado'
);

SELECT throws_ok(
  $$UPDATE convi.informes SET informe_anterior_id = id
    WHERE informe_anterior_id = current_setting('prueba.informe')::uuid$$,
  'P0001', 'Informe no puede ser su propia edición anterior',
  'Informe: una edición no se referencia a sí misma'
);

SELECT is(
  (SELECT titulo || ' · ' || estado FROM convi.informes
   WHERE id = current_setting('prueba.informe')::uuid),
  'Informe del primer semestre · PUBLICADO',
  'Informe: el publicado queda igual'
);

-- ===== La API no borra lo publicado =====

SELECT ok(
  NOT has_table_privilege('convi_backend', 'convi.versiones_documento', 'DELETE')
  AND NOT has_table_privilege('convi_backend', 'convi.versiones_protocolo', 'DELETE')
  AND NOT has_table_privilege('convi_backend', 'convi.pasos_protocolo', 'DELETE')
  AND NOT has_table_privilege('convi_backend', 'convi.informes', 'DELETE'),
  'La API no tiene permiso para borrar versiones, pasos ni informes'
);

SELECT * FROM finish();
ROLLBACK;
