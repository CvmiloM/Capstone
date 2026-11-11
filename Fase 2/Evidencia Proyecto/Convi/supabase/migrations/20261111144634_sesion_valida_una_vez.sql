-- Rendimiento, sin ítem del backlog (hallazgo de PB-131): las 51 políticas
-- aislamiento_backend llamaban a convi.sesion_valida() una vez por cada fila
-- leída o escrita. La función no recibe datos de la fila: solo lee la sesión
-- de la transacción (cuenta, escuela y segundo factor), así que en una misma
-- consulta siempre da el mismo resultado. Escrita como (SELECT ...), PostgreSQL
-- la calcula una sola vez por consulta. La regla no cambia: se conserva la
-- condición de la escuela y la misma comprobación de la sesión.
--
-- Medido como la API en la Escuela Sintética Sur, con los mismos resultados:
-- bandeja de 166 a 32 ms y sus totales de 80 a 2 ms, lista de casos de 337 a
-- 20 ms, estudiantes de 162 a 16 ms y resumen de Admin de 20 a 2,4 ms.
--
-- Las políticas nuevas de convi_backend deben usar la misma forma:
-- (SELECT convi.sesion_valida()). Lo comprueba
-- supabase/tests/politicas_sesion_una_vez.sql.

ALTER POLICY aislamiento_backend ON convi.establecimientos
  USING (id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.anios_academicos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.personas
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.estudiantes
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.membresias_establecimiento
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.cursos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.asignaciones_docentes
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.matriculas
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.apoderados_estudiante
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.accesos_apoderado
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.categorias_convivencia
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.casos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.situaciones
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.participaciones
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.revisiones_convivencia
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.historial_estados_caso
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.archivos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.documentos_institucionales
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.versiones_documento
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.fragmentos_rag
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.protocolos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.versiones_protocolo
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.pasos_protocolo
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.protocolos_caso
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.estados_pasos_protocolo_caso
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.referencias_revision_normativa
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.planes_intervencion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.acciones_plan_intervencion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.actuaciones
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.compromisos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.revisiones_compromisos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.comunicaciones
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.reglas
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.alertas
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.situaciones_alerta
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.planes_gestion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.objetivos_plan_gestion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.acciones_plan_gestion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.actividades_plan_gestion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.evidencias
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.notificaciones
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.procesos_importacion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.filas_importacion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.eventos_auditoria
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.registros_solicitudes_ia
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.aclaraciones_situacion
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.cursos_actividad
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.profesionales_actividad
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.informes
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.niveles_educativos
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

ALTER POLICY aislamiento_backend ON convi.borradores_documentales_ia
  USING (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()))
  WITH CHECK (establecimiento_id = convi.establecimiento_actual() AND (SELECT convi.sesion_valida()));

-- Si en una base quedara alguna política de convi_backend llamando a la
-- función fila por fila, la migración se detiene y no cambia nada.
DO $$
DECLARE
  pendientes text;
BEGIN
  SELECT string_agg(tablename, ', ' ORDER BY tablename) INTO pendientes
  FROM pg_policies
  WHERE schemaname = 'convi' AND 'convi_backend' = ANY (roles)
    AND (regexp_replace(coalesce(qual, ''), 'SELECT\s+convi\.sesion_valida\(\)', '', 'g') ~ 'sesion_valida\('
      OR regexp_replace(coalesce(with_check, ''), 'SELECT\s+convi\.sesion_valida\(\)', '', 'g') ~ 'sesion_valida\(');
  IF pendientes IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas que siguen evaluando la sesión por fila: %', pendientes;
  END IF;
END $$;
