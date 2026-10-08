CREATE SCHEMA convi;

REVOKE ALL ON SCHEMA convi FROM PUBLIC, anon, authenticated;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions; -- [pgvector]

SET LOCAL search_path = convi, public, extensions;

-- ===== 1. Tablas =====


CREATE FUNCTION convi.correo_valido(p_correo text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT p_correo ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' $$;

CREATE FUNCTION convi.rut_valido(p_rut text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE cuerpo text; suma integer:=0; factor integer:=2; i integer; resto integer;
BEGIN
 IF p_rut IS NULL OR p_rut !~ '^[0-9]{7,8}-[0-9K]$' THEN RETURN false; END IF;
 cuerpo:=split_part(p_rut,'-',1);
 FOR i IN REVERSE length(cuerpo)..1 LOOP
  suma:=suma+substr(cuerpo,i,1)::integer*factor;
  factor:=CASE WHEN factor=7 THEN 2 ELSE factor+1 END;
 END LOOP;
 resto:=11-(suma%11);
 RETURN split_part(p_rut,'-',2)=CASE resto WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE resto::text END;
END $$;

CREATE TABLE convi.establecimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre varchar(180) NOT NULL,
  codigo varchar(40),
  region varchar(100),
  comuna varchar(100),
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  zona_horaria varchar(80) NOT NULL DEFAULT 'America/Santiago',
  configuracion_regional varchar(20) NOT NULL DEFAULT 'es-CL',
  metodo_registro_actual text,
  contexto_onboarding jsonb NOT NULL DEFAULT '{}'::jsonb,
  onboarding_completado_en timestamptz,
  UNIQUE (codigo),
  direccion text,
  telefono varchar(40),
  correo_contacto varchar(180) CHECK (correo_contacto IS NULL OR convi.correo_valido(correo_contacto)),
  plazo_cierre_dias integer CHECK (plazo_cierre_dias > 0)
);

CREATE TABLE convi.niveles_educativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  codigo varchar(30) NOT NULL,
  nombre varchar(80) NOT NULL,
  orden integer NOT NULL CHECK (orden > 0),
  ciclo varchar(60) NOT NULL CHECK (ciclo IN ('PARVULARIA','BASICA','MEDIA')),
  tramo varchar(80) NOT NULL CHECK (tramo ~ '^[A-Z0-9_]+$'),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (establecimiento_id, codigo),
  UNIQUE (establecimiento_id, orden),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.anios_academicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  anio smallint NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  fecha_inicio date,
  fecha_fin date,
  estado varchar(20) NOT NULL DEFAULT 'PLANIFICADO' CHECK (estado IN ('PLANIFICADO','ACTIVO','CERRADO')),
  CHECK ( fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio ),
  UNIQUE (establecimiento_id, anio),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  nombres varchar(100) NOT NULL,
  apellidos varchar(120) NOT NULL,
  correo varchar(180) CHECK (correo IS NULL OR convi.correo_valido(correo)),
  telefono varchar(40),
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  rut varchar(12),
  direccion text,
  UNIQUE (establecimiento_id, id),
  CONSTRAINT persona_rut_valido CHECK (rut IS NULL OR convi.rut_valido(rut))
);

CREATE TABLE convi.estudiantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  persona_id uuid NOT NULL UNIQUE,
  codigo_estudiante varchar(60) NOT NULL,
  fecha_nacimiento date,
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO','EGRESADO')),
  UNIQUE (establecimiento_id, codigo_estudiante),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.membresias_establecimiento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  persona_id uuid NOT NULL,
  codigo_perfil varchar(30) NOT NULL CHECK (codigo_perfil IN ('ADMIN','CONVIVENCIA','PROFESOR','APODERADO')),
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACTIVO','SUSPENDIDO','REVOCADO')),
  invitado_por uuid,
  invitado_en timestamptz,
  activado_en timestamptz,
  auth_usuario_id uuid,
  correo_invitacion varchar(180) NOT NULL CHECK (convi.correo_valido(correo_invitacion)),
  UNIQUE (establecimiento_id, auth_usuario_id),
  UNIQUE (establecimiento_id, persona_id),
  UNIQUE (establecimiento_id, id),
  -- HU-003 y HU-002 una cuenta activa o suspendida tiene identidad verificada y fecha de activación
  CONSTRAINT membresia_activada_completa CHECK (estado NOT IN ('ACTIVO','SUSPENDIDO') OR (auth_usuario_id IS NOT NULL AND activado_en IS NOT NULL)),
  -- HU-009 una invitación pendiente guarda quién invitó y cuándo
  CONSTRAINT membresia_invitacion_completa CHECK (estado<>'PENDIENTE' OR (invitado_por IS NOT NULL AND invitado_en IS NOT NULL))
);

CREATE TABLE convi.cursos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  anio_academico_id uuid NOT NULL,
  codigo varchar(40) NOT NULL,
  nombre varchar(120) NOT NULL,
  nivel_id uuid NOT NULL,
  seccion varchar(20),
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('PLANIFICADO','ACTIVO','CERRADO','ARCHIVADO')),
  UNIQUE (establecimiento_id, anio_academico_id, codigo),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.asignaciones_docentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  membresia_id uuid NOT NULL,
  rol_asignacion varchar(30) NOT NULL CHECK (rol_asignacion IN ('PROFESOR_JEFE','PROFESOR')),
  fecha_inicio date,
  fecha_fin date,
  CHECK ( fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio ),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.matriculas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  estudiante_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  anio_academico_id uuid NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','TRASLADADO','COMPLETADO','RETIRADO')),
  matriculado_en date,
  finalizado_en date,
  CHECK (finalizado_en IS NULL OR finalizado_en >= matriculado_en),
  UNIQUE (establecimiento_id, id),
  -- HU-014 la matrícula indica su fecha de inicio, HU-017 y HU-024 una matrícula terminada tiene fecha de término y estado Completado, Trasladado o Retirado
  CONSTRAINT matricula_fecha_inicio CHECK (matriculado_en IS NOT NULL),
  CONSTRAINT matricula_estado_termino CHECK ((estado='ACTIVO')=(finalizado_en IS NULL))
);

CREATE TABLE convi.apoderados_estudiante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  estudiante_id uuid NOT NULL,
  persona_apoderado_id uuid NOT NULL,
  tipo_relacion varchar(60),
  es_principal boolean NOT NULL DEFAULT false,
  puede_ser_contactado boolean NOT NULL DEFAULT true,
  activo_desde date,
  activo_hasta date,
  CHECK ( activo_desde IS NULL OR activo_hasta IS NULL OR activo_hasta >= activo_desde ),
  UNIQUE (estudiante_id, persona_apoderado_id),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.accesos_apoderado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  apoderado_estudiante_id uuid NOT NULL,
  membresia_apoderado_id uuid NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACTIVO','EXPIRADO','REVOCADO')),
  expira_en timestamptz,
  otorgado_por uuid NOT NULL,
  otorgado_en timestamptz NOT NULL DEFAULT now(),
  revocado_por uuid,
  revocado_en timestamptz,
  CHECK ( (estado <> 'REVOCADO') OR revocado_en IS NOT NULL ),
  UNIQUE (establecimiento_id, id),
  -- HU-099 un acceso revocado guarda quién y cuándo
  CONSTRAINT acceso_revocado_completo CHECK (estado<>'REVOCADO' OR (revocado_por IS NOT NULL AND revocado_en IS NOT NULL))
);

CREATE TABLE convi.categorias_convivencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  nombre varchar(120) NOT NULL,
  descripcion text,
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.casos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  codigo varchar(40) NOT NULL,
  resumen text NOT NULL,
  categoria_principal_id uuid,
  asignado_a_membresia_id uuid NOT NULL,
  abierto_por uuid NOT NULL,
  abierto_en timestamptz NOT NULL DEFAULT now(),
  estado_actual varchar(30) NOT NULL DEFAULT 'EN_ANALISIS' CHECK (estado_actual IN ('EN_ANALISIS','EN_REVISION','EN_INTERVENCION','EN_SEGUIMIENTO','CERRADO','REABIERTO')),
  cerrado_en timestamptz,
  UNIQUE (establecimiento_id, codigo),
  UNIQUE (establecimiento_id, id),
  titulo varchar(220) NOT NULL,
  fecha_inicio date NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  registro_historico boolean NOT NULL DEFAULT false,
  justificacion_independiente text,
  plazo_cierre_dias_aplicado integer CHECK (plazo_cierre_dias_aplicado > 0),
  fecha_limite_cierre date CHECK (fecha_limite_cierre >= fecha_inicio),
  CHECK (num_nonnulls(plazo_cierre_dias_aplicado,fecha_limite_cierre) IN (0,2))
);

CREATE TABLE convi.situaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  codigo varchar(40) NOT NULL,
  reportado_por_membresia_id uuid NOT NULL,
  curso_contexto_id uuid,
  tipo_origen varchar(30) NOT NULL CHECK (tipo_origen IN ('PROFESOR','ESTUDIANTE','APODERADO','FUNCIONARIO','OTRO')),
  persona_origen_id uuid,
  ocurrido_en timestamptz NOT NULL,
  reportado_en timestamptz NOT NULL DEFAULT now(),
  lugar varchar(120),
  descripcion text NOT NULL,
  categoria_id uuid,
  estado varchar(30) NOT NULL DEFAULT 'NUEVA' CHECK (estado IN ('NUEVA','EN_REVISION','INFORMACION_SOLICITADA','ANTECEDENTE','DESCARTADA','VINCULADA_CASO')),
  caso_id uuid,
  vinculado_a_caso_en timestamptz,
  vinculado_a_caso_por uuid,
  asignado_a_membresia_id uuid,
  UNIQUE (establecimiento_id, codigo),
  CHECK ((estado = 'VINCULADA_CASO' AND caso_id IS NOT NULL AND vinculado_a_caso_en IS NOT NULL AND vinculado_a_caso_por IS NOT NULL) OR (estado <> 'VINCULADA_CASO' AND caso_id IS NULL AND vinculado_a_caso_en IS NULL AND vinculado_a_caso_por IS NULL)),
  UNIQUE (establecimiento_id, id),
  urgencia varchar(20) NOT NULL DEFAULT 'NORMAL' CHECK (urgencia IN ('NORMAL','URGENTE','INMEDIATA')),
  registro_historico boolean NOT NULL DEFAULT false
);

CREATE TABLE convi.participaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  persona_id uuid NOT NULL,
  situacion_id uuid,
  caso_id uuid,
  actuacion_id uuid,
  rol_contextual varchar(60) NOT NULL,
  estado_asistencia text CHECK (estado_asistencia IN ('PENDIENTE','ASISTIO','NO_ASISTIO','JUSTIFICADO')),
  activo_desde timestamptz NOT NULL DEFAULT now(),
  activo_hasta timestamptz,
  notas text,
  CHECK (num_nonnulls(situacion_id, caso_id, actuacion_id) = 1),
  CHECK (estado_asistencia IS NULL OR actuacion_id IS NOT NULL),
  CHECK (activo_hasta IS NULL OR activo_hasta >= activo_desde),
  UNIQUE (establecimiento_id, id),
  matricula_contexto_id uuid
);

CREATE TABLE convi.revisiones_convivencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  situacion_id uuid,
  caso_id uuid,
  caso_destino_id uuid,
  tipo_revision text NOT NULL CHECK (tipo_revision IN ('CONSULTA','DECISION')),
  resultado text CHECK (resultado IN ('ANTECEDENTE','DESCARTADA','INFORMACION_SOLICITADA','VINCULADA_CASO')),
  fundamento text NOT NULL,
  modo_revision text NOT NULL DEFAULT 'MANUAL' CHECK (modo_revision IN ('MANUAL','ASISTIDA_IA')),
  aplicabilidad text CHECK (aplicabilidad IN ('APLICABLE','NO_APLICABLE','POR_CONFIRMAR')),
  version_protocolo_seleccionada_id uuid,
  revisado_por uuid NOT NULL,
  revisado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(situacion_id, caso_id) = 1),
  CHECK (tipo_revision <> 'DECISION' OR (situacion_id IS NOT NULL AND resultado IS NOT NULL)),
  CHECK ((resultado = 'VINCULADA_CASO' AND caso_destino_id IS NOT NULL) OR (resultado IS DISTINCT FROM 'VINCULADA_CASO' AND caso_destino_id IS NULL)),
  UNIQUE (establecimiento_id, id),
  situacion_duplicada_id uuid,
  revision_anterior_id uuid,
  -- HU-134 y HU-071 una revisión de consulta indica la aplicabilidad del reglamento o protocolo
  CONSTRAINT consulta_con_aplicabilidad CHECK (tipo_revision<>'CONSULTA' OR aplicabilidad IS NOT NULL)
);

CREATE TABLE convi.historial_estados_caso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  estado_anterior varchar(30),
  estado_nuevo varchar(30) NOT NULL,
  cambiado_por uuid NOT NULL,
  cambiado_en timestamptz NOT NULL DEFAULT now(),
  motivo text NOT NULL,
  resumen_cierre text,
  evidencia_cierre_id uuid,
  UNIQUE (establecimiento_id, id),
  justificacion_pendientes text
);

CREATE TABLE convi.archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  clave_almacenamiento text NOT NULL UNIQUE,
  nombre_original varchar(255) NOT NULL,
  tipo_mime varchar(120) NOT NULL,
  tamano_bytes bigint NOT NULL CHECK (tamano_bytes >= 0 AND tamano_bytes <= 26214400),
  sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  subido_por uuid NOT NULL,
  subido_en timestamptz NOT NULL DEFAULT now(),
  bucket_id text NOT NULL DEFAULT 'convi-privado',
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.documentos_institucionales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  tipo_documento varchar(40) NOT NULL CHECK (tipo_documento IN ('RICE','FUENTE_PROTOCOLO','PLAN','POLITICA','PLANTILLA','OTRO')),
  titulo varchar(220) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.versiones_documento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  documento_id uuid NOT NULL,
  etiqueta_version varchar(60) NOT NULL,
  vigente_desde date,
  vigente_hasta date,
  archivo_id uuid NOT NULL,
  subido_por uuid NOT NULL,
  publicado_en timestamptz,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADO','ARCHIVADO')),
  estado_procesamiento varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_procesamiento IN ('PENDIENTE','PROCESANDO','LISTO','FALLIDO','NO_APLICA')),
  procesado_en timestamptz,
  incluir_en_busqueda_ia boolean NOT NULL DEFAULT false,
  detalle_error_procesamiento text,
  intentos_procesamiento integer NOT NULL DEFAULT 0 CHECK (intentos_procesamiento >= 0),
  CHECK ( vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde ),
  UNIQUE (documento_id, etiqueta_version),
  UNIQUE (establecimiento_id, id),
  -- HU-069 y HU-028 una versión publicada tiene fecha de publicación y fecha de inicio de vigencia
  CONSTRAINT version_publicada_vigente CHECK (estado<>'PUBLICADO' OR (publicado_en IS NOT NULL AND vigente_desde IS NOT NULL))
);

CREATE TABLE convi.fragmentos_rag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  version_documento_id uuid NOT NULL,
  indice_fragmento integer NOT NULL CHECK (indice_fragmento >= 0),
  pagina_desde integer,
  pagina_hasta integer,
  titulo_seccion varchar(220),
  contenido text NOT NULL,
  modelo_embedding varchar(120),
  creado_en timestamptz NOT NULL DEFAULT now(),
  embedding extensions.vector(1024), -- [pgvector]
  CONSTRAINT embedding_modelo CHECK ((embedding IS NULL AND modelo_embedding IS NULL) OR (embedding IS NOT NULL AND modelo_embedding='bge-m3:567m-fp16')), -- [pgvector]
  CHECK ( pagina_desde IS NULL OR pagina_hasta IS NULL OR pagina_hasta >= pagina_desde ),
  UNIQUE (version_documento_id, indice_fragmento),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.protocolos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  codigo varchar(50) NOT NULL,
  nombre varchar(220) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
  UNIQUE (establecimiento_id, codigo),
  UNIQUE (establecimiento_id, id),
  naturaleza varchar(20) NOT NULL DEFAULT 'OFICIAL' CHECK (naturaleza IN ('OFICIAL','PROPUESTA_IA'))
);

CREATE TABLE convi.versiones_protocolo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  protocolo_id uuid NOT NULL,
  version_documento_origen_id uuid,
  numero_version integer NOT NULL CHECK (numero_version > 0),
  vigente_desde date,
  vigente_hasta date,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADO','ARCHIVADO')),
  revisado_por uuid,
  publicado_en timestamptz,
  notas text,
  CHECK ( vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde ),
  CHECK ( estado = 'BORRADOR' OR version_documento_origen_id IS NOT NULL OR COALESCE(length(trim(notas)), 0) > 0 ),
  UNIQUE (protocolo_id, numero_version),
  UNIQUE (establecimiento_id, id),
  generado_por_ia boolean NOT NULL DEFAULT false,
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE convi.pasos_protocolo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  version_protocolo_id uuid NOT NULL,
  orden_paso integer NOT NULL CHECK (orden_paso > 0),
  nombre varchar(180) NOT NULL,
  descripcion text,
  codigo_rol_responsable varchar(30),
  valor_plazo integer CHECK (valor_plazo IS NULL OR valor_plazo >= 0),
  unidad_plazo varchar(20) CHECK (unidad_plazo IS NULL OR unidad_plazo IN ('MINUTOS','HORAS','DIAS_HABILES','DIAS')),
  requiere_evidencia boolean NOT NULL DEFAULT false,
  es_obligatorio boolean NOT NULL DEFAULT true,
  UNIQUE (version_protocolo_id, orden_paso),
  UNIQUE (establecimiento_id, id),
  -- El paso del protocolo solo prevé a Convivencia como responsable, igual que estados_pasos_protocolo_caso.responsable_id
  -- Si en la práctica lo realiza otra persona, se indica en la descripción del paso
  CONSTRAINT paso_responsable_convivencia CHECK (codigo_rol_responsable IS NULL OR codigo_rol_responsable='CONVIVENCIA')
);

CREATE TABLE convi.protocolos_caso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  version_protocolo_id uuid NOT NULL,
  aplicado_por uuid NOT NULL,
  aplicado_en timestamptz NOT NULL DEFAULT now(),
  estado varchar(20) NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','COMPLETADO','CANCELADO')),
  fundamento text,
  completado_en timestamptz,
  UNIQUE (establecimiento_id, id),
  -- Protocolo aplicado y plan de intervención se completan o cancelan manualmente, sin condiciones sobre pasos o acciones
  -- Completar, cancelar o reabrir exige motivo y queda auditado, la fecha de término la registra el sistema
  CONSTRAINT protocolo_caso_fecha_termino CHECK ((estado='COMPLETADO')=(completado_en IS NOT NULL)),
  -- HU-071 al aplicar un protocolo se guarda el fundamento
  CONSTRAINT protocolo_caso_fundamento CHECK (nullif(trim(fundamento),'') IS NOT NULL)
);

CREATE TABLE convi.estados_pasos_protocolo_caso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  protocolo_caso_id uuid NOT NULL,
  paso_protocolo_id uuid NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROGRESO','COMPLETADO','OMITIDO','VENCIDO')),
  vence_en timestamptz,
  completado_en timestamptz,
  completado_por uuid,
  notas text,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (protocolo_caso_id, paso_protocolo_id),
  UNIQUE (establecimiento_id, id),
  responsable_id uuid
);

CREATE TABLE convi.referencias_revision_normativa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  version_documento_id uuid NOT NULL,
  pagina_desde integer,
  pagina_hasta integer,
  titulo_seccion varchar(220),
  revision_id uuid NOT NULL,
  CHECK ( pagina_desde IS NULL OR pagina_hasta IS NULL OR pagina_hasta >= pagina_desde ),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.planes_intervencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  protocolo_caso_id uuid,
  objetivo text NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','ACTIVO','COMPLETADO','CANCELADO')),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  UNIQUE (establecimiento_id, id),
  CONSTRAINT plan_intervencion_fecha_termino CHECK ((estado='COMPLETADO')=(completado_en IS NOT NULL))
);

CREATE TABLE convi.acciones_plan_intervencion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  plan_intervencion_id uuid NOT NULL,
  descripcion text NOT NULL,
  persona_responsable_id uuid NOT NULL,
  vence_en timestamptz NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROGRESO','COMPLETADO','CANCELADO','VENCIDO')),
  completado_en timestamptz,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establecimiento_id, id),
  -- HU-054 una acción de intervención completada tiene fecha de cumplimiento
  CONSTRAINT accion_intervencion_completada CHECK (estado<>'COMPLETADO' OR completado_en IS NOT NULL)
);

CREATE TABLE convi.actuaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  accion_plan_id uuid,
  tipo_actuacion text NOT NULL CHECK (tipo_actuacion IN ('INTERVENCION','ENTREVISTA','REUNION','MEDIACION','SEGUIMIENTO','ACOMPANAMIENTO')),
  estado text NOT NULL DEFAULT 'PLANIFICADA' CHECK (estado IN ('PLANIFICADA','POSPUESTA','REALIZADA','CANCELADA')),
  membresia_responsable_id uuid NOT NULL,
  objetivo text NOT NULL,
  descripcion text,
  programado_en timestamptz,
  fin_programado_en timestamptz,
  realizado_en timestamptz,
  fin_real_en timestamptz,
  lugar varchar(160),
  resultado text,
  proxima_accion text,
  proximo_seguimiento_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (estado <> 'REALIZADA' OR (realizado_en IS NOT NULL AND resultado IS NOT NULL)),
  CHECK (fin_programado_en IS NULL OR (programado_en IS NOT NULL AND fin_programado_en >= programado_en)),
  CHECK (fin_real_en IS NULL OR (realizado_en IS NOT NULL AND fin_real_en >= realizado_en)),
  UNIQUE (establecimiento_id, id),
  creado_por uuid NOT NULL,
  seguimiento_anterior_id uuid,
  -- HU-061 y HU-084 fecha de la última modificación para rechazar una edición hecha sobre datos desactualizados
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  -- HU-060 un seguimiento realizado guarda la próxima acción y un seguimiento tiene un solo seguimiento siguiente
  CONSTRAINT seguimiento_realizado_proxima_accion CHECK (tipo_actuacion<>'SEGUIMIENTO' OR estado<>'REALIZADA' OR nullif(trim(proxima_accion),'') IS NOT NULL)
);

CREATE TABLE convi.compromisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  descripcion text NOT NULL,
  persona_responsable_id uuid NOT NULL,
  vence_en timestamptz NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROGRESO','COMPLETADO','VENCIDO','CANCELADO')),
  completado_en timestamptz,
  nota_cumplimiento text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actuacion_origen_id uuid,
  UNIQUE (establecimiento_id, id),
  creado_por uuid NOT NULL
);

CREATE TABLE convi.revisiones_compromisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  compromiso_id uuid NOT NULL,
  estado_observado varchar(30) NOT NULL CHECK (estado_observado IN ('PENDIENTE','EN_PROGRESO','COMPLETADO','VENCIDO','CANCELADO')),
  observacion text,
  registrado_en timestamptz NOT NULL DEFAULT now(),
  actuacion_id uuid NOT NULL,
  UNIQUE (actuacion_id, compromiso_id),
  UNIQUE (establecimiento_id, id),
  creado_por uuid NOT NULL
);

CREATE TABLE convi.comunicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  caso_id uuid NOT NULL,
  tipo_comunicacion varchar(30) NOT NULL CHECK (tipo_comunicacion IN ('CORREO','LLAMADA','PRESENCIAL','INSTITUCIONAL','OTRO')),
  persona_destinataria_id uuid,
  direccion_destinatario varchar(220) CHECK (direccion_destinatario IS NULL OR convi.correo_valido(direccion_destinatario)),
  asunto varchar(220),
  cuerpo_enviado text,
  resumen text NOT NULL,
  enviado_en timestamptz,
  estado_entrega varchar(30) NOT NULL DEFAULT 'NO_APLICA' CHECK (estado_entrega IN ('NO_APLICA','BORRADOR','PENDIENTE','ENVIADO','ENTREGADO','FALLIDO','REBOTADO')),
  creado_por uuid NOT NULL,
  generado_por_ia boolean NOT NULL DEFAULT false,
  referencia_externa varchar(220),
  archivo_respaldo_id uuid,
  CHECK ( tipo_comunicacion <> 'CORREO' OR estado_entrega = 'BORRADOR' OR (direccion_destinatario IS NOT NULL AND asunto IS NOT NULL AND cuerpo_enviado IS NOT NULL) ),
  CHECK ( tipo_comunicacion <> 'CORREO' OR estado_entrega NOT IN ('ENVIADO','ENTREGADO','REBOTADO') OR enviado_en IS NOT NULL ),
  UNIQUE (establecimiento_id, id),
  ocurrido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_por uuid,
  confirmado_en timestamptz,
  clave_envio uuid UNIQUE,
  detalle_error text,
  -- HU-058 una llamada, conversación o comunicación institucional guarda la fecha en que ocurrió
  CONSTRAINT comunicacion_fecha_ocurrida CHECK (tipo_comunicacion='CORREO' OR ocurrido_en IS NOT NULL)
);

CREATE TABLE convi.reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  codigo_regla varchar(50) NOT NULL,
  numero_version integer NOT NULL CHECK (numero_version > 0),
  nombre varchar(180) NOT NULL,
  tipo_regla varchar(40) NOT NULL CHECK (tipo_regla IN ('RECURRENCIA','FECHA_LIMITE','PLAZO_PROTOCOLO','VARIACION_PERIODO','OTRO')),
  codigo_metrica varchar(80),
  codigo_operador varchar(10),
  valor_umbral numeric,
  ventana_comparacion_dias integer CHECK (ventana_comparacion_dias > 0),
  ventana_dias integer CHECK (ventana_dias IS NULL OR ventana_dias >= 0),
  categoria_id uuid,
  codigo_ambito varchar(30) NOT NULL,
  codigo_accion varchar(40) NOT NULL,
  codigo_prioridad varchar(20) NOT NULL,
  vigente_desde date,
  vigente_hasta date,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','ACTIVO','ARCHIVADO')),
  CHECK ( vigente_desde IS NULL OR vigente_hasta IS NULL OR vigente_hasta >= vigente_desde ),
  UNIQUE (establecimiento_id, codigo_regla, numero_version),
  UNIQUE (establecimiento_id, id),
  -- Valores permitidos de cada código de la regla, el motor de reglas solo calcula estos valores
  CONSTRAINT reglas_ambito_valido CHECK (codigo_ambito IN ('ESTUDIANTE','CURSO','CASO','ESTABLECIMIENTO')),
  CONSTRAINT reglas_accion_valida CHECK (codigo_accion IN ('ALERTA','ALERTA_Y_NOTIFICACION')),
  CONSTRAINT reglas_prioridad_valida CHECK (codigo_prioridad IN ('BAJA','MEDIA','ALTA')),
  CONSTRAINT reglas_metrica_valida CHECK (codigo_metrica IS NULL OR codigo_metrica IN ('CONTEO_SITUACIONES','VARIACION_PORCENTUAL','CONTEO_VENCIDOS')),
  CONSTRAINT reglas_operador_valido CHECK (codigo_operador IS NULL OR codigo_operador IN ('GT','GE','LT','LE','EQ')),
  -- Cada tipo de regla exige la métrica, el ámbito y los datos que el motor necesita para calcularla
  -- coalesce(...,false) evita que un campo vacío deje la condición en estado desconocido, una CHECK desconocida se aceptaría
  -- OTRO no tiene cálculo automático definido, puede guardarse como borrador o archivarse pero no activarse
  CONSTRAINT reglas_coherencia_tipo CHECK (coalesce(CASE tipo_regla
   WHEN 'RECURRENCIA' THEN codigo_metrica='CONTEO_SITUACIONES' AND codigo_ambito IN ('ESTUDIANTE','CURSO','ESTABLECIMIENTO')
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral > 0 AND valor_umbral=trunc(valor_umbral)
    AND ventana_dias IS NOT NULL AND ventana_dias > 0
   WHEN 'VARIACION_PERIODO' THEN codigo_metrica='VARIACION_PORCENTUAL' AND codigo_ambito IN ('ESTUDIANTE','CURSO','ESTABLECIMIENTO')
   WHEN 'FECHA_LIMITE' THEN codigo_metrica='CONTEO_VENCIDOS' AND codigo_ambito='CASO' AND categoria_id IS NULL
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral >= 0 AND valor_umbral=trunc(valor_umbral)
   WHEN 'PLAZO_PROTOCOLO' THEN codigo_metrica='CONTEO_VENCIDOS' AND codigo_ambito='CASO' AND categoria_id IS NULL
    AND codigo_operador IS NOT NULL AND valor_umbral IS NOT NULL AND valor_umbral >= 0 AND valor_umbral=trunc(valor_umbral)
   WHEN 'OTRO' THEN estado<>'ACTIVO'
   END, false))
);

CREATE TABLE convi.alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  regla_id uuid NOT NULL,
  estudiante_id uuid,
  curso_id uuid,
  caso_id uuid,
  generada_en timestamptz NOT NULL DEFAULT now(),
  estado varchar(20) NOT NULL DEFAULT 'NUEVA' CHECK (estado IN ('NUEVA','REVISADA','ARCHIVADO')),
  revisado_por uuid,
  revisado_en timestamptz,
  datos_explicacion jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (establecimiento_id, id),
  clave_evento varchar(220) NOT NULL,
  -- Atención de alertas: qué se hizo queda escrito
  observacion_revision text
);

CREATE TABLE convi.situaciones_alerta (
  establecimiento_id uuid NOT NULL,
  alerta_id uuid NOT NULL,
  situacion_id uuid NOT NULL,
  PRIMARY KEY (alerta_id, situacion_id)
);

CREATE TABLE convi.planes_gestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  anio_academico_id uuid NOT NULL,
  nombre varchar(220) NOT NULL,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','ACTIVO','COMPLETADO','ARCHIVADO')),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  aprobado_en timestamptz,
  UNIQUE (establecimiento_id, anio_academico_id, nombre),
  UNIQUE (establecimiento_id, id),
  -- Plan de Gestión: aprobación por Convivencia, estados, acciones, indicador y responsables
  aprobado_por uuid,
  CONSTRAINT plan_aprobacion_completa CHECK ((aprobado_en IS NULL)=(aprobado_por IS NULL)),
  CONSTRAINT plan_activo_aprobado CHECK (estado NOT IN ('ACTIVO','COMPLETADO') OR aprobado_en IS NOT NULL)
);

CREATE TABLE convi.objetivos_plan_gestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  plan_gestion_id uuid NOT NULL,
  titulo varchar(220) NOT NULL,
  descripcion text,
  orden integer NOT NULL CHECK (orden > 0),
  UNIQUE (plan_gestion_id, orden),
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.acciones_plan_gestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  objetivo_id uuid NOT NULL,
  titulo varchar(220) NOT NULL,
  descripcion text,
  persona_responsable_id uuid,
  publico_objetivo varchar(180),
  estado varchar(30) NOT NULL DEFAULT 'PLANIFICADO' CHECK (estado IN ('PLANIFICADO','EN_PROGRESO','COMPLETADO','CANCELADO')),
  evidencia_esperada text,
  resumen_resultado text,
  completado_en timestamptz,
  nombre_indicador varchar(220),
  meta_indicador numeric,
  valor_indicador numeric,
  unidad_indicador varchar(40),
  UNIQUE (establecimiento_id, id),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accion_indicador_completo CHECK ((meta_indicador IS NULL AND valor_indicador IS NULL) OR (nombre_indicador IS NOT NULL AND unidad_indicador IS NOT NULL)),
  CONSTRAINT accion_completada_con_resultado CHECK (estado<>'COMPLETADO' OR (completado_en IS NOT NULL AND nullif(trim(resumen_resultado),'') IS NOT NULL))
);

CREATE TABLE convi.actividades_plan_gestion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  accion_plan_id uuid NOT NULL,
  titulo varchar(220) NOT NULL,
  descripcion text,
  persona_responsable_id uuid,
  inicio_programado timestamptz,
  fin_programado timestamptz,
  lugar varchar(160),
  estado varchar(30) NOT NULL DEFAULT 'PLANIFICADO' CHECK (estado IN ('PLANIFICADO','EN_PROGRESO','COMPLETADO','CANCELADO','VENCIDO')),
  completado_en timestamptz,
  resumen_resultado text,
  CHECK ( inicio_programado IS NULL OR fin_programado IS NULL OR fin_programado >= inicio_programado ),
  UNIQUE (establecimiento_id, id),
  creado_por uuid NOT NULL,
  -- Actividades: inicio y término reales, que no pueden ser futuros
  inicio_real timestamptz,
  fin_real timestamptz,
  CONSTRAINT actividad_fechas_reales CHECK (fin_real IS NULL OR (inicio_real IS NOT NULL AND fin_real>=inicio_real)),
  CONSTRAINT actividad_completada_con_resultado CHECK (estado<>'COMPLETADO' OR (inicio_real IS NOT NULL AND fin_real IS NOT NULL AND completado_en IS NOT NULL AND nullif(trim(resumen_resultado),'') IS NOT NULL))
);

CREATE TABLE convi.evidencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  archivo_id uuid,
  tipo_evidencia varchar(40) NOT NULL,
  titulo varchar(220) NOT NULL,
  descripcion text,
  situacion_id uuid,
  caso_id uuid,
  compromiso_id uuid,
  accion_plan_id uuid,
  actividad_plan_id uuid,
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actuacion_id uuid,
  fecha_documento timestamptz,
  CHECK (num_nonnulls(situacion_id, caso_id, actuacion_id, compromiso_id, accion_plan_id, actividad_plan_id, aclaracion_id) = 1),
  CHECK (tipo_evidencia <> 'ACTA' OR archivo_id IS NOT NULL),
  UNIQUE (establecimiento_id, id),
  paso_caso_id uuid,
  rectifica_evidencia_id uuid,
  motivo_rectificacion text,
  aclaracion_id uuid,
  -- HU-057 tipo de evidencia de un catálogo, HU-062 el acta lleva archivo y fecha del documento, HU-063 una evidencia no se corrige a sí misma
  CONSTRAINT evidencia_tipo_valido CHECK (tipo_evidencia IN ('DOCUMENTO','IMAGEN','CORREO','ACTA','OTRO')),
  CONSTRAINT evidencia_acta_fechada CHECK (tipo_evidencia<>'ACTA' OR fecha_documento IS NOT NULL),
  CONSTRAINT evidencia_rectifica_otra CHECK (rectifica_evidencia_id IS NULL OR rectifica_evidencia_id<>id)
);

CREATE TABLE convi.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  membresia_destinatario_id uuid NOT NULL,
  tipo_notificacion varchar(50) NOT NULL,
  titulo varchar(180) NOT NULL,
  cuerpo text,
  tipo_recurso varchar(60),
  recurso_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  leido_en timestamptz,
  expira_en timestamptz,
  UNIQUE (establecimiento_id, id),
  clave_evento varchar(220),
  -- Catálogo de avisos internos, solo los recibe el equipo de Convivencia
  -- Profesores, administradores y apoderados no reciben avisos, el profesor ve sus aclaraciones pendientes en sus registros
  CONSTRAINT notificacion_tipo_valido CHECK (tipo_notificacion IN (
   'SITUACION_URGENTE','SITUACION_ASIGNADA','ACLARACION_RESPONDIDA','CASO_ASIGNADO','ALERTA_GENERADA',
   'VENCIMIENTO','CORREO_FALLIDO','DOCUMENTO_PROCESADO')),
  CONSTRAINT notificacion_recurso_valido CHECK (tipo_recurso IS NULL OR tipo_recurso IN (
   'situaciones','aclaraciones_situacion','casos','alertas','actuaciones','compromisos','estados_pasos_protocolo_caso',
   'acciones_plan_intervencion','actividades_plan_gestion','comunicaciones','versiones_documento'))
);

CREATE TABLE convi.procesos_importacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  archivo_id uuid NOT NULL,
  tipo_importacion varchar(40) NOT NULL,
  estado varchar(30) NOT NULL DEFAULT 'CARGADO' CHECK (estado IN ('CARGADO','PROCESANDO','REVISION','CONFIRMADO','FALLIDO','CANCELADO')),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  confirmado_en timestamptz,
  UNIQUE (establecimiento_id, id),
  mapeo_columnas jsonb NOT NULL DEFAULT '{}'::jsonb,
  opciones_importacion jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- HU-020 el proceso confirmado tiene fecha y cada fila confirmada guarda lo que creó o reutilizó
  CONSTRAINT importacion_confirmada_fecha CHECK ((estado='CONFIRMADO')=(confirmado_en IS NOT NULL))
);

CREATE TABLE convi.filas_importacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  proceso_importacion_id uuid NOT NULL,
  numero_fila integer NOT NULL CHECK (numero_fila > 0),
  datos_originales jsonb NOT NULL,
  datos_normalizados jsonb,
  estado varchar(30) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','VALIDO','ADVERTENCIA','ERROR','CONFIRMADO','OMITIDO')),
  problemas jsonb,
  entidad_confirmada_id uuid,
  UNIQUE (proceso_importacion_id, numero_fila),
  UNIQUE (establecimiento_id, id),
  entidades_confirmadas jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT fila_confirmada_entidades CHECK (estado<>'CONFIRMADO' OR entidades_confirmadas<>'{}'::jsonb)
);

CREATE TABLE convi.eventos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  membresia_actor_id uuid,
  codigo_accion varchar(80) NOT NULL,
  tipo_recurso varchar(60) NOT NULL,
  recurso_id uuid,
  codigo_resultado varchar(20) NOT NULL,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  solicitud_id uuid,
  metadatos jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (establecimiento_id, id)
);

CREATE TABLE convi.registros_solicitudes_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  membresia_id uuid NOT NULL,
  caso_id uuid,
  codigo_proposito varchar(50) NOT NULL,
  nombre_modelo varchar(120),
  iniciado_en timestamptz NOT NULL DEFAULT now(),
  completado_en timestamptz,
  estado varchar(20) NOT NULL DEFAULT 'INICIADA' CHECK (estado IN ('INICIADA','COMPLETADO','FALLIDO','CANCELADO')),
  cantidad_fuentes integer NOT NULL DEFAULT 0 CHECK (cantidad_fuentes >= 0),
  cantidad_herramientas integer NOT NULL DEFAULT 0 CHECK (cantidad_herramientas >= 0),
  latencia_ms integer CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
  resumen_sin_datos_sensibles text,
  UNIQUE (establecimiento_id, id),
  -- Contexto de cada solicitud a la IA
  alerta_id uuid,
  contexto_explicacion jsonb,
  CONSTRAINT solicitud_ia_proposito_valido CHECK (codigo_proposito IN (
   'CONSULTA_REGLAMENTO','SINTESIS_CASO','PREPARAR_ENCUENTRO','BORRADOR_CORREO','PROPUESTA_PROTOCOLO','EXPLICACION_ALERTA','COMPARACION_PERIODOS','BORRADOR_ACTA','BORRADOR_INFORME')),
  CONSTRAINT solicitud_ia_alerta CHECK (codigo_proposito<>'EXPLICACION_ALERTA' OR alerta_id IS NOT NULL),
  CONSTRAINT solicitud_ia_contexto CHECK (codigo_proposito NOT IN ('EXPLICACION_ALERTA','COMPARACION_PERIODOS') OR (contexto_explicacion IS NOT NULL AND contexto_explicacion<>'{}'::jsonb))
);

CREATE TABLE convi.aclaraciones_situacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  situacion_id uuid NOT NULL,
  solicitado_por uuid NOT NULL,
  profesor_destinatario_id uuid NOT NULL,
  pregunta text NOT NULL CHECK (length(trim(pregunta))>0),
  solicitado_en timestamptz NOT NULL DEFAULT now(),
  respuesta text,
  respondido_por uuid,
  respondido_en timestamptz,
  estado varchar(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','RESPONDIDA')),
  UNIQUE (establecimiento_id,id),
  CHECK ((estado='PENDIENTE' AND respuesta IS NULL AND respondido_por IS NULL AND respondido_en IS NULL) OR (estado='RESPONDIDA' AND respuesta IS NOT NULL AND length(trim(respuesta))>0 AND respondido_por IS NOT NULL AND respondido_en IS NOT NULL))
);
CREATE TABLE convi.cursos_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  actividad_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  UNIQUE (establecimiento_id,id),
  UNIQUE (actividad_id,curso_id)
);
CREATE TABLE convi.profesionales_actividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  actividad_id uuid NOT NULL,
  membresia_id uuid NOT NULL,
  funcion varchar(120) NOT NULL,
  UNIQUE (establecimiento_id,id),
  UNIQUE (actividad_id,membresia_id)
);
CREATE TABLE convi.informes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  titulo varchar(220) NOT NULL,
  periodo_desde date NOT NULL,
  periodo_hasta date NOT NULL,
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  definiciones_calculo jsonb NOT NULL DEFAULT '{}'::jsonb,
  archivo_id uuid,
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADO')),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  publicado_en timestamptz,
  informe_anterior_id uuid,
  UNIQUE (establecimiento_id,id),
  CHECK (periodo_hasta >= periodo_desde),
  CHECK (estado <> 'PUBLICADO' OR (archivo_id IS NOT NULL AND publicado_en IS NOT NULL))
);

ALTER TABLE convi.anios_academicos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.personas ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.estudiantes ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.estudiantes ADD FOREIGN KEY (establecimiento_id, persona_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.estudiantes (persona_id);

ALTER TABLE convi.membresias_establecimiento ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.membresias_establecimiento ADD FOREIGN KEY (establecimiento_id, persona_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.membresias_establecimiento (persona_id);

ALTER TABLE convi.membresias_establecimiento ADD FOREIGN KEY (establecimiento_id, invitado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.membresias_establecimiento (invitado_por);

ALTER TABLE convi.membresias_establecimiento ADD FOREIGN KEY (auth_usuario_id) REFERENCES auth.users (id) ON DELETE RESTRICT;

CREATE INDEX ON convi.membresias_establecimiento (auth_usuario_id);

ALTER TABLE convi.cursos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.cursos ADD FOREIGN KEY (establecimiento_id, anio_academico_id) REFERENCES convi.anios_academicos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.cursos (anio_academico_id);

ALTER TABLE convi.asignaciones_docentes ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.asignaciones_docentes ADD FOREIGN KEY (establecimiento_id, curso_id) REFERENCES convi.cursos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.asignaciones_docentes (curso_id);

ALTER TABLE convi.asignaciones_docentes ADD FOREIGN KEY (establecimiento_id, membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.asignaciones_docentes (membresia_id);

ALTER TABLE convi.matriculas ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.matriculas ADD FOREIGN KEY (establecimiento_id, estudiante_id) REFERENCES convi.estudiantes (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.matriculas (estudiante_id);

ALTER TABLE convi.matriculas ADD FOREIGN KEY (establecimiento_id, curso_id) REFERENCES convi.cursos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.matriculas (curso_id);

ALTER TABLE convi.matriculas ADD FOREIGN KEY (establecimiento_id, anio_academico_id) REFERENCES convi.anios_academicos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.matriculas (anio_academico_id);

ALTER TABLE convi.apoderados_estudiante ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.apoderados_estudiante ADD FOREIGN KEY (establecimiento_id, estudiante_id) REFERENCES convi.estudiantes (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.apoderados_estudiante (estudiante_id);

ALTER TABLE convi.apoderados_estudiante ADD FOREIGN KEY (establecimiento_id, persona_apoderado_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.apoderados_estudiante (persona_apoderado_id);

ALTER TABLE convi.accesos_apoderado ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.accesos_apoderado ADD FOREIGN KEY (establecimiento_id, apoderado_estudiante_id) REFERENCES convi.apoderados_estudiante (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.accesos_apoderado (apoderado_estudiante_id);

ALTER TABLE convi.accesos_apoderado ADD FOREIGN KEY (establecimiento_id, membresia_apoderado_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.accesos_apoderado (membresia_apoderado_id);

ALTER TABLE convi.accesos_apoderado ADD FOREIGN KEY (establecimiento_id, otorgado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.accesos_apoderado (otorgado_por);

ALTER TABLE convi.accesos_apoderado ADD FOREIGN KEY (establecimiento_id, revocado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.accesos_apoderado (revocado_por);

ALTER TABLE convi.categorias_convivencia ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.casos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.casos ADD FOREIGN KEY (establecimiento_id, categoria_principal_id) REFERENCES convi.categorias_convivencia (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.casos (categoria_principal_id);

ALTER TABLE convi.casos ADD FOREIGN KEY (establecimiento_id, asignado_a_membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.casos (asignado_a_membresia_id);

ALTER TABLE convi.casos ADD FOREIGN KEY (establecimiento_id, abierto_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.casos (abierto_por);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, reportado_por_membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (reportado_por_membresia_id);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, curso_contexto_id) REFERENCES convi.cursos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (curso_contexto_id);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, persona_origen_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (persona_origen_id);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, categoria_id) REFERENCES convi.categorias_convivencia (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (categoria_id);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (caso_id);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, vinculado_a_caso_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (vinculado_a_caso_por);

ALTER TABLE convi.situaciones ADD FOREIGN KEY (establecimiento_id, asignado_a_membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones (asignado_a_membresia_id);

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id, persona_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.participaciones (persona_id);

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id, situacion_id) REFERENCES convi.situaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.participaciones (situacion_id);

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.participaciones (caso_id);

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id, actuacion_id) REFERENCES convi.actuaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.participaciones (actuacion_id);

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id, situacion_id) REFERENCES convi.situaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_convivencia (situacion_id);

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_convivencia (caso_id);

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id, caso_destino_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_convivencia (caso_destino_id);

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id, version_protocolo_seleccionada_id) REFERENCES convi.versiones_protocolo (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_convivencia (version_protocolo_seleccionada_id);

ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id, revisado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_convivencia (revisado_por);

ALTER TABLE convi.historial_estados_caso ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.historial_estados_caso ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.historial_estados_caso (caso_id);

ALTER TABLE convi.historial_estados_caso ADD FOREIGN KEY (establecimiento_id, cambiado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.historial_estados_caso (cambiado_por);

ALTER TABLE convi.historial_estados_caso ADD FOREIGN KEY (establecimiento_id, evidencia_cierre_id) REFERENCES convi.evidencias (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.historial_estados_caso (evidencia_cierre_id);

ALTER TABLE convi.archivos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.archivos ADD FOREIGN KEY (establecimiento_id, subido_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.archivos (subido_por);

ALTER TABLE convi.documentos_institucionales ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.versiones_documento ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.versiones_documento ADD FOREIGN KEY (establecimiento_id, documento_id) REFERENCES convi.documentos_institucionales (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_documento (documento_id);

ALTER TABLE convi.versiones_documento ADD FOREIGN KEY (establecimiento_id, archivo_id) REFERENCES convi.archivos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_documento (archivo_id);

ALTER TABLE convi.versiones_documento ADD FOREIGN KEY (establecimiento_id, subido_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_documento (subido_por);

ALTER TABLE convi.fragmentos_rag ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.fragmentos_rag ADD FOREIGN KEY (establecimiento_id, version_documento_id) REFERENCES convi.versiones_documento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.fragmentos_rag (version_documento_id);

ALTER TABLE convi.protocolos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.versiones_protocolo ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.versiones_protocolo ADD FOREIGN KEY (establecimiento_id, protocolo_id) REFERENCES convi.protocolos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_protocolo (protocolo_id);

ALTER TABLE convi.versiones_protocolo ADD FOREIGN KEY (establecimiento_id, version_documento_origen_id) REFERENCES convi.versiones_documento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_protocolo (version_documento_origen_id);

ALTER TABLE convi.versiones_protocolo ADD FOREIGN KEY (establecimiento_id, revisado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.versiones_protocolo (revisado_por);

ALTER TABLE convi.pasos_protocolo ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.pasos_protocolo ADD FOREIGN KEY (establecimiento_id, version_protocolo_id) REFERENCES convi.versiones_protocolo (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.pasos_protocolo (version_protocolo_id);

ALTER TABLE convi.protocolos_caso ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.protocolos_caso ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.protocolos_caso (caso_id);

ALTER TABLE convi.protocolos_caso ADD FOREIGN KEY (establecimiento_id, version_protocolo_id) REFERENCES convi.versiones_protocolo (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.protocolos_caso (version_protocolo_id);

ALTER TABLE convi.protocolos_caso ADD FOREIGN KEY (establecimiento_id, aplicado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.protocolos_caso (aplicado_por);

ALTER TABLE convi.estados_pasos_protocolo_caso ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.estados_pasos_protocolo_caso ADD FOREIGN KEY (establecimiento_id, protocolo_caso_id) REFERENCES convi.protocolos_caso (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.estados_pasos_protocolo_caso (protocolo_caso_id);

ALTER TABLE convi.estados_pasos_protocolo_caso ADD FOREIGN KEY (establecimiento_id, paso_protocolo_id) REFERENCES convi.pasos_protocolo (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.estados_pasos_protocolo_caso (paso_protocolo_id);

ALTER TABLE convi.estados_pasos_protocolo_caso ADD FOREIGN KEY (establecimiento_id, completado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.estados_pasos_protocolo_caso (completado_por);

ALTER TABLE convi.referencias_revision_normativa ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.referencias_revision_normativa ADD FOREIGN KEY (establecimiento_id, version_documento_id) REFERENCES convi.versiones_documento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.referencias_revision_normativa (version_documento_id);

ALTER TABLE convi.referencias_revision_normativa ADD FOREIGN KEY (establecimiento_id, revision_id) REFERENCES convi.revisiones_convivencia (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.referencias_revision_normativa (revision_id);

ALTER TABLE convi.planes_intervencion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.planes_intervencion ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.planes_intervencion (caso_id);

ALTER TABLE convi.planes_intervencion ADD FOREIGN KEY (establecimiento_id, protocolo_caso_id) REFERENCES convi.protocolos_caso (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.planes_intervencion (protocolo_caso_id);

ALTER TABLE convi.planes_intervencion ADD FOREIGN KEY (establecimiento_id, creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.planes_intervencion (creado_por);

ALTER TABLE convi.acciones_plan_intervencion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.acciones_plan_intervencion ADD FOREIGN KEY (establecimiento_id, plan_intervencion_id) REFERENCES convi.planes_intervencion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.acciones_plan_intervencion (plan_intervencion_id);

ALTER TABLE convi.acciones_plan_intervencion ADD FOREIGN KEY (establecimiento_id, persona_responsable_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.acciones_plan_intervencion (persona_responsable_id);

ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.actuaciones (caso_id);

ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id, accion_plan_id) REFERENCES convi.acciones_plan_intervencion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.actuaciones (accion_plan_id);

ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id, membresia_responsable_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.actuaciones (membresia_responsable_id);

ALTER TABLE convi.compromisos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.compromisos ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.compromisos (caso_id);

ALTER TABLE convi.compromisos ADD FOREIGN KEY (establecimiento_id, persona_responsable_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.compromisos (persona_responsable_id);

ALTER TABLE convi.compromisos ADD FOREIGN KEY (establecimiento_id, actuacion_origen_id) REFERENCES convi.actuaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.compromisos (actuacion_origen_id);

ALTER TABLE convi.revisiones_compromisos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.revisiones_compromisos ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_compromisos (caso_id);

ALTER TABLE convi.revisiones_compromisos ADD FOREIGN KEY (establecimiento_id, compromiso_id) REFERENCES convi.compromisos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_compromisos (compromiso_id);

ALTER TABLE convi.revisiones_compromisos ADD FOREIGN KEY (establecimiento_id, actuacion_id) REFERENCES convi.actuaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.revisiones_compromisos (actuacion_id);

ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.comunicaciones (caso_id);

ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id, persona_destinataria_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.comunicaciones (persona_destinataria_id);

ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id, creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.comunicaciones (creado_por);

ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id, archivo_respaldo_id) REFERENCES convi.archivos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.comunicaciones (archivo_respaldo_id);

ALTER TABLE convi.reglas ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.reglas ADD FOREIGN KEY (establecimiento_id, categoria_id) REFERENCES convi.categorias_convivencia (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.reglas (categoria_id);

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id, regla_id) REFERENCES convi.reglas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.alertas (regla_id);

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id, estudiante_id) REFERENCES convi.estudiantes (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.alertas (estudiante_id);

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id, curso_id) REFERENCES convi.cursos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.alertas (curso_id);

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.alertas (caso_id);

ALTER TABLE convi.alertas ADD FOREIGN KEY (establecimiento_id, revisado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.alertas (revisado_por);

ALTER TABLE convi.situaciones_alerta ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.situaciones_alerta ADD FOREIGN KEY (establecimiento_id, alerta_id) REFERENCES convi.alertas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones_alerta (alerta_id);

ALTER TABLE convi.situaciones_alerta ADD FOREIGN KEY (establecimiento_id, situacion_id) REFERENCES convi.situaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.situaciones_alerta (situacion_id);

ALTER TABLE convi.planes_gestion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.planes_gestion ADD FOREIGN KEY (establecimiento_id, anio_academico_id) REFERENCES convi.anios_academicos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.planes_gestion (anio_academico_id);

ALTER TABLE convi.planes_gestion ADD FOREIGN KEY (establecimiento_id, creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.planes_gestion (creado_por);

ALTER TABLE convi.objetivos_plan_gestion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.objetivos_plan_gestion ADD FOREIGN KEY (establecimiento_id, plan_gestion_id) REFERENCES convi.planes_gestion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.objetivos_plan_gestion (plan_gestion_id);

ALTER TABLE convi.acciones_plan_gestion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.acciones_plan_gestion ADD FOREIGN KEY (establecimiento_id, objetivo_id) REFERENCES convi.objetivos_plan_gestion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.acciones_plan_gestion (objetivo_id);

ALTER TABLE convi.acciones_plan_gestion ADD FOREIGN KEY (establecimiento_id, persona_responsable_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.acciones_plan_gestion (persona_responsable_id);

ALTER TABLE convi.actividades_plan_gestion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.actividades_plan_gestion ADD FOREIGN KEY (establecimiento_id, accion_plan_id) REFERENCES convi.acciones_plan_gestion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.actividades_plan_gestion (accion_plan_id);

ALTER TABLE convi.actividades_plan_gestion ADD FOREIGN KEY (establecimiento_id, persona_responsable_id) REFERENCES convi.personas (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.actividades_plan_gestion (persona_responsable_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, archivo_id) REFERENCES convi.archivos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (archivo_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, situacion_id) REFERENCES convi.situaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (situacion_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (caso_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, compromiso_id) REFERENCES convi.compromisos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (compromiso_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, accion_plan_id) REFERENCES convi.acciones_plan_gestion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (accion_plan_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, actividad_plan_id) REFERENCES convi.actividades_plan_gestion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (actividad_plan_id);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (creado_por);

ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id, actuacion_id) REFERENCES convi.actuaciones (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.evidencias (actuacion_id);

ALTER TABLE convi.notificaciones ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.notificaciones ADD FOREIGN KEY (establecimiento_id, membresia_destinatario_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.notificaciones (membresia_destinatario_id);

ALTER TABLE convi.procesos_importacion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.procesos_importacion ADD FOREIGN KEY (establecimiento_id, archivo_id) REFERENCES convi.archivos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.procesos_importacion (archivo_id);

ALTER TABLE convi.procesos_importacion ADD FOREIGN KEY (establecimiento_id, creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.procesos_importacion (creado_por);

ALTER TABLE convi.filas_importacion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.filas_importacion ADD FOREIGN KEY (establecimiento_id, proceso_importacion_id) REFERENCES convi.procesos_importacion (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.filas_importacion (proceso_importacion_id);

ALTER TABLE convi.eventos_auditoria ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.eventos_auditoria ADD FOREIGN KEY (establecimiento_id, membresia_actor_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.eventos_auditoria (membresia_actor_id);

ALTER TABLE convi.registros_solicitudes_ia ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos (id) ON DELETE RESTRICT;

ALTER TABLE convi.registros_solicitudes_ia ADD FOREIGN KEY (establecimiento_id, membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.registros_solicitudes_ia (membresia_id);

ALTER TABLE convi.registros_solicitudes_ia ADD FOREIGN KEY (establecimiento_id, caso_id) REFERENCES convi.casos (establecimiento_id, id) ON DELETE RESTRICT;

CREATE INDEX ON convi.registros_solicitudes_ia (caso_id);

CREATE UNIQUE INDEX ON convi.personas (establecimiento_id, rut) WHERE rut IS NOT NULL;

CREATE UNIQUE INDEX ON convi.membresias_establecimiento (establecimiento_id, lower(correo_invitacion));

CREATE UNIQUE INDEX ON convi.matriculas (establecimiento_id, estudiante_id, anio_academico_id) WHERE finalizado_en IS NULL;

CREATE UNIQUE INDEX ON convi.asignaciones_docentes (curso_id, membresia_id, rol_asignacion) WHERE fecha_fin IS NULL;

CREATE UNIQUE INDEX ON convi.participaciones (situacion_id, persona_id, rol_contextual) WHERE situacion_id IS NOT NULL AND activo_hasta IS NULL;

CREATE UNIQUE INDEX ON convi.participaciones (caso_id, persona_id, rol_contextual) WHERE caso_id IS NOT NULL AND activo_hasta IS NULL;

CREATE UNIQUE INDEX ON convi.participaciones (actuacion_id, persona_id, rol_contextual) WHERE actuacion_id IS NOT NULL AND activo_hasta IS NULL;

ALTER TABLE convi.establecimientos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.establecimientos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.anios_academicos (establecimiento_id);

ALTER TABLE convi.anios_academicos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.anios_academicos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.personas (establecimiento_id);

ALTER TABLE convi.personas ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.personas FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.estudiantes (establecimiento_id);

ALTER TABLE convi.estudiantes ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.estudiantes FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.membresias_establecimiento (establecimiento_id);

ALTER TABLE convi.membresias_establecimiento ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.membresias_establecimiento FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.cursos (establecimiento_id);

ALTER TABLE convi.cursos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.cursos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.asignaciones_docentes (establecimiento_id);

ALTER TABLE convi.asignaciones_docentes ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.asignaciones_docentes FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.matriculas (establecimiento_id);

ALTER TABLE convi.matriculas ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.matriculas FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.apoderados_estudiante (establecimiento_id);

ALTER TABLE convi.apoderados_estudiante ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.apoderados_estudiante FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.accesos_apoderado (establecimiento_id);

ALTER TABLE convi.accesos_apoderado ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.accesos_apoderado FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.categorias_convivencia (establecimiento_id);

ALTER TABLE convi.categorias_convivencia ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.categorias_convivencia FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.casos (establecimiento_id);

ALTER TABLE convi.casos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.casos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.situaciones (establecimiento_id);

ALTER TABLE convi.situaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.situaciones FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.participaciones (establecimiento_id);

ALTER TABLE convi.participaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.participaciones FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.revisiones_convivencia (establecimiento_id);

ALTER TABLE convi.revisiones_convivencia ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.revisiones_convivencia FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.historial_estados_caso (establecimiento_id);

ALTER TABLE convi.historial_estados_caso ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.historial_estados_caso FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.archivos (establecimiento_id);

ALTER TABLE convi.archivos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.archivos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.documentos_institucionales (establecimiento_id);

ALTER TABLE convi.documentos_institucionales ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.documentos_institucionales FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.versiones_documento (establecimiento_id);

ALTER TABLE convi.versiones_documento ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.versiones_documento FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.fragmentos_rag (establecimiento_id);

ALTER TABLE convi.fragmentos_rag ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.fragmentos_rag FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.protocolos (establecimiento_id);

ALTER TABLE convi.protocolos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.protocolos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.versiones_protocolo (establecimiento_id);

ALTER TABLE convi.versiones_protocolo ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.versiones_protocolo FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.pasos_protocolo (establecimiento_id);

ALTER TABLE convi.pasos_protocolo ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.pasos_protocolo FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.protocolos_caso (establecimiento_id);

ALTER TABLE convi.protocolos_caso ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.protocolos_caso FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.estados_pasos_protocolo_caso (establecimiento_id);

ALTER TABLE convi.estados_pasos_protocolo_caso ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.estados_pasos_protocolo_caso FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.referencias_revision_normativa (establecimiento_id);

ALTER TABLE convi.referencias_revision_normativa ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.referencias_revision_normativa FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.planes_intervencion (establecimiento_id);

ALTER TABLE convi.planes_intervencion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.planes_intervencion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.acciones_plan_intervencion (establecimiento_id);

ALTER TABLE convi.acciones_plan_intervencion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.acciones_plan_intervencion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.actuaciones (establecimiento_id);

ALTER TABLE convi.actuaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.actuaciones FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.compromisos (establecimiento_id);

ALTER TABLE convi.compromisos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.compromisos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.revisiones_compromisos (establecimiento_id);

ALTER TABLE convi.revisiones_compromisos ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.revisiones_compromisos FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.comunicaciones (establecimiento_id);

ALTER TABLE convi.comunicaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.comunicaciones FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.reglas (establecimiento_id);

ALTER TABLE convi.reglas ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.reglas FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.alertas (establecimiento_id);

ALTER TABLE convi.alertas ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.alertas FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.situaciones_alerta (establecimiento_id);

ALTER TABLE convi.situaciones_alerta ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.situaciones_alerta FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.planes_gestion (establecimiento_id);

ALTER TABLE convi.planes_gestion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.planes_gestion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.objetivos_plan_gestion (establecimiento_id);

ALTER TABLE convi.objetivos_plan_gestion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.objetivos_plan_gestion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.acciones_plan_gestion (establecimiento_id);

ALTER TABLE convi.acciones_plan_gestion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.acciones_plan_gestion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.actividades_plan_gestion (establecimiento_id);

ALTER TABLE convi.actividades_plan_gestion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.actividades_plan_gestion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.evidencias (establecimiento_id);

ALTER TABLE convi.evidencias ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.evidencias FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.notificaciones (establecimiento_id);

ALTER TABLE convi.notificaciones ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.notificaciones FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.procesos_importacion (establecimiento_id);

ALTER TABLE convi.procesos_importacion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.procesos_importacion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.filas_importacion (establecimiento_id);

ALTER TABLE convi.filas_importacion ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.filas_importacion FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.eventos_auditoria (establecimiento_id);

ALTER TABLE convi.eventos_auditoria ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.eventos_auditoria FORCE ROW LEVEL SECURITY;

CREATE INDEX ON convi.registros_solicitudes_ia (establecimiento_id);

ALTER TABLE convi.registros_solicitudes_ia ENABLE ROW LEVEL SECURITY;

ALTER TABLE convi.registros_solicitudes_ia FORCE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA convi FROM PUBLIC, anon, authenticated;

ALTER TABLE convi.participaciones ADD FOREIGN KEY (establecimiento_id,matricula_contexto_id) REFERENCES convi.matriculas (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id,situacion_duplicada_id) REFERENCES convi.situaciones (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.revisiones_convivencia ADD FOREIGN KEY (establecimiento_id,revision_anterior_id) REFERENCES convi.revisiones_convivencia (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.compromisos ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.revisiones_compromisos ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.actividades_plan_gestion ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.actuaciones ADD FOREIGN KEY (establecimiento_id,seguimiento_anterior_id) REFERENCES convi.actuaciones (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.versiones_protocolo ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.estados_pasos_protocolo_caso ADD FOREIGN KEY (establecimiento_id,responsable_id) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.comunicaciones ADD FOREIGN KEY (establecimiento_id,confirmado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id,paso_caso_id) REFERENCES convi.estados_pasos_protocolo_caso (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id,rectifica_evidencia_id) REFERENCES convi.evidencias (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ADD FOREIGN KEY (establecimiento_id,situacion_id) REFERENCES convi.situaciones (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ADD FOREIGN KEY (establecimiento_id,solicitado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ADD FOREIGN KEY (establecimiento_id,profesor_destinatario_id) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ADD FOREIGN KEY (establecimiento_id,respondido_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.aclaraciones_situacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.aclaraciones_situacion FORCE ROW LEVEL SECURITY;
ALTER TABLE convi.cursos_actividad ADD FOREIGN KEY (establecimiento_id,actividad_id) REFERENCES convi.actividades_plan_gestion (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.cursos_actividad ADD FOREIGN KEY (establecimiento_id,curso_id) REFERENCES convi.cursos (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.cursos_actividad ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.cursos_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.cursos_actividad FORCE ROW LEVEL SECURITY;
ALTER TABLE convi.profesionales_actividad ADD FOREIGN KEY (establecimiento_id,actividad_id) REFERENCES convi.actividades_plan_gestion (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.profesionales_actividad ADD FOREIGN KEY (establecimiento_id,membresia_id) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.profesionales_actividad ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.profesionales_actividad ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.profesionales_actividad FORCE ROW LEVEL SECURITY;
ALTER TABLE convi.informes ADD FOREIGN KEY (establecimiento_id,archivo_id) REFERENCES convi.archivos (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.informes ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.informes ADD FOREIGN KEY (establecimiento_id,informe_anterior_id) REFERENCES convi.informes (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.informes ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.informes ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.informes FORCE ROW LEVEL SECURITY;
ALTER TABLE convi.evidencias ADD FOREIGN KEY (establecimiento_id,aclaracion_id) REFERENCES convi.aclaraciones_situacion (establecimiento_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX alerta_unica ON convi.alertas (establecimiento_id,clave_evento);
CREATE UNIQUE INDEX notificacion_unica ON convi.notificaciones (membresia_destinatario_id,clave_evento) WHERE clave_evento IS NOT NULL;
CREATE TABLE convi.borradores_documentales_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establecimiento_id uuid NOT NULL,
  tipo_borrador varchar(20) NOT NULL CHECK (tipo_borrador IN ('ACTA','INFORME')),
  caso_id uuid,
  actuacion_id uuid,
  informe_id uuid,
  solicitud_ia_id uuid NOT NULL,
  titulo varchar(220) NOT NULL CHECK (length(trim(titulo)) > 0),
  contenido text NOT NULL CHECK (length(trim(contenido)) > 0),
  estado varchar(20) NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','REVISADO','DESCARTADO')),
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid,
  revisado_en timestamptz,
  borrador_anterior_id uuid,
  CHECK (num_nonnulls(caso_id,informe_id)=1),
  CHECK (tipo_borrador <> 'ACTA' OR (caso_id IS NOT NULL AND informe_id IS NULL)),
  CHECK (actuacion_id IS NULL OR caso_id IS NOT NULL),
  CHECK ((estado='BORRADOR' AND revisado_por IS NULL AND revisado_en IS NULL) OR (estado<>'BORRADOR' AND revisado_por IS NOT NULL AND revisado_en IS NOT NULL)),
  CHECK (borrador_anterior_id IS NULL OR borrador_anterior_id<>id),
  UNIQUE (establecimiento_id,id)
);

ALTER TABLE convi.niveles_educativos ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.cursos ADD FOREIGN KEY (establecimiento_id,nivel_id) REFERENCES convi.niveles_educativos(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id) REFERENCES convi.establecimientos(id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,caso_id) REFERENCES convi.casos(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,actuacion_id) REFERENCES convi.actuaciones(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,informe_id) REFERENCES convi.informes(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,solicitud_ia_id) REFERENCES convi.registros_solicitudes_ia(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,creado_por) REFERENCES convi.membresias_establecimiento(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,revisado_por) REFERENCES convi.membresias_establecimiento(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.borradores_documentales_ia ADD FOREIGN KEY (establecimiento_id,borrador_anterior_id) REFERENCES convi.borradores_documentales_ia(establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.niveles_educativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.niveles_educativos FORCE ROW LEVEL SECURITY;
ALTER TABLE convi.borradores_documentales_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE convi.borradores_documentales_ia FORCE ROW LEVEL SECURITY;
CREATE INDEX cursos_nivel ON convi.cursos (establecimiento_id,nivel_id);
CREATE INDEX borradores_contexto ON convi.borradores_documentales_ia (establecimiento_id,caso_id,creado_en);
CREATE INDEX situaciones_ocurrencia ON convi.situaciones (establecimiento_id,ocurrido_en);
CREATE INDEX situaciones_reporte ON convi.situaciones (establecimiento_id,reportado_en);
CREATE INDEX casos_inicio ON convi.casos (establecimiento_id,fecha_inicio);
CREATE INDEX casos_apertura ON convi.casos (establecimiento_id,abierto_en);
CREATE INDEX casos_cierre ON convi.casos (establecimiento_id,cerrado_en) WHERE cerrado_en IS NOT NULL;
CREATE INDEX historial_fecha ON convi.historial_estados_caso (establecimiento_id,cambiado_en);
CREATE INDEX actuaciones_realizacion ON convi.actuaciones (establecimiento_id,realizado_en);
CREATE INDEX compromisos_vencimiento ON convi.compromisos (establecimiento_id,vence_en);
CREATE INDEX archivos_hash ON convi.archivos (establecimiento_id,sha256);
ALTER TABLE convi.planes_gestion ADD FOREIGN KEY (establecimiento_id,aprobado_por) REFERENCES convi.membresias_establecimiento (establecimiento_id,id) ON DELETE RESTRICT;
ALTER TABLE convi.registros_solicitudes_ia ADD FOREIGN KEY (establecimiento_id,alerta_id) REFERENCES convi.alertas (establecimiento_id,id) ON DELETE RESTRICT;
CREATE INDEX ON convi.planes_gestion (aprobado_por);
CREATE INDEX ON convi.registros_solicitudes_ia (alerta_id);
-- Cuentas: una identidad de Supabase Auth es una sola cuenta de CONVI (otro perfil u otra escuela usan otro correo)
-- HU-004 entra al portal de su único perfil, HU-002 reintentar no crea otra escuela, HU-003 una cuenta activada no se vincula a otra identidad
CREATE UNIQUE INDEX membresia_identidad_unica ON convi.membresias_establecimiento (auth_usuario_id) WHERE auth_usuario_id IS NOT NULL;
CREATE UNIQUE INDEX seguimiento_siguiente_unico ON convi.actuaciones (seguimiento_anterior_id) WHERE seguimiento_anterior_id IS NOT NULL;

-- ===== 2. Integridad e historia =====

CREATE FUNCTION convi.solo_insertar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro histórico inmutable, incorporar una nueva entrada'; END $$;
CREATE FUNCTION convi.validar_relaciones() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE a record; b record; c record;
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(NEW)->>'establecimiento_id' IS DISTINCT FROM to_jsonb(OLD)->>'establecimiento_id' THEN
 RAISE EXCEPTION 'No se permite trasladar un registro entre establecimientos'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('actuaciones','compromisos','planes_intervencion','protocolos_caso','comunicaciones') AND to_jsonb(NEW)->>'caso_id' IS DISTINCT FROM to_jsonb(OLD)->>'caso_id' THEN RAISE EXCEPTION 'No trasladar una actuación o relación histórica a otro caso'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='membresias_establecimiento' AND ((to_jsonb(NEW)->>'persona_id',to_jsonb(NEW)->>'auth_usuario_id') IS DISTINCT FROM (to_jsonb(OLD)->>'persona_id',to_jsonb(OLD)->>'auth_usuario_id')) AND to_jsonb(OLD)->>'auth_usuario_id' IS NOT NULL THEN RAISE EXCEPTION 'Una membresía activada no cambia de persona o identidad'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='apoderados_estudiante' AND (to_jsonb(NEW)->>'persona_apoderado_id',to_jsonb(NEW)->>'estudiante_id') IS DISTINCT FROM (to_jsonb(OLD)->>'persona_apoderado_id',to_jsonb(OLD)->>'estudiante_id') THEN RAISE EXCEPTION 'Crear otra relación de apoderado'; END IF;
 IF TG_TABLE_NAME='matriculas' THEN
 SELECT * INTO a FROM cursos WHERE id=NEW.curso_id;
 IF a.anio_academico_id<>NEW.anio_academico_id THEN RAISE EXCEPTION 'El curso no pertenece al año'; END IF;
 IF EXISTS(SELECT 1 FROM matriculas m WHERE m.estudiante_id=NEW.estudiante_id AND m.id<>NEW.id AND daterange(m.matriculado_en, m.finalizado_en,'[]') && daterange(NEW.matriculado_en,NEW.finalizado_en,'[]')) THEN RAISE EXCEPTION 'Matrículas con períodos superpuestos'; END IF;
 ELSIF TG_TABLE_NAME='accesos_apoderado' THEN
 SELECT * INTO a FROM apoderados_estudiante WHERE id=NEW.apoderado_estudiante_id;
 SELECT * INTO b FROM membresias_establecimiento WHERE id=NEW.membresia_apoderado_id;
 IF a.persona_apoderado_id<>b.persona_id OR b.codigo_perfil<>'APODERADO' THEN RAISE EXCEPTION 'Permiso asignado a otra persona o perfil'; END IF;
 IF NEW.estado='ACTIVO' AND (NEW.expira_en IS NULL OR NEW.expira_en<=NEW.otorgado_en) THEN RAISE EXCEPTION 'El permiso activo requiere vencimiento posterior al otorgamiento'; END IF;
 ELSIF TG_TABLE_NAME='asignaciones_docentes' THEN
 IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.membresia_id AND codigo_perfil='PROFESOR') THEN RAISE EXCEPTION 'La asignación requiere un profesor'; END IF;
 ELSIF TG_TABLE_NAME='casos' THEN
 IF TG_OP='UPDATE' AND (NEW.estado_actual,NEW.cerrado_en) IS DISTINCT FROM (OLD.estado_actual,OLD.cerrado_en) AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Cambiar estado mediante historial_estados_caso'; END IF;
 IF TG_OP='INSERT' AND NEW.estado_actual<>'EN_ANALISIS' THEN RAISE EXCEPTION 'Un caso nuevo inicia en análisis'; END IF;
 ELSIF TG_TABLE_NAME='situaciones' THEN
 IF TG_OP='INSERT' AND NEW.estado<>'NUEVA' THEN RAISE EXCEPTION 'Una situación nueva inicia NUEVA'; END IF;
 IF TG_OP='UPDATE' AND (NEW.estado,NEW.caso_id) IS DISTINCT FROM (OLD.estado,OLD.caso_id) AND pg_trigger_depth()<2 AND (NEW.estado<>'EN_REVISION' OR NEW.caso_id IS DISTINCT FROM OLD.caso_id) THEN RAISE EXCEPTION 'Registrar el cambio mediante revisiones_convivencia'; END IF;
 SELECT * INTO a FROM membresias_establecimiento WHERE id=NEW.reportado_por_membresia_id;
 IF a.codigo_perfil NOT IN ('PROFESOR','CONVIVENCIA') THEN RAISE EXCEPTION 'Perfil no autorizado para reportar'; END IF;
 IF a.codigo_perfil='PROFESOR' AND NOT EXISTS (SELECT 1 FROM asignaciones_docentes x WHERE x.membresia_id=a.id AND x.curso_id=NEW.curso_contexto_id AND (x.fecha_inicio IS NULL OR x.fecha_inicio<=NEW.reportado_en::date) AND (x.fecha_fin IS NULL OR x.fecha_fin>=NEW.reportado_en::date)) THEN RAISE EXCEPTION 'Curso no asignado al profesor'; END IF;
 IF NEW.asignado_a_membresia_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.asignado_a_membresia_id AND codigo_perfil='CONVIVENCIA') THEN RAISE EXCEPTION 'La revisión requiere responsable de Convivencia'; END IF;
 IF TG_OP='UPDATE' AND (NEW.descripcion,NEW.ocurrido_en,NEW.reportado_en,NEW.reportado_por_membresia_id,NEW.curso_contexto_id) IS DISTINCT FROM (OLD.descripcion,OLD.ocurrido_en,OLD.reportado_en,OLD.reportado_por_membresia_id,OLD.curso_contexto_id) THEN RAISE EXCEPTION 'El reporte original se conserva, registrar aclaración o nueva revisión'; END IF;
 ELSIF TG_TABLE_NAME='planes_intervencion' THEN
 IF NEW.protocolo_caso_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM protocolos_caso WHERE id=NEW.protocolo_caso_id AND caso_id=NEW.caso_id) THEN RAISE EXCEPTION 'Protocolo de otro caso'; END IF;
 ELSIF TG_TABLE_NAME='actuaciones' THEN
 IF NEW.accion_plan_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM acciones_plan_intervencion x JOIN planes_intervencion p ON p.id=x.plan_intervencion_id WHERE x.id=NEW.accion_plan_id AND p.caso_id=NEW.caso_id) THEN RAISE EXCEPTION 'Acción de otro caso'; END IF;
 IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.membresia_responsable_id AND codigo_perfil='CONVIVENCIA') THEN RAISE EXCEPTION 'Responsable de actuación debe ser Convivencia'; END IF;
 ELSIF TG_TABLE_NAME='compromisos' THEN
 IF NEW.actuacion_origen_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM actuaciones WHERE id=NEW.actuacion_origen_id AND caso_id=NEW.caso_id) THEN RAISE EXCEPTION 'Actuación de otro caso'; END IF;
 ELSIF TG_TABLE_NAME='revisiones_compromisos' THEN
 IF NOT EXISTS(SELECT 1 FROM actuaciones WHERE id=NEW.actuacion_id AND caso_id=NEW.caso_id AND tipo_actuacion='SEGUIMIENTO' AND estado='REALIZADA') OR NOT EXISTS(SELECT 1 FROM compromisos WHERE id=NEW.compromiso_id AND caso_id=NEW.caso_id) THEN RAISE EXCEPTION 'Seguimiento realizado y compromiso deben pertenecer al mismo caso'; END IF;
 ELSIF TG_TABLE_NAME='estados_pasos_protocolo_caso' THEN
 SELECT * INTO a FROM protocolos_caso WHERE id=NEW.protocolo_caso_id;
 IF NOT EXISTS(SELECT 1 FROM pasos_protocolo WHERE id=NEW.paso_protocolo_id AND version_protocolo_id=a.version_protocolo_id) THEN RAISE EXCEPTION 'Paso de otra versión de protocolo'; END IF;
 ELSIF TG_TABLE_NAME='protocolos_caso' THEN
 IF NOT EXISTS(SELECT 1 FROM versiones_protocolo WHERE id=NEW.version_protocolo_id AND estado='PUBLICADO') THEN RAISE EXCEPTION 'Se aplica una versión publicada'; END IF;
 IF TG_OP='UPDATE' AND (NEW.caso_id,NEW.version_protocolo_id,NEW.aplicado_por,NEW.aplicado_en) IS DISTINCT FROM (OLD.caso_id,OLD.version_protocolo_id,OLD.aplicado_por,OLD.aplicado_en) THEN RAISE EXCEPTION 'La versión aplicada no se reemplaza'; END IF;
 ELSIF TG_TABLE_NAME='versiones_protocolo' THEN
 IF NEW.estado='PUBLICADO' AND (NEW.revisado_por IS NULL OR (NEW.version_documento_origen_id IS NULL AND nullif(trim(NEW.notas),'') IS NULL)) THEN RAISE EXCEPTION 'Publicación requiere revisor y fuente o procedencia'; END IF;
 ELSIF TG_TABLE_NAME='revisiones_convivencia' THEN
 IF nullif(trim(NEW.fundamento),'') IS NULL THEN RAISE EXCEPTION 'Indicar fundamento'; END IF;
 IF NEW.situacion_id IS NOT NULL THEN
 PERFORM 1 FROM situaciones WHERE id=NEW.situacion_id FOR UPDATE;
 IF NEW.revision_anterior_id IS DISTINCT FROM (SELECT id FROM revisiones_convivencia WHERE situacion_id=NEW.situacion_id ORDER BY revisado_en DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'La revisión cambió, recargar antes de decidir'; END IF; END IF;
 IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.revisado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'La decisión corresponde a Convivencia activa'; END IF;
 ELSIF TG_TABLE_NAME='historial_estados_caso' THEN
 SELECT * INTO a FROM casos WHERE id=NEW.caso_id FOR UPDATE;
 IF length(trim(NEW.motivo))=0 THEN RAISE EXCEPTION 'Indicar motivo del cambio'; END IF;
 IF NEW.estado_nuevo='CERRADO' AND (EXISTS(SELECT 1 FROM actuaciones WHERE caso_id=NEW.caso_id AND estado IN ('PLANIFICADA','POSPUESTA')) OR EXISTS(SELECT 1 FROM compromisos WHERE caso_id=NEW.caso_id AND estado NOT IN ('COMPLETADO','CANCELADO')) OR EXISTS(SELECT 1 FROM acciones_plan_intervencion x JOIN planes_intervencion p ON p.id=x.plan_intervencion_id WHERE p.caso_id=NEW.caso_id AND x.estado NOT IN ('COMPLETADO','CANCELADO')) OR EXISTS(SELECT 1 FROM estados_pasos_protocolo_caso x JOIN protocolos_caso p ON p.id=x.protocolo_caso_id WHERE p.caso_id=NEW.caso_id AND x.estado NOT IN ('COMPLETADO','OMITIDO'))) AND nullif(trim(NEW.justificacion_pendientes),'') IS NULL THEN RAISE EXCEPTION 'Resolver o justificar pendientes antes de cerrar'; END IF;
 IF NEW.estado_anterior IS DISTINCT FROM a.estado_actual THEN RAISE EXCEPTION 'El caso cambió, recargar antes de decidir'; END IF;
 IF NEW.evidencia_cierre_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM evidencias e LEFT JOIN actuaciones x ON x.id=e.actuacion_id LEFT JOIN situaciones z ON z.id=e.situacion_id LEFT JOIN compromisos k ON k.id=e.compromiso_id WHERE e.id=NEW.evidencia_cierre_id AND coalesce(e.caso_id,x.caso_id,z.caso_id,k.caso_id)=NEW.caso_id AND e.tipo_evidencia='ACTA') THEN RAISE EXCEPTION 'Acta de cierre debe corresponder al mismo caso'; END IF;
 IF NEW.estado_nuevo='CERRADO' AND nullif(trim(NEW.resumen_cierre),'') IS NULL THEN RAISE EXCEPTION 'El cierre requiere resumen'; END IF;
 IF a.estado_actual='CERRADO' AND NEW.estado_nuevo<>'REABIERTO' THEN RAISE EXCEPTION 'Un caso cerrado primero se reabre'; END IF;
 IF a.estado_actual<>'CERRADO' AND NEW.estado_nuevo='REABIERTO' THEN RAISE EXCEPTION 'Solo se reabre un caso cerrado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.cambiado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Cambio requiere Convivencia activa'; END IF;
 ELSIF TG_TABLE_NAME='comunicaciones' THEN
 IF TG_OP='UPDATE' AND OLD.enviado_en IS NOT NULL AND (NEW.cuerpo_enviado,NEW.direccion_destinatario,NEW.persona_destinataria_id,NEW.asunto,NEW.enviado_en) IS DISTINCT FROM (OLD.cuerpo_enviado,OLD.direccion_destinatario,OLD.persona_destinataria_id,OLD.asunto,OLD.enviado_en) THEN RAISE EXCEPTION 'Conservar contenido del correo enviado'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.establecimientos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.anios_academicos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.personas FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.estudiantes FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.membresias_establecimiento FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.cursos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.asignaciones_docentes FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.matriculas FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.apoderados_estudiante FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.accesos_apoderado FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.categorias_convivencia FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.casos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.situaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.participaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.revisiones_convivencia FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.historial_estados_caso FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.archivos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.documentos_institucionales FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.versiones_documento FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.fragmentos_rag FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.protocolos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.versiones_protocolo FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.pasos_protocolo FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.protocolos_caso FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.estados_pasos_protocolo_caso FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.referencias_revision_normativa FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.planes_intervencion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.acciones_plan_intervencion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.actuaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.compromisos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.revisiones_compromisos FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.comunicaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.reglas FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.alertas FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.planes_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.objetivos_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.acciones_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.actividades_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.evidencias FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.notificaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.procesos_importacion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.filas_importacion FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.eventos_auditoria FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER validar BEFORE INSERT OR UPDATE ON convi.registros_solicitudes_ia FOR EACH ROW EXECUTE FUNCTION convi.validar_relaciones();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.revisiones_convivencia FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.referencias_revision_normativa FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.historial_estados_caso FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.revisiones_compromisos FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.eventos_auditoria FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.evidencias FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();
CREATE TRIGGER inmutable BEFORE UPDATE OR DELETE ON convi.archivos FOR EACH ROW EXECUTE FUNCTION convi.solo_insertar();

-- Las nuevas decisiones actualizan la situación dentro de la misma transacción
CREATE FUNCTION convi.aplicar_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF NEW.tipo_revision='DECISION' THEN
 PERFORM 1 FROM situaciones WHERE id=NEW.situacion_id FOR UPDATE;
 UPDATE situaciones SET estado=NEW.resultado,caso_id=NEW.caso_destino_id,
 vinculado_a_caso_en=CASE WHEN NEW.caso_destino_id IS NOT NULL THEN NEW.revisado_en END,
 vinculado_a_caso_por=CASE WHEN NEW.caso_destino_id IS NOT NULL THEN NEW.revisado_por END
 WHERE id=NEW.situacion_id;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER aplicar AFTER INSERT ON convi.revisiones_convivencia FOR EACH ROW EXECUTE FUNCTION convi.aplicar_revision();
CREATE FUNCTION convi.aplicar_estado() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN UPDATE casos SET estado_actual=NEW.estado_nuevo,cerrado_en=CASE WHEN NEW.estado_nuevo='CERRADO' THEN NEW.cambiado_en END WHERE id=NEW.caso_id; RETURN NEW; END $$;
CREATE TRIGGER aplicar AFTER INSERT ON convi.historial_estados_caso FOR EACH ROW EXECUTE FUNCTION convi.aplicar_estado();
-- Registra modificaciones y reprogramaciones sin otra tabla de historial
CREATE FUNCTION convi.auditar_cambio() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 INSERT INTO eventos_auditoria(establecimiento_id,membresia_actor_id,codigo_accion,tipo_recurso,recurso_id,codigo_resultado,metadatos)
 VALUES(NEW.establecimiento_id,nullif(current_setting('app.membresia_id',true),'')::uuid,'MODIFICACION',TG_TABLE_NAME,NEW.id,'OK',jsonb_build_object('antes',to_jsonb(OLD),'despues',to_jsonb(NEW),'motivo',nullif(current_setting('app.motivo_cambio',true),'')));
 RETURN NEW;
END $$;
CREATE TRIGGER auditar AFTER UPDATE ON convi.actuaciones FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.compromisos FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.situaciones FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.matriculas FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.accesos_apoderado FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.actividades_plan_gestion FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.acciones_plan_intervencion FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.estados_pasos_protocolo_caso FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();

-- Impide editar contenido publicado, se incorpora una nueva versión
CREATE FUNCTION convi.proteger_version() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='pasos_protocolo' THEN
 IF TG_OP='UPDATE' AND NEW.version_protocolo_id IS DISTINCT FROM OLD.version_protocolo_id THEN RAISE EXCEPTION 'Un paso no cambia de versión'; END IF;
 IF TG_OP='INSERT' THEN
 IF EXISTS(SELECT 1 FROM versiones_protocolo WHERE id=NEW.version_protocolo_id AND estado<>'BORRADOR') THEN RAISE EXCEPTION 'No agregar pasos a versión publicada'; END IF;
 RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM versiones_protocolo WHERE id=OLD.version_protocolo_id AND estado<>'BORRADOR') THEN RAISE EXCEPTION 'Pasos publicados inmutables'; END IF;
 ELSIF OLD.estado<>'BORRADOR' AND NEW.estado='BORRADOR' THEN RAISE EXCEPTION 'Una versión publicada no vuelve a borrador';
 ELSIF OLD.estado<>'BORRADOR' AND (to_jsonb(NEW)-'estado'-'vigente_hasta'-'estado_procesamiento'-'procesado_en'-'detalle_error_procesamiento'-'intentos_procesamiento') IS DISTINCT FROM (to_jsonb(OLD)-'estado'-'vigente_hasta'-'estado_procesamiento'-'procesado_en'-'detalle_error_procesamiento'-'intentos_procesamiento') THEN RAISE EXCEPTION 'Contenido publicado inmutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER proteger BEFORE UPDATE ON convi.versiones_documento FOR EACH ROW EXECUTE FUNCTION convi.proteger_version();
CREATE TRIGGER proteger BEFORE UPDATE ON convi.versiones_protocolo FOR EACH ROW EXECUTE FUNCTION convi.proteger_version();
CREATE TRIGGER proteger BEFORE INSERT OR UPDATE OR DELETE ON convi.pasos_protocolo FOR EACH ROW EXECUTE FUNCTION convi.proteger_version();

-- ===== 3. Acceso del backend y seguridad por fila =====

-- El rol no tiene contraseña ni LOGIN, un administrador de despliegue asigna
-- una credencial de servidor específica, nunca a anon ni authenticated
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='convi_backend') THEN CREATE ROLE convi_backend NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA convi TO convi_backend;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA convi TO convi_backend;
-- Nunca conceder DELETE ni TRUNCATE para operación habitual
CREATE FUNCTION convi.membresia_actual() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('app.membresia_id',true),'')::uuid $$;
CREATE FUNCTION convi.establecimiento_actual() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('app.establecimiento_id',true),'')::uuid $$;
-- Propietario de esta función debe ser el propietario de instalación, no convi_backend
CREATE FUNCTION convi.sesion_valida() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=convi,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM membresias_establecimiento m WHERE m.id=convi.membresia_actual()
 AND m.establecimiento_id=convi.establecimiento_actual() AND m.estado='ACTIVO'
 AND EXISTS(SELECT 1 FROM establecimientos e WHERE e.id=m.establecimiento_id AND e.estado='ACTIVO')
 AND m.auth_usuario_id=nullif(current_setting('app.auth_usuario_id',true),'')::uuid
 AND (m.codigo_perfil NOT IN ('CONVIVENCIA','ADMIN') OR current_setting('app.aal',true)='aal2')) $$;
-- Estas funciones calculan autorización, no retornan expedientes ni datos personales
CREATE FUNCTION convi.puede_ver_estudiante(p_estudiante uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=convi,pg_temp AS $$
 SELECT convi.sesion_valida() AND EXISTS(
 SELECT 1 FROM membresias_establecimiento m JOIN estudiantes e ON e.id=p_estudiante AND e.establecimiento_id=m.establecimiento_id
 WHERE m.id=convi.membresia_actual() AND (m.codigo_perfil='CONVIVENCIA' OR
 (m.codigo_perfil='APODERADO' AND EXISTS(SELECT 1 FROM apoderados_estudiante a JOIN accesos_apoderado x ON x.apoderado_estudiante_id=a.id
 WHERE a.estudiante_id=e.id AND a.persona_apoderado_id=m.persona_id AND x.membresia_apoderado_id=m.id
 AND (a.activo_desde IS NULL OR a.activo_desde<=current_date) AND (a.activo_hasta IS NULL OR a.activo_hasta>=current_date)
 AND x.estado='ACTIVO' AND x.otorgado_en<=now() AND x.expira_en>now())))) $$;
CREATE FUNCTION convi.puede_ver_caso(p_caso uuid,p_estudiante uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=convi,pg_temp AS $$
 SELECT convi.sesion_valida() AND EXISTS(SELECT 1 FROM casos c JOIN membresias_establecimiento m ON m.establecimiento_id=c.establecimiento_id
 WHERE c.id=p_caso AND m.id=convi.membresia_actual() AND (m.codigo_perfil='CONVIVENCIA' OR
 (m.codigo_perfil='APODERADO' AND convi.puede_ver_estudiante(p_estudiante) AND EXISTS(
 SELECT 1 FROM participaciones p JOIN estudiantes e ON e.persona_id=p.persona_id
 LEFT JOIN situaciones s ON s.id=p.situacion_id
 WHERE e.id=p_estudiante AND (p.caso_id=c.id OR s.caso_id=c.id)))) ) $$;
CREATE FUNCTION convi.puede_reportar_curso(p_curso uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=convi,pg_temp AS $$
 SELECT convi.sesion_valida() AND EXISTS(SELECT 1 FROM membresias_establecimiento m JOIN cursos c ON c.establecimiento_id=m.establecimiento_id
 WHERE m.id=convi.membresia_actual() AND c.id=p_curso AND (m.codigo_perfil='CONVIVENCIA' OR (m.codigo_perfil='PROFESOR' AND EXISTS(
 SELECT 1 FROM asignaciones_docentes a WHERE a.curso_id=c.id AND a.membresia_id=m.id AND (a.fecha_inicio IS NULL OR a.fecha_inicio<=current_date) AND (a.fecha_fin IS NULL OR a.fecha_fin>=current_date))))) $$;
CREATE POLICY aislamiento_backend ON convi.establecimientos TO convi_backend USING (id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.anios_academicos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.personas TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.estudiantes TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.membresias_establecimiento TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.cursos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.asignaciones_docentes TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.matriculas TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.apoderados_estudiante TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.accesos_apoderado TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.categorias_convivencia TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.casos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.situaciones TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.participaciones TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.revisiones_convivencia TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.historial_estados_caso TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.archivos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.documentos_institucionales TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.versiones_documento TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.fragmentos_rag TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.protocolos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.versiones_protocolo TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.pasos_protocolo TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.protocolos_caso TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.estados_pasos_protocolo_caso TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.referencias_revision_normativa TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.planes_intervencion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.acciones_plan_intervencion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.actuaciones TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.compromisos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.revisiones_compromisos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.comunicaciones TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.reglas TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.alertas TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.situaciones_alerta TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.planes_gestion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.objetivos_plan_gestion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.acciones_plan_gestion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.actividades_plan_gestion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.evidencias TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.notificaciones TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.procesos_importacion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.filas_importacion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.eventos_auditoria TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.registros_solicitudes_ia TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());

CREATE POLICY aislamiento_backend ON convi.aclaraciones_situacion TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.cursos_actividad TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.profesionales_actividad TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.informes TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
-- Historias inmutables y evidencias no se actualizan desde el rol de aplicación
REVOKE UPDATE ON convi.revisiones_convivencia,convi.referencias_revision_normativa,convi.historial_estados_caso,convi.revisiones_compromisos,convi.eventos_auditoria,convi.evidencias,convi.archivos FROM convi_backend;
CREATE POLICY aislamiento_backend ON convi.niveles_educativos TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());
CREATE POLICY aislamiento_backend ON convi.borradores_documentales_ia TO convi_backend USING (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.sesion_valida());

-- ===== Búsqueda vectorial del reglamento (pgvector, bge-m3 de 1024 dimensiones) =====

-- [pgvector inicio]
CREATE INDEX fragmentos_embedding_hnsw ON convi.fragmentos_rag USING hnsw (embedding extensions.vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE FUNCTION convi.buscar_fragmentos_normativa(p_vector extensions.vector,p_limite integer DEFAULT 6,p_fecha date DEFAULT current_date)
 RETURNS TABLE(fragmento_id uuid,version_id uuid,documento_id uuid,pagina_desde integer,pagina_hasta integer,contenido text,distancia double precision)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=convi,pg_temp AS $body$
 BEGIN
  IF p_vector IS NULL OR extensions.vector_dims(p_vector)<>1024 THEN RAISE EXCEPTION 'La consulta requiere 1024 dimensiones'; END IF;
  IF p_limite IS NULL OR p_limite<1 OR p_limite>20 THEN RAISE EXCEPTION 'La consulta admite entre 1 y 20 fragmentos'; END IF;
  IF NOT convi.sesion_valida() OR NOT EXISTS(SELECT 1 FROM convi.membresias_establecimiento WHERE id=convi.membresia_actual() AND codigo_perfil='CONVIVENCIA') THEN RAISE EXCEPTION 'Consulta normativa de IA autorizada solo para Convivencia'; END IF;
  RETURN QUERY
  SELECT f.id,f.version_documento_id,v.documento_id,f.pagina_desde,f.pagina_hasta,f.contenido,f.embedding OPERATOR(extensions.<=>) p_vector
  FROM convi.fragmentos_rag f JOIN convi.versiones_documento v ON v.id=f.version_documento_id AND v.establecimiento_id=f.establecimiento_id
  JOIN convi.documentos_institucionales d ON d.id=v.documento_id AND d.establecimiento_id=v.establecimiento_id
  WHERE f.establecimiento_id=convi.establecimiento_actual() AND f.embedding IS NOT NULL AND f.modelo_embedding='bge-m3:567m-fp16'
  AND v.estado='PUBLICADO' AND v.incluir_en_busqueda_ia AND v.estado_procesamiento='LISTO' AND d.estado='ACTIVO' AND d.tipo_documento<>'PLANTILLA'
  AND (v.vigente_desde IS NULL OR v.vigente_desde<=p_fecha) AND (v.vigente_hasta IS NULL OR v.vigente_hasta>=p_fecha)
  ORDER BY f.embedding OPERATOR(extensions.<=>) p_vector LIMIT p_limite;
 END;
 $body$;
-- [pgvector fin]

-- ===== 4. Vistas de historial y calendario =====

CREATE VIEW convi.vw_casos_estudiante WITH (security_invoker=true) AS
SELECT DISTINCT e.establecimiento_id,e.id estudiante_id,p.caso_id
FROM convi.estudiantes e JOIN convi.participaciones p ON p.persona_id=e.persona_id WHERE p.caso_id IS NOT NULL
UNION
SELECT DISTINCT e.establecimiento_id,e.id,s.caso_id
FROM convi.estudiantes e JOIN convi.participaciones p ON p.persona_id=e.persona_id JOIN convi.situaciones s ON s.id=p.situacion_id WHERE s.caso_id IS NOT NULL;
CREATE VIEW convi.vw_situaciones_estudiante WITH (security_invoker=true) AS
SELECT DISTINCT e.establecimiento_id,e.id estudiante_id,s.id situacion_id,s.caso_id
FROM convi.estudiantes e JOIN convi.participaciones p ON p.persona_id=e.persona_id JOIN convi.situaciones s ON s.id=p.situacion_id;
CREATE VIEW convi.vw_evidencias_contexto WITH (security_invoker=true) AS
SELECT e.*,coalesce(e.caso_id,s.caso_id,a.caso_id,c.caso_id,sa.caso_id) caso_contexto_id
FROM convi.evidencias e LEFT JOIN convi.situaciones s ON s.id=e.situacion_id
LEFT JOIN convi.aclaraciones_situacion ac ON ac.id=e.aclaracion_id LEFT JOIN convi.situaciones sa ON sa.id=ac.situacion_id
LEFT JOIN convi.actuaciones a ON a.id=e.actuacion_id LEFT JOIN convi.compromisos c ON c.id=e.compromiso_id;
CREATE VIEW convi.vw_cronologia_caso WITH (security_invoker=true) AS
SELECT establecimiento_id,id caso_id,id origen_id,'APERTURA'::text tipo,fecha_inicio::timestamptz fecha_evento,registrado_en fecha_registro,resumen::text descripcion,abierto_por actor_id FROM convi.casos
UNION ALL SELECT establecimiento_id,caso_id,id,'SITUACION',coalesce(ocurrido_en,reportado_en),reportado_en,descripcion,reportado_por_membresia_id FROM convi.situaciones WHERE caso_id IS NOT NULL
UNION ALL SELECT r.establecimiento_id,coalesce(r.caso_id,r.caso_destino_id,s.caso_id),r.id,'REVISION',r.revisado_en,r.revisado_en,r.fundamento,r.revisado_por FROM convi.revisiones_convivencia r LEFT JOIN convi.situaciones s ON s.id=r.situacion_id WHERE coalesce(r.caso_id,r.caso_destino_id,s.caso_id) IS NOT NULL
UNION ALL SELECT establecimiento_id,caso_id,id,'ESTADO',cambiado_en,cambiado_en,estado_nuevo||' '||motivo,cambiado_por FROM convi.historial_estados_caso
UNION ALL SELECT establecimiento_id,caso_id,id,'ACTUACION',coalesce(realizado_en,programado_en,creado_en),creado_en,tipo_actuacion||' '||objetivo||' '||estado,creado_por FROM convi.actuaciones
UNION ALL SELECT establecimiento_id,caso_id,id,'COMPROMISO',creado_en,creado_en,descripcion,creado_por FROM convi.compromisos
UNION ALL SELECT r.establecimiento_id,r.caso_id,r.id,'COMPROMISO_REVISADO',r.registrado_en,r.registrado_en,r.estado_observado||' '||coalesce(r.observacion,''),r.creado_por FROM convi.revisiones_compromisos r JOIN convi.actuaciones a ON a.id=r.actuacion_id
UNION ALL SELECT establecimiento_id,caso_id,id,'COMUNICACION',coalesce(ocurrido_en,enviado_en),creado_en,coalesce(asunto,resumen,''),creado_por FROM convi.comunicaciones WHERE coalesce(ocurrido_en,enviado_en) IS NOT NULL
UNION ALL SELECT establecimiento_id,caso_contexto_id,id,'EVIDENCIA',coalesce(fecha_documento,creado_en),creado_en,titulo,creado_por FROM convi.vw_evidencias_contexto WHERE caso_contexto_id IS NOT NULL
UNION ALL SELECT establecimiento_id,caso_id,id,'PROTOCOLO',aplicado_en,aplicado_en,coalesce(fundamento,''),aplicado_por FROM convi.protocolos_caso
UNION ALL SELECT e.establecimiento_id,a.caso_id,e.id,'ACTUACION_MODIFICADA',e.ocurrido_en,e.ocurrido_en,
'Modificación de actuación '||a.tipo_actuacion||' fecha anterior '||coalesce(e.metadatos->'antes'->>'programado_en','sin fecha')||' nueva fecha '||coalesce(e.metadatos->'despues'->>'programado_en','sin fecha')||' motivo '||coalesce(e.metadatos->>'motivo',''),e.membresia_actor_id
FROM convi.eventos_auditoria e JOIN convi.actuaciones a ON a.id=e.recurso_id WHERE e.tipo_recurso='actuaciones' AND e.codigo_accion='MODIFICACION'
UNION ALL SELECT e.establecimiento_id,e.recurso_id,e.id,'CASO_MODIFICADO',e.ocurrido_en,e.ocurrido_en,coalesce(e.metadatos->>'motivo','Actualización del caso'),e.membresia_actor_id FROM convi.eventos_auditoria e WHERE e.tipo_recurso='casos' AND e.codigo_accion='MODIFICACION'
UNION ALL SELECT a.establecimiento_id,s.caso_id,a.id,'ACLARACION',a.solicitado_en,a.solicitado_en,a.pregunta,a.solicitado_por FROM convi.aclaraciones_situacion a JOIN convi.situaciones s ON s.id=a.situacion_id WHERE s.caso_id IS NOT NULL
UNION ALL SELECT a.establecimiento_id,s.caso_id,a.id,'RESPUESTA_ACLARACION',a.respondido_en,a.respondido_en,a.respuesta,a.respondido_por FROM convi.aclaraciones_situacion a JOIN convi.situaciones s ON s.id=a.situacion_id WHERE a.respondido_en IS NOT NULL AND s.caso_id IS NOT NULL;
CREATE VIEW convi.vw_calendario WITH (security_invoker=true) AS
SELECT establecimiento_id,id origen_id,'ACTUACION'::text tipo,caso_id,objetivo::text titulo,programado_en inicio,fin_programado_en fin,estado::text estado FROM convi.actuaciones WHERE programado_en IS NOT NULL
UNION ALL SELECT establecimiento_id,id,'COMPROMISO',caso_id,descripcion,vence_en,NULL::timestamptz,estado FROM convi.compromisos WHERE vence_en IS NOT NULL
UNION ALL SELECT establecimiento_id,id,'PLAN_GESTION',NULL::uuid,titulo,inicio_programado,fin_programado,estado FROM convi.actividades_plan_gestion
UNION ALL SELECT x.establecimiento_id,x.id,'PASO_PROTOCOLO',p.caso_id,s.nombre,x.vence_en,NULL::timestamptz,x.estado FROM convi.estados_pasos_protocolo_caso x JOIN convi.protocolos_caso p ON p.id=x.protocolo_caso_id JOIN convi.pasos_protocolo s ON s.id=x.paso_protocolo_id WHERE x.vence_en IS NOT NULL
UNION ALL SELECT a.establecimiento_id,a.id,'ACCION_INTERVENCION',p.caso_id,a.descripcion,a.vence_en,NULL::timestamptz,a.estado FROM convi.acciones_plan_intervencion a JOIN convi.planes_intervencion p ON p.id=a.plan_intervencion_id WHERE a.vence_en IS NOT NULL;
GRANT SELECT ON convi.vw_casos_estudiante,convi.vw_situaciones_estudiante,convi.vw_evidencias_contexto,convi.vw_cronologia_caso,convi.vw_calendario TO convi_backend;
REVOKE ALL ON ALL TABLES IN SCHEMA convi FROM anon,authenticated;

-- ===== 5. Reglas integradas =====

CREATE FUNCTION convi.validar_integracion() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE x record; y record; actor uuid; motivo text; contexto uuid;
BEGIN
 actor:=nullif(current_setting('app.membresia_id',true),'')::uuid;
 motivo:=nullif(trim(current_setting('app.motivo_cambio',true)),'');
 IF TG_OP='UPDATE' AND to_jsonb(NEW)->>'establecimiento_id' IS DISTINCT FROM to_jsonb(OLD)->>'establecimiento_id' THEN RAISE EXCEPTION 'No trasladar registros entre establecimientos'; END IF;
 IF TG_OP='INSERT' AND to_jsonb(NEW) ? 'creado_por' AND actor IS NOT NULL AND (to_jsonb(NEW)->>'creado_por')::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION 'El autor debe ser la cuenta que registra'; END IF;
 IF TG_OP='UPDATE' AND to_jsonb(NEW) ? 'creado_por' AND to_jsonb(NEW)->>'creado_por' IS DISTINCT FROM to_jsonb(OLD)->>'creado_por' THEN RAISE EXCEPTION 'Conservar autor original'; END IF;
 IF TG_TABLE_NAME='casos' THEN
  IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.asignado_a_membresia_id AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Responsable debe ser Convivencia activa'; END IF;
  IF TG_OP='INSERT' THEN NEW.registrado_en:=clock_timestamp(); NEW.abierto_en:=NEW.registrado_en;
  ELSIF NEW.registrado_en IS DISTINCT FROM OLD.registrado_en OR NEW.abierto_en IS DISTINCT FROM OLD.abierto_en OR NEW.abierto_por IS DISTINCT FROM OLD.abierto_por THEN RAISE EXCEPTION 'Conservar fecha y autor de registro'; END IF;
  IF TG_OP='UPDATE' AND NEW.asignado_a_membresia_id IS DISTINCT FROM OLD.asignado_a_membresia_id AND motivo IS NULL THEN RAISE EXCEPTION 'Indicar motivo del cambio de responsable'; END IF;
 ELSIF TG_TABLE_NAME='situaciones' THEN
  IF nullif(trim(NEW.descripcion),'') IS NULL THEN RAISE EXCEPTION 'Indicar descripción'; END IF;
  IF TG_OP='INSERT' THEN NEW.reportado_en:=clock_timestamp(); END IF;
  IF NEW.registro_historico AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.reportado_por_membresia_id AND codigo_perfil='CONVIVENCIA') THEN RAISE EXCEPTION 'El registro histórico corresponde a Convivencia'; END IF;
  IF TG_OP='UPDATE' AND (NEW.urgencia,NEW.asignado_a_membresia_id) IS DISTINCT FROM (OLD.urgencia,OLD.asignado_a_membresia_id) AND motivo IS NULL THEN RAISE EXCEPTION 'Indicar motivo de la actualización'; END IF;
 ELSIF TG_TABLE_NAME='revisiones_convivencia' THEN
  IF NEW.situacion_duplicada_id=NEW.situacion_id THEN RAISE EXCEPTION 'No señalar la misma situación como duplicado'; END IF;
 ELSIF TG_TABLE_NAME='participaciones' THEN
  IF NEW.matricula_contexto_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM matriculas m JOIN estudiantes e ON e.id=m.estudiante_id WHERE m.id=NEW.matricula_contexto_id AND e.persona_id=NEW.persona_id) THEN RAISE EXCEPTION 'Matrícula de otra persona'; END IF;
  IF TG_OP='UPDATE' AND (NEW.persona_id,NEW.situacion_id,NEW.caso_id,NEW.actuacion_id,NEW.matricula_contexto_id) IS DISTINCT FROM (OLD.persona_id,OLD.situacion_id,OLD.caso_id,OLD.actuacion_id,OLD.matricula_contexto_id) THEN RAISE EXCEPTION 'Conservar contexto histórico, registrar corrección sin sustituir la participación'; END IF;
 ELSIF TG_TABLE_NAME='actuaciones' THEN
  IF NEW.estado='REALIZADA' AND nullif(trim(NEW.resultado),'') IS NULL THEN RAISE EXCEPTION 'Indicar resultado de la actuación'; END IF;
  IF NEW.estado IN ('PLANIFICADA','POSPUESTA') AND NEW.programado_en IS NULL THEN RAISE EXCEPTION 'Indicar fecha programada'; END IF;
  IF NEW.seguimiento_anterior_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM actuaciones WHERE id=NEW.seguimiento_anterior_id AND caso_id=NEW.caso_id AND tipo_actuacion='SEGUIMIENTO') THEN RAISE EXCEPTION 'El seguimiento anterior debe corresponder al mismo caso'; END IF;
  IF TG_OP='UPDATE' AND (NEW.programado_en,NEW.fin_programado_en) IS DISTINCT FROM (OLD.programado_en,OLD.fin_programado_en) AND motivo IS NULL THEN RAISE EXCEPTION 'Indicar motivo de reprogramación'; END IF;
 ELSIF TG_TABLE_NAME='compromisos' THEN
  IF TG_OP='INSERT' AND NEW.estado<>'PENDIENTE' THEN RAISE EXCEPTION 'Registrar primero el compromiso y luego su revisión'; END IF;
  IF TG_OP='UPDATE' AND (NEW.estado,NEW.nota_cumplimiento,NEW.completado_en) IS DISTINCT FROM (OLD.estado,OLD.nota_cumplimiento,OLD.completado_en) AND pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Cambiar cumplimiento mediante una revisión'; END IF;
 ELSIF TG_TABLE_NAME='revisiones_compromisos' THEN
  IF nullif(trim(NEW.observacion),'') IS NULL THEN RAISE EXCEPTION 'Explicar el resultado observado'; END IF;
 ELSIF TG_TABLE_NAME='aclaraciones_situacion' THEN
  SELECT * INTO x FROM situaciones WHERE id=NEW.situacion_id;
  IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.solicitado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') OR NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.profesor_destinatario_id AND codigo_perfil='PROFESOR') OR NEW.profesor_destinatario_id IS DISTINCT FROM x.reportado_por_membresia_id THEN RAISE EXCEPTION 'Solicitar al profesor autor del reporte'; END IF;
  IF TG_OP='INSERT' AND (NEW.estado<>'PENDIENTE' OR (actor IS NOT NULL AND actor<>NEW.solicitado_por)) THEN RAISE EXCEPTION 'Solo Convivencia crea la solicitud pendiente'; END IF;
  IF TG_OP='UPDATE' THEN
   IF OLD.estado='RESPONDIDA' THEN RAISE EXCEPTION 'La respuesta enviada se conserva, incorporar otra solicitud'; END IF;
   IF (NEW.situacion_id,NEW.solicitado_por,NEW.profesor_destinatario_id,NEW.pregunta,NEW.solicitado_en) IS DISTINCT FROM (OLD.situacion_id,OLD.solicitado_por,OLD.profesor_destinatario_id,OLD.pregunta,OLD.solicitado_en) THEN RAISE EXCEPTION 'Conservar solicitud original'; END IF;
   IF NEW.respondido_por IS DISTINCT FROM NEW.profesor_destinatario_id OR (actor IS NOT NULL AND actor<>NEW.respondido_por) THEN RAISE EXCEPTION 'Solo el profesor destinatario responde'; END IF;
   NEW.respondido_en:=clock_timestamp();
  END IF;
 ELSIF TG_TABLE_NAME='protocolos' THEN
  IF TG_OP='UPDATE' AND NEW.naturaleza<>OLD.naturaleza THEN RAISE EXCEPTION 'Una propuesta de IA no se convierte en protocolo oficial'; END IF;
 ELSIF TG_TABLE_NAME='versiones_protocolo' THEN
  IF NEW.estado='PUBLICADO' THEN
   IF NEW.version_documento_origen_id IS NULL OR NEW.publicado_en IS NULL THEN RAISE EXCEPTION 'Conservar documento de origen y fecha de revisión'; END IF;
   IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.revisado_por AND codigo_perfil IN ('ADMIN','CONVIVENCIA') AND estado='ACTIVO') THEN RAISE EXCEPTION 'Revisor institucional autorizado'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='estados_pasos_protocolo_caso' THEN
  IF NEW.responsable_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.responsable_id AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Asignar paso a Convivencia activa'; END IF;
  IF NEW.estado='COMPLETADO' THEN
   IF NEW.completado_en IS NULL OR NEW.completado_por IS NULL THEN RAISE EXCEPTION 'Conservar fecha y autor del cumplimiento'; END IF;
   IF EXISTS(SELECT 1 FROM pasos_protocolo WHERE id=NEW.paso_protocolo_id AND requiere_evidencia) AND NOT EXISTS(SELECT 1 FROM evidencias WHERE paso_caso_id=NEW.id AND archivo_id IS NOT NULL) THEN RAISE EXCEPTION 'Adjuntar respaldo antes de completar el paso'; END IF;
  END IF;
  IF NEW.estado='OMITIDO' AND nullif(trim(NEW.notas),'') IS NULL THEN RAISE EXCEPTION 'Justificar omisión de paso'; END IF;
 ELSIF TG_TABLE_NAME='comunicaciones' THEN
  IF NEW.tipo_comunicacion='CORREO' AND NEW.estado_entrega IN ('PENDIENTE','ENVIADO','ENTREGADO','REBOTADO') AND (NEW.confirmado_por IS NULL OR NEW.confirmado_en IS NULL OR NEW.clave_envio IS NULL) THEN RAISE EXCEPTION 'Confirmar contenido y destinatario antes de enviar'; END IF;
  IF NEW.confirmado_por IS NOT NULL AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.confirmado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Confirmación requiere Convivencia'; END IF;
  IF TG_OP='UPDATE' AND OLD.confirmado_en IS NOT NULL AND OLD.enviado_en IS NULL AND (NEW.cuerpo_enviado,NEW.asunto,NEW.direccion_destinatario) IS DISTINCT FROM (OLD.cuerpo_enviado,OLD.asunto,OLD.direccion_destinatario) THEN RAISE EXCEPTION 'Crear un nuevo borrador si cambia el contenido confirmado'; END IF;
 ELSIF TG_TABLE_NAME='reglas' THEN
  IF NEW.tipo_regla='VARIACION_PERIODO' AND (NEW.ventana_dias IS NULL OR NEW.ventana_dias<=0 OR NEW.ventana_comparacion_dias IS DISTINCT FROM NEW.ventana_dias OR NEW.codigo_metrica IS DISTINCT FROM 'VARIACION_PORCENTUAL' OR NEW.codigo_operador NOT IN ('GT','GE','LT','LE') OR NEW.codigo_operador IS NULL OR NEW.valor_umbral IS NULL) THEN RAISE EXCEPTION 'Definir ventanas iguales, métrica, operador y umbral de variación'; END IF;
  IF TG_OP='UPDATE' AND OLD.estado<>'BORRADOR' AND (to_jsonb(NEW)-'estado'-'vigente_hasta') IS DISTINCT FROM (to_jsonb(OLD)-'estado'-'vigente_hasta') THEN RAISE EXCEPTION 'Crear otra versión de regla'; END IF;
  IF TG_OP='UPDATE' AND OLD.estado<>'BORRADOR' AND NEW.estado='BORRADOR' THEN RAISE EXCEPTION 'Una regla utilizada no vuelve a borrador'; END IF;
 ELSIF TG_TABLE_NAME='filas_importacion' THEN
  IF TG_OP='UPDATE' AND (NEW.datos_originales,NEW.proceso_importacion_id,NEW.numero_fila) IS DISTINCT FROM (OLD.datos_originales,OLD.proceso_importacion_id,OLD.numero_fila) THEN RAISE EXCEPTION 'Conservar fila original'; END IF;
 ELSIF TG_TABLE_NAME='procesos_importacion' THEN
  IF NEW.tipo_importacion NOT IN ('ESTUDIANTES','CURSOS','PROFESORES','APODERADOS','MATRICULAS','ASIGNACIONES') THEN RAISE EXCEPTION 'Importación reservada a datos administrativos'; END IF;
 ELSIF TG_TABLE_NAME='evidencias' THEN
  IF NEW.rectifica_evidencia_id IS NOT NULL AND nullif(trim(NEW.motivo_rectificacion),'') IS NULL THEN RAISE EXCEPTION 'Explicar la rectificación'; END IF;
  IF NEW.paso_caso_id IS NOT NULL THEN
   SELECT p.caso_id INTO contexto FROM estados_pasos_protocolo_caso ep JOIN protocolos_caso p ON p.id=ep.protocolo_caso_id WHERE ep.id=NEW.paso_caso_id;
   IF contexto IS DISTINCT FROM coalesce(NEW.caso_id,(SELECT caso_id FROM actuaciones WHERE id=NEW.actuacion_id),(SELECT caso_id FROM situaciones WHERE id=NEW.situacion_id),(SELECT caso_id FROM compromisos WHERE id=NEW.compromiso_id)) THEN RAISE EXCEPTION 'Respaldo de paso debe pertenecer al mismo caso'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='cursos_actividad' THEN
  IF NOT EXISTS(SELECT 1 FROM actividades_plan_gestion a JOIN acciones_plan_gestion ac ON ac.id=a.accion_plan_id JOIN objetivos_plan_gestion o ON o.id=ac.objetivo_id JOIN planes_gestion p ON p.id=o.plan_gestion_id JOIN cursos c ON c.anio_academico_id=p.anio_academico_id WHERE a.id=NEW.actividad_id AND c.id=NEW.curso_id) THEN RAISE EXCEPTION 'Curso debe corresponder al año del Plan'; END IF;
 ELSIF TG_TABLE_NAME='profesionales_actividad' THEN
  IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.membresia_id AND codigo_perfil IN ('CONVIVENCIA','PROFESOR') AND estado='ACTIVO') THEN RAISE EXCEPTION 'Profesional institucional activo requerido'; END IF;
 ELSIF TG_TABLE_NAME='informes' THEN
  IF TG_OP='UPDATE' AND OLD.estado='PUBLICADO' THEN RAISE EXCEPTION 'El informe publicado se conserva, crear nueva edición'; END IF;
  IF NEW.informe_anterior_id=NEW.id THEN RAISE EXCEPTION 'Informe no puede ser su propia edición anterior'; END IF;
 ELSIF TG_TABLE_NAME='fragmentos_rag' THEN
  IF TG_OP='UPDATE' AND (NEW.contenido,NEW.version_documento_id,NEW.pagina_desde,NEW.pagina_hasta) IS DISTINCT FROM (OLD.contenido,OLD.version_documento_id,OLD.pagina_desde,OLD.pagina_hasta) AND EXISTS(SELECT 1 FROM versiones_documento WHERE id=OLD.version_documento_id AND estado<>'BORRADOR') THEN RAISE EXCEPTION 'Conservar texto y páginas del documento publicado'; END IF;
 END IF;
 RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['casos','situaciones','revisiones_convivencia','participaciones','actuaciones','compromisos','revisiones_compromisos','aclaraciones_situacion','protocolos','versiones_protocolo','estados_pasos_protocolo_caso','comunicaciones','reglas','filas_importacion','procesos_importacion','evidencias','cursos_actividad','profesionales_actividad','informes','fragmentos_rag','actividades_plan_gestion'] LOOP
 EXECUTE format('CREATE TRIGGER integrar BEFORE INSERT OR UPDATE ON convi.%I FOR EACH ROW EXECUTE FUNCTION convi.validar_integracion()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['casos','membresias_establecimiento','asignaciones_docentes','personas','estudiantes','anios_academicos','cursos','apoderados_estudiante','reglas','planes_gestion','objetivos_plan_gestion','acciones_plan_gestion','aclaraciones_situacion','cursos_actividad','profesionales_actividad','informes','protocolos'] LOOP
 EXECUTE format('CREATE TRIGGER auditar AFTER UPDATE ON convi.%I FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio()',t);
 END LOOP;
END $$;

CREATE FUNCTION convi.aplicar_revision_compromiso() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 PERFORM 1 FROM compromisos WHERE id=NEW.compromiso_id FOR UPDATE;
 UPDATE compromisos SET estado=NEW.estado_observado,nota_cumplimiento=NEW.observacion,completado_en=CASE WHEN NEW.estado_observado='COMPLETADO' THEN NEW.registrado_en END WHERE id=NEW.compromiso_id;
 RETURN NEW;
END $$;
CREATE TRIGGER aplicar_revision AFTER INSERT ON convi.revisiones_compromisos FOR EACH ROW EXECUTE FUNCTION convi.aplicar_revision_compromiso();

-- La situación y sus estudiantes se guardan dentro de una misma transacción
CREATE FUNCTION convi.exigir_estudiante_situacion() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE sid uuid;
BEGIN
 IF TG_TABLE_NAME='situaciones' THEN sid:=NEW.id; ELSE sid:=CASE WHEN TG_OP='DELETE' THEN OLD.situacion_id ELSE NEW.situacion_id END; END IF;
 IF sid IS NOT NULL AND EXISTS(SELECT 1 FROM situaciones WHERE id=sid) AND NOT EXISTS(SELECT 1 FROM participaciones p JOIN estudiantes e ON e.persona_id=p.persona_id WHERE p.situacion_id=sid) THEN RAISE EXCEPTION 'La situación debe incluir al menos un estudiante'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER estudiante_requerido AFTER INSERT OR UPDATE ON convi.situaciones DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION convi.exigir_estudiante_situacion();
CREATE CONSTRAINT TRIGGER estudiante_requerido AFTER INSERT OR UPDATE OR DELETE ON convi.participaciones DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION convi.exigir_estudiante_situacion();

CREATE INDEX ON convi.aclaraciones_situacion (establecimiento_id,situacion_id);
CREATE INDEX ON convi.aclaraciones_situacion (profesor_destinatario_id,estado);
CREATE INDEX ON convi.informes (establecimiento_id,creado_en);
CREATE INDEX ON convi.participaciones (matricula_contexto_id);

CREATE FUNCTION convi.validar_ampliaciones() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE doc_tipo text; solicitud registros_solicitudes_ia%ROWTYPE; previo borradores_documentales_ia%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='versiones_documento' THEN
  SELECT tipo_documento INTO doc_tipo FROM documentos_institucionales WHERE id=NEW.documento_id;
  IF doc_tipo='PLANTILLA' AND NEW.incluir_en_busqueda_ia THEN RAISE EXCEPTION 'La plantilla no es fuente normativa de IA'; END IF;
  IF NOT NEW.incluir_en_busqueda_ia AND NEW.estado_procesamiento NOT IN ('PENDIENTE','NO_APLICA') THEN RAISE EXCEPTION 'El procesamiento exige una versión habilitada para búsqueda'; END IF;
  IF NEW.estado_procesamiento='FALLIDO' AND nullif(trim(NEW.detalle_error_procesamiento),'') IS NULL THEN RAISE EXCEPTION 'Explicar el error de procesamiento'; END IF;
  IF NEW.estado_procesamiento<>'FALLIDO' AND NEW.detalle_error_procesamiento IS NOT NULL THEN RAISE EXCEPTION 'El error corresponde solamente al intento fallido vigente'; END IF;
  IF TG_OP='UPDATE' AND NEW.intentos_procesamiento<OLD.intentos_procesamiento THEN RAISE EXCEPTION 'No reducir los intentos registrados'; END IF;
 ELSIF TG_TABLE_NAME='fragmentos_rag' THEN
  IF NOT EXISTS(SELECT 1 FROM versiones_documento WHERE id=NEW.version_documento_id AND incluir_en_busqueda_ia) THEN RAISE EXCEPTION 'Habilitar la versión antes de crear fragmentos'; END IF;
 ELSIF TG_TABLE_NAME='borradores_documentales_ia' THEN
  SELECT * INTO solicitud FROM registros_solicitudes_ia WHERE id=NEW.solicitud_ia_id;
  IF solicitud.estado<>'COMPLETADO' OR solicitud.codigo_proposito IS DISTINCT FROM ('BORRADOR_'||NEW.tipo_borrador) OR solicitud.caso_id IS DISTINCT FROM NEW.caso_id OR solicitud.membresia_id<>NEW.creado_por THEN RAISE EXCEPTION 'El borrador requiere solicitud IA completada del mismo autor y contexto'; END IF;
  IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.creado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Solo Convivencia crea borradores documentales'; END IF;
  IF NEW.actuacion_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM actuaciones WHERE id=NEW.actuacion_id AND caso_id=NEW.caso_id) THEN RAISE EXCEPTION 'La actuación debe pertenecer al caso del borrador'; END IF;
  IF NEW.revisado_por IS NOT NULL AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.revisado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN RAISE EXCEPTION 'Revisor de Convivencia activo requerido'; END IF;
  IF TG_OP='INSERT' THEN
   IF NEW.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Un borrador nuevo inicia pendiente de revisión'; END IF;
   NEW.creado_en:=clock_timestamp();
   IF NEW.borrador_anterior_id IS NOT NULL THEN
    SELECT * INTO previo FROM borradores_documentales_ia WHERE id=NEW.borrador_anterior_id;
    IF previo.tipo_borrador<>NEW.tipo_borrador OR previo.caso_id IS DISTINCT FROM NEW.caso_id OR previo.informe_id IS DISTINCT FROM NEW.informe_id OR previo.actuacion_id IS DISTINCT FROM NEW.actuacion_id THEN RAISE EXCEPTION 'La edición anterior debe conservar el mismo contexto'; END IF;
   END IF;
  ELSE
   IF (to_jsonb(NEW)-'estado'-'revisado_por'-'revisado_en') IS DISTINCT FROM (to_jsonb(OLD)-'estado'-'revisado_por'-'revisado_en') THEN RAISE EXCEPTION 'Conservar el texto generado, crear otro borrador para modificarlo'; END IF;
   IF OLD.estado<>'BORRADOR' THEN RAISE EXCEPTION 'La revisión documental se conserva'; END IF;
   IF NEW.estado<>'BORRADOR' THEN NEW.revisado_en:=clock_timestamp(); END IF;
  END IF;
 ELSIF TG_TABLE_NAME='casos' THEN
  IF TG_OP='INSERT' AND NEW.plazo_cierre_dias_aplicado IS NULL THEN
   SELECT plazo_cierre_dias INTO NEW.plazo_cierre_dias_aplicado FROM establecimientos WHERE id=NEW.establecimiento_id;
   IF NEW.plazo_cierre_dias_aplicado IS NOT NULL THEN NEW.fecha_limite_cierre:=NEW.fecha_inicio+NEW.plazo_cierre_dias_aplicado; END IF;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.plazo_cierre_dias_aplicado,NEW.fecha_limite_cierre) IS DISTINCT FROM (OLD.plazo_cierre_dias_aplicado,OLD.fecha_limite_cierre) AND nullif(trim(current_setting('app.motivo_cambio',true)),'') IS NULL THEN RAISE EXCEPTION 'Justificar el ajuste del plazo de cierre'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_ampliaciones BEFORE INSERT OR UPDATE ON convi.versiones_documento FOR EACH ROW EXECUTE FUNCTION convi.validar_ampliaciones();
CREATE TRIGGER validar_ampliaciones BEFORE INSERT OR UPDATE ON convi.fragmentos_rag FOR EACH ROW EXECUTE FUNCTION convi.validar_ampliaciones();
CREATE TRIGGER validar_ampliaciones BEFORE INSERT OR UPDATE ON convi.borradores_documentales_ia FOR EACH ROW EXECUTE FUNCTION convi.validar_ampliaciones();
CREATE TRIGGER validar_ampliaciones BEFORE INSERT OR UPDATE ON convi.casos FOR EACH ROW EXECUTE FUNCTION convi.validar_ampliaciones();
CREATE TRIGGER auditar AFTER UPDATE ON convi.niveles_educativos FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.borradores_documentales_ia FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.versiones_documento FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();

CREATE VIEW convi.vw_cursos_contexto_caso WITH (security_invoker=true) AS
SELECT DISTINCT p.establecimiento_id,coalesce(p.caso_id,s.caso_id,a.caso_id) caso_id,m.curso_id,m.anio_academico_id
FROM convi.participaciones p LEFT JOIN convi.situaciones s ON s.id=p.situacion_id LEFT JOIN convi.actuaciones a ON a.id=p.actuacion_id
JOIN convi.matriculas m ON m.id=p.matricula_contexto_id WHERE coalesce(p.caso_id,s.caso_id,a.caso_id) IS NOT NULL
UNION SELECT s.establecimiento_id,s.caso_id,s.curso_contexto_id,c.anio_academico_id FROM convi.situaciones s JOIN convi.cursos c ON c.id=s.curso_contexto_id WHERE caso_id IS NOT NULL;
CREATE VIEW convi.vw_situaciones_diarias WITH (security_invoker=true) AS
SELECT s.establecimiento_id,(s.ocurrido_en AT TIME ZONE e.zona_horaria)::date fecha,s.categoria_id,s.curso_contexto_id,
 count(*) cantidad FROM convi.situaciones s JOIN convi.establecimientos e ON e.id=s.establecimiento_id
GROUP BY s.establecimiento_id,(s.ocurrido_en AT TIME ZONE e.zona_horaria)::date,s.categoria_id,s.curso_contexto_id;
GRANT SELECT ON convi.vw_cursos_contexto_caso,convi.vw_situaciones_diarias TO convi_backend;

-- ===== 6. Valores de reglas, responsable de pasos, contacto con advertencia y término de protocolos y planes =====

CREATE FUNCTION convi.validar_reglas_alertas() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE r record;
BEGIN
 IF TG_TABLE_NAME='reglas' THEN
  IF NEW.categoria_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id)
   AND NOT EXISTS(SELECT 1 FROM categorias_convivencia WHERE id=NEW.categoria_id AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'La regla requiere una categoría activa'; END IF;
 ELSIF TG_TABLE_NAME='alertas' THEN
  IF TG_OP='INSERT' THEN
   SELECT * INTO r FROM reglas WHERE id=NEW.regla_id;
   IF r.estado<>'ACTIVO' THEN RAISE EXCEPTION 'Solo una regla activa genera alertas'; END IF;
   IF (r.codigo_ambito='ESTUDIANTE' AND (NEW.estudiante_id IS NULL OR NEW.curso_id IS NOT NULL OR NEW.caso_id IS NOT NULL))
    OR (r.codigo_ambito='CURSO' AND (NEW.curso_id IS NULL OR NEW.estudiante_id IS NOT NULL OR NEW.caso_id IS NOT NULL))
    OR (r.codigo_ambito='CASO' AND (NEW.caso_id IS NULL OR NEW.estudiante_id IS NOT NULL OR NEW.curso_id IS NOT NULL))
    OR (r.codigo_ambito='ESTABLECIMIENTO' AND num_nonnulls(NEW.estudiante_id,NEW.curso_id,NEW.caso_id)>0) THEN
    RAISE EXCEPTION 'La alerta debe referirse al registro que indica el ámbito de su regla'; END IF;
  ELSE
   IF (to_jsonb(NEW)-'estado'-'revisado_por'-'revisado_en'-'observacion_revision') IS DISTINCT FROM (to_jsonb(OLD)-'estado'-'revisado_por'-'revisado_en'-'observacion_revision') THEN
    RAISE EXCEPTION 'Conservar la alerta y su explicación, solo se registra su revisión'; END IF;
   IF OLD.estado<>'NUEVA' AND NEW.observacion_revision IS DISTINCT FROM OLD.observacion_revision THEN
    RAISE EXCEPTION 'La observación de una alerta revisada se conserva'; END IF;
  END IF;
  IF NEW.estado<>'NUEVA' AND (NEW.revisado_en IS NULL OR nullif(trim(NEW.observacion_revision),'') IS NULL
   OR NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.revisado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO')) THEN
   RAISE EXCEPTION 'La revisión de la alerta requiere Convivencia activa, fecha y observación de lo realizado'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_reglas_alertas BEFORE INSERT OR UPDATE ON convi.reglas FOR EACH ROW EXECUTE FUNCTION convi.validar_reglas_alertas();
CREATE TRIGGER validar_reglas_alertas BEFORE INSERT OR UPDATE ON convi.alertas FOR EACH ROW EXECUTE FUNCTION convi.validar_reglas_alertas();
CREATE TRIGGER auditar AFTER UPDATE ON convi.alertas FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();

-- Apoderado que no puede ser contactado según su vínculo con un estudiante del caso
-- El backend muestra la advertencia antes de confirmar, el profesional puede continuar y la base deja constancia en la auditoría
CREATE FUNCTION convi.apoderado_no_contactable(p_persona uuid,p_caso uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=convi,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM apoderados_estudiante a JOIN vw_casos_estudiante v ON v.estudiante_id=a.estudiante_id AND v.caso_id=p_caso
 WHERE a.persona_apoderado_id=p_persona AND NOT a.puede_ser_contactado
 AND (a.activo_desde IS NULL OR a.activo_desde<=current_date) AND (a.activo_hasta IS NULL OR a.activo_hasta>=current_date)) $$;
CREATE FUNCTION convi.registrar_contacto_con_advertencia() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF NEW.persona_destinataria_id IS NOT NULL
  AND ((NEW.tipo_comunicacion<>'CORREO' AND TG_OP='INSERT')
   OR (NEW.tipo_comunicacion='CORREO' AND NEW.confirmado_en IS NOT NULL AND (TG_OP='INSERT' OR OLD.confirmado_en IS NULL)))
  AND convi.apoderado_no_contactable(NEW.persona_destinataria_id,NEW.caso_id) THEN
  INSERT INTO eventos_auditoria(establecimiento_id,membresia_actor_id,codigo_accion,tipo_recurso,recurso_id,codigo_resultado,metadatos)
  VALUES(NEW.establecimiento_id,nullif(current_setting('app.membresia_id',true),'')::uuid,'CONTACTO_CON_ADVERTENCIA','comunicaciones',NEW.id,'OK',
   jsonb_build_object('persona_destinataria_id',NEW.persona_destinataria_id,'tipo_comunicacion',NEW.tipo_comunicacion,'advertencia','El vínculo indica que el apoderado no puede ser contactado'));
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER contacto_con_advertencia AFTER INSERT OR UPDATE ON convi.comunicaciones FOR EACH ROW EXECUTE FUNCTION convi.registrar_contacto_con_advertencia();

CREATE FUNCTION convi.validar_termino_protocolo_plan() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE actor uuid:=nullif(current_setting('app.membresia_id',true),'')::uuid;
BEGIN
 IF NEW.estado IS DISTINCT FROM OLD.estado THEN
  IF (NEW.estado IN ('COMPLETADO','CANCELADO') OR OLD.estado IN ('COMPLETADO','CANCELADO')) AND nullif(trim(current_setting('app.motivo_cambio',true)),'') IS NULL THEN
   RAISE EXCEPTION 'Indicar motivo para completar, cancelar o reabrir'; END IF;
  IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=actor AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'El término corresponde a Convivencia activa'; END IF;
  NEW.completado_en:=CASE WHEN NEW.estado='COMPLETADO' THEN clock_timestamp() END;
 ELSIF NEW.completado_en IS DISTINCT FROM OLD.completado_en THEN
  RAISE EXCEPTION 'La fecha de término se registra al completar';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_termino BEFORE UPDATE ON convi.protocolos_caso FOR EACH ROW EXECUTE FUNCTION convi.validar_termino_protocolo_plan();
CREATE TRIGGER validar_termino BEFORE UPDATE ON convi.planes_intervencion FOR EACH ROW EXECUTE FUNCTION convi.validar_termino_protocolo_plan();
CREATE TRIGGER auditar AFTER UPDATE ON convi.protocolos_caso FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();
CREATE TRIGGER auditar AFTER UPDATE ON convi.planes_intervencion FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();

-- ===== 7. Identidad técnica del motor de reglas =====

-- Las reglas de cantidad se evalúan al guardar una situación y las de vencimiento y variación una vez al día
-- El trabajador del backend asume este rol, fija app.establecimiento_id con set_config local y evalúa una escuela por transacción
-- El rol no tiene contraseña ni LOGIN, no es una persona, no simula una sesión con segundo factor y no se entrega al navegador
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='convi_motor_reglas') THEN CREATE ROLE convi_motor_reglas NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA convi TO convi_motor_reglas;

-- Contexto válido del motor, escuela indicada y activa, el propietario debe ser el de instalación
CREATE FUNCTION convi.motor_contexto_valido() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=convi,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM establecimientos WHERE id=convi.establecimiento_actual() AND estado='ACTIVO') $$;

-- Solo las columnas necesarias para contar, sin descripciones, nombres ni datos de contacto
GRANT SELECT (id, estado, zona_horaria) ON convi.establecimientos TO convi_motor_reglas;
GRANT SELECT ON convi.reglas TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, estado) ON convi.categorias_convivencia TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, ocurrido_en, categoria_id, curso_contexto_id, estado, caso_id) ON convi.situaciones TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, persona_id, situacion_id, caso_id, matricula_contexto_id) ON convi.participaciones TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, persona_id) ON convi.estudiantes TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, estudiante_id, curso_id, anio_academico_id, matriculado_en, finalizado_en) ON convi.matriculas TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, anio_academico_id) ON convi.cursos TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, estado_actual, asignado_a_membresia_id) ON convi.casos TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, caso_id, vence_en, estado) ON convi.compromisos TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, caso_id, tipo_actuacion, estado, programado_en) ON convi.actuaciones TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, caso_id, estado) ON convi.planes_intervencion TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, plan_intervencion_id, vence_en, estado) ON convi.acciones_plan_intervencion TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, caso_id, estado) ON convi.protocolos_caso TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, protocolo_caso_id, estado, vence_en) ON convi.estados_pasos_protocolo_caso TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, codigo_perfil, estado) ON convi.membresias_establecimiento TO convi_motor_reglas;
GRANT SELECT, INSERT ON convi.alertas, convi.situaciones_alerta TO convi_motor_reglas;
GRANT SELECT (id, establecimiento_id, membresia_destinatario_id, clave_evento), INSERT ON convi.notificaciones TO convi_motor_reglas;
GRANT INSERT ON convi.eventos_auditoria TO convi_motor_reglas;

-- Aislamiento por escuela para el motor, igual que aislamiento_backend pero sin sesión de usuario
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reglas','categorias_convivencia','situaciones','participaciones','estudiantes','matriculas','cursos','casos','compromisos','actuaciones','planes_intervencion','acciones_plan_intervencion','protocolos_caso','estados_pasos_protocolo_caso','membresias_establecimiento','alertas','situaciones_alerta','notificaciones','eventos_auditoria'] LOOP
  EXECUTE format('CREATE POLICY aislamiento_motor ON convi.%I TO convi_motor_reglas USING (establecimiento_id=convi.establecimiento_actual() AND convi.motor_contexto_valido()) WITH CHECK (establecimiento_id=convi.establecimiento_actual() AND convi.motor_contexto_valido())',t);
 END LOOP;
END $$;
CREATE POLICY aislamiento_motor ON convi.establecimientos TO convi_motor_reglas USING (id=convi.establecimiento_actual() AND convi.motor_contexto_valido());

-- ===== 8. Flujo del caso, alertas, avisos, Plan de Gestión y contexto de la IA =====

-- Flujo de estados del caso, atención de alertas, catálogo de avisos, Plan de Gestión, fechas reales de actividades y contexto de la IA
-- Decisiones del equipo: los avisos internos son solo para Convivencia y el Plan de Gestión lo aprueba Convivencia

-- Flujo de estados del caso
-- Desde la intervención o el seguimiento se vuelve a revisión, no a análisis; un caso cerrado solo se reabre
CREATE FUNCTION convi.transicion_caso_permitida(p_desde text,p_hasta text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT (p_desde,p_hasta) IN (
  ('EN_ANALISIS','EN_REVISION'),('EN_ANALISIS','EN_INTERVENCION'),('EN_ANALISIS','EN_SEGUIMIENTO'),('EN_ANALISIS','CERRADO'),
  ('EN_REVISION','EN_ANALISIS'),('EN_REVISION','EN_INTERVENCION'),('EN_REVISION','EN_SEGUIMIENTO'),('EN_REVISION','CERRADO'),
  ('EN_INTERVENCION','EN_REVISION'),('EN_INTERVENCION','EN_SEGUIMIENTO'),('EN_INTERVENCION','CERRADO'),
  ('EN_SEGUIMIENTO','EN_REVISION'),('EN_SEGUIMIENTO','EN_INTERVENCION'),('EN_SEGUIMIENTO','CERRADO'),
  ('CERRADO','REABIERTO'),
  ('REABIERTO','EN_ANALISIS'),('REABIERTO','EN_REVISION'),('REABIERTO','EN_INTERVENCION'),('REABIERTO','EN_SEGUIMIENTO'),('REABIERTO','CERRADO')) $$;
CREATE FUNCTION convi.validar_transicion_caso() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF NOT coalesce(convi.transicion_caso_permitida(NEW.estado_anterior,NEW.estado_nuevo),false) THEN
  RAISE EXCEPTION 'Cambio de estado no permitido de % a %',NEW.estado_anterior,NEW.estado_nuevo; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_transicion BEFORE INSERT ON convi.historial_estados_caso FOR EACH ROW EXECUTE FUNCTION convi.validar_transicion_caso();

CREATE FUNCTION convi.validar_notificacion() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE actor uuid:=nullif(current_setting('app.membresia_id',true),'')::uuid;
BEGIN
 IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.membresia_destinatario_id AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN
  RAISE EXCEPTION 'Los avisos solo se envían a cuentas activas de Convivencia'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-'leido_en') IS DISTINCT FROM (to_jsonb(OLD)-'leido_en') THEN
   RAISE EXCEPTION 'Del aviso solo se registra su lectura'; END IF;
  IF OLD.leido_en IS NOT NULL AND NEW.leido_en IS DISTINCT FROM OLD.leido_en THEN
   RAISE EXCEPTION 'La fecha de lectura se conserva'; END IF;
  IF actor IS NOT NULL AND actor<>NEW.membresia_destinatario_id THEN
   RAISE EXCEPTION 'Solo la persona destinataria marca el aviso como leído'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_notificacion BEFORE INSERT OR UPDATE ON convi.notificaciones FOR EACH ROW EXECUTE FUNCTION convi.validar_notificacion();

CREATE FUNCTION convi.validar_plan_gestion() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE pl record; responsable uuid; ahora timestamptz:=clock_timestamp();
BEGIN
 IF TG_TABLE_NAME='planes_gestion' THEN
  IF NEW.aprobado_por IS NOT NULL AND (TG_OP='INSERT' OR NEW.aprobado_por IS DISTINCT FROM OLD.aprobado_por)
   AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.aprobado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'La aprobación del plan corresponde a un profesional de Convivencia activo'; END IF;
  IF NEW.aprobado_en > ahora THEN RAISE EXCEPTION 'La fecha de aprobación no puede ser futura'; END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.estado IS DISTINCT FROM OLD.estado AND (OLD.estado,NEW.estado) NOT IN (('BORRADOR','ACTIVO'),('BORRADOR','ARCHIVADO'),('ACTIVO','COMPLETADO'),('ACTIVO','ARCHIVADO'),('COMPLETADO','ARCHIVADO')) THEN
    RAISE EXCEPTION 'Cambio de estado del plan no permitido de % a %',OLD.estado,NEW.estado; END IF;
   IF OLD.aprobado_en IS NOT NULL AND (NEW.aprobado_en,NEW.aprobado_por) IS DISTINCT FROM (OLD.aprobado_en,OLD.aprobado_por) THEN
    RAISE EXCEPTION 'La aprobación registrada se conserva'; END IF;
   IF OLD.estado<>'BORRADOR' AND (NEW.nombre,NEW.anio_academico_id) IS DISTINCT FROM (OLD.nombre,OLD.anio_academico_id) THEN
    RAISE EXCEPTION 'Un plan aprobado conserva su nombre y año'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 -- Objetivos, acciones y actividades no cambian en un plan completado o archivado
 IF TG_TABLE_NAME='objetivos_plan_gestion' THEN
  SELECT p.* INTO pl FROM planes_gestion p WHERE p.id=NEW.plan_gestion_id;
 ELSIF TG_TABLE_NAME='acciones_plan_gestion' THEN
  SELECT p.* INTO pl FROM planes_gestion p JOIN objetivos_plan_gestion o ON o.plan_gestion_id=p.id WHERE o.id=NEW.objetivo_id;
 ELSE
  SELECT p.* INTO pl FROM planes_gestion p JOIN objetivos_plan_gestion o ON o.plan_gestion_id=p.id JOIN acciones_plan_gestion a ON a.objetivo_id=o.id WHERE a.id=NEW.accion_plan_id;
 END IF;
 IF pl.estado IN ('COMPLETADO','ARCHIVADO') THEN RAISE EXCEPTION 'El plan % no admite cambios',lower(pl.estado); END IF;
 -- Cada bloque lee solo campos que existen en su tabla
 IF TG_TABLE_NAME IN ('acciones_plan_gestion','actividades_plan_gestion') THEN
  responsable:=NEW.persona_responsable_id;
  IF responsable IS NOT NULL AND (TG_OP='INSERT' OR responsable IS DISTINCT FROM OLD.persona_responsable_id) THEN
   IF NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE persona_id=responsable AND establecimiento_id=NEW.establecimiento_id AND codigo_perfil IN ('ADMIN','CONVIVENCIA','PROFESOR') AND estado='ACTIVO') THEN
    RAISE EXCEPTION 'El responsable debe ser una persona del equipo con cuenta activa'; END IF;
  END IF;
  IF NEW.completado_en > ahora THEN RAISE EXCEPTION 'La fecha de cumplimiento no puede ser futura'; END IF;
 END IF;
 IF TG_TABLE_NAME='acciones_plan_gestion' THEN
  IF NEW.estado='COMPLETADO' AND (TG_OP='INSERT' OR OLD.estado<>'COMPLETADO') THEN
   IF EXISTS(SELECT 1 FROM actividades_plan_gestion WHERE accion_plan_id=NEW.id AND estado IN ('PLANIFICADO','EN_PROGRESO')) THEN
    RAISE EXCEPTION 'Completar o cancelar las actividades pendientes antes de completar la acción'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='actividades_plan_gestion' THEN
  IF NEW.inicio_real > ahora OR NEW.fin_real > ahora THEN RAISE EXCEPTION 'Las fechas reales de la actividad no pueden ser futuras'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_plan BEFORE INSERT OR UPDATE ON convi.planes_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_plan_gestion();
CREATE TRIGGER validar_plan BEFORE INSERT OR UPDATE ON convi.objetivos_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_plan_gestion();
CREATE TRIGGER validar_plan BEFORE INSERT OR UPDATE ON convi.acciones_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_plan_gestion();
CREATE TRIGGER validar_plan BEFORE INSERT OR UPDATE ON convi.actividades_plan_gestion FOR EACH ROW EXECUTE FUNCTION convi.validar_plan_gestion();

CREATE FUNCTION convi.conservar_contexto_ia() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF (NEW.membresia_id,NEW.caso_id,NEW.codigo_proposito,NEW.alerta_id,NEW.contexto_explicacion,NEW.iniciado_en)
  IS DISTINCT FROM (OLD.membresia_id,OLD.caso_id,OLD.codigo_proposito,OLD.alerta_id,OLD.contexto_explicacion,OLD.iniciado_en) THEN
  RAISE EXCEPTION 'Se conserva el contexto que recibió la IA, solo se registra el resultado de la solicitud'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER conservar_contexto BEFORE UPDATE ON convi.registros_solicitudes_ia FOR EACH ROW EXECUTE FUNCTION convi.conservar_contexto_ia();

-- ===== 9. Registro, invitaciones y reglas de la revisión completa de las historias =====

-- Cada bloque indica la historia que lo necesita, el resto del comportamiento sigue en el backend según el contrato 16

CREATE FUNCTION convi.validar_membresia() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 -- HU-009 solo un administrador activo de la escuela invita
 IF NEW.invitado_por IS NOT NULL AND (TG_OP='INSERT' OR NEW.invitado_por IS DISTINCT FROM OLD.invitado_por)
  AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.invitado_por AND codigo_perfil='ADMIN' AND estado='ACTIVO') THEN
  RAISE EXCEPTION 'Solo un administrador activo invita cuentas'; END IF;
 IF TG_OP='UPDATE' THEN
  -- HU-009 y HU-003 el perfil asignado no cambia, otro perfil requiere otra cuenta con otro correo
  IF NEW.codigo_perfil IS DISTINCT FROM OLD.codigo_perfil THEN
   RAISE EXCEPTION 'El perfil de una cuenta no cambia, otro perfil requiere otra cuenta con otro correo'; END IF;
  -- HU-132 reactivar una cuenta suspendida exige motivo, la auditoría guarda el estado anterior
  IF OLD.estado='SUSPENDIDO' AND NEW.estado='ACTIVO' AND nullif(trim(current_setting('app.motivo_cambio',true)),'') IS NULL THEN
   RAISE EXCEPTION 'Indicar motivo para reactivar la cuenta'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_membresia BEFORE INSERT OR UPDATE ON convi.membresias_establecimiento FOR EACH ROW EXECUTE FUNCTION convi.validar_membresia();

-- Registro del primer administrador y activación de invitaciones
-- La persona todavía no tiene una cuenta activa, por eso no puede pasar la RLS del backend
-- Una identidad técnica limitada a estas dos operaciones las ejecuta, el propietario de las funciones debe ser el de instalación
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='convi_registro') THEN CREATE ROLE convi_registro NOLOGIN NOBYPASSRLS; END IF; END $$;
GRANT USAGE ON SCHEMA convi TO convi_registro;

-- HU-001 y HU-002 crea escuela, ficha y cuenta Administrador en una transacción, solo con el correo verificado
-- Reintentar con la misma identidad devuelve la misma escuela y no crea otra
CREATE FUNCTION convi.registrar_primer_administrador(p_auth_usuario_id uuid,p_nombres text,p_apellidos text,p_telefono text,p_nombre_escuela text,
 p_codigo text DEFAULT NULL,p_region text DEFAULT NULL,p_comuna text DEFAULT NULL,p_direccion text DEFAULT NULL,p_telefono_escuela text DEFAULT NULL,
 p_correo_contacto text DEFAULT NULL,p_zona_horaria text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=convi,pg_temp AS $$
DECLARE correo text; verificado timestamptz; m record; escuela uuid; persona uuid; zona text:=coalesce(nullif(trim(p_zona_horaria),''),'America/Santiago');
BEGIN
 SELECT u.email,u.email_confirmed_at INTO correo,verificado FROM auth.users u WHERE u.id=p_auth_usuario_id;
 IF correo IS NULL OR verificado IS NULL THEN RAISE EXCEPTION 'Verificar el correo antes de crear la escuela'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('registro:'||p_auth_usuario_id::text));
 SELECT * INTO m FROM membresias_establecimiento WHERE auth_usuario_id=p_auth_usuario_id;
 IF FOUND THEN
  IF m.codigo_perfil='ADMIN' AND m.invitado_por IS NULL THEN RETURN m.establecimiento_id; END IF;
  RAISE EXCEPTION 'Esta identidad ya tiene una cuenta en CONVI, usar otro correo';
 END IF;
 IF nullif(trim(p_nombre_escuela),'') IS NULL OR nullif(trim(p_nombres),'') IS NULL OR nullif(trim(p_apellidos),'') IS NULL THEN
  RAISE EXCEPTION 'Indicar nombre de la escuela, nombres y apellidos'; END IF;
 INSERT INTO establecimientos(nombre,codigo,region,comuna,direccion,telefono,correo_contacto,zona_horaria)
  VALUES(trim(p_nombre_escuela),nullif(trim(p_codigo),''),nullif(trim(p_region),''),nullif(trim(p_comuna),''),nullif(trim(p_direccion),''),
   nullif(trim(p_telefono_escuela),''),nullif(trim(p_correo_contacto),''),zona) RETURNING id INTO escuela;
 INSERT INTO personas(establecimiento_id,nombres,apellidos,correo,telefono)
  VALUES(escuela,trim(p_nombres),trim(p_apellidos),correo,nullif(trim(p_telefono),'')) RETURNING id INTO persona;
 INSERT INTO membresias_establecimiento(establecimiento_id,persona_id,codigo_perfil,estado,auth_usuario_id,activado_en,correo_invitacion)
  VALUES(escuela,persona,'ADMIN','ACTIVO',p_auth_usuario_id,clock_timestamp(),correo);
 INSERT INTO eventos_auditoria(establecimiento_id,codigo_accion,tipo_recurso,recurso_id,codigo_resultado)
  VALUES(escuela,'REGISTRO_ESTABLECIMIENTO','establecimientos',escuela,'OK');
 RETURN escuela;
END $$;

-- HU-003 y HU-026 vincula la identidad verificada a la cuenta pendiente que creó el administrador, sin cambiar escuela, persona ni perfil
-- El enlace de la invitación lleva el identificador de la cuenta, el correo verificado debe coincidir con el invitado
CREATE FUNCTION convi.activar_invitacion(p_membresia_id uuid,p_auth_usuario_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=convi,pg_temp AS $$
DECLARE correo text; verificado timestamptz; m record;
BEGIN
 SELECT u.email,u.email_confirmed_at INTO correo,verificado FROM auth.users u WHERE u.id=p_auth_usuario_id;
 IF correo IS NULL OR verificado IS NULL THEN RAISE EXCEPTION 'La identidad debe tener el correo verificado'; END IF;
 SELECT * INTO m FROM membresias_establecimiento WHERE id=p_membresia_id FOR UPDATE;
 IF NOT FOUND OR lower(m.correo_invitacion)<>lower(correo) THEN RAISE EXCEPTION 'La invitación no corresponde a este correo'; END IF;
 IF m.estado='ACTIVO' AND m.auth_usuario_id=p_auth_usuario_id THEN RETURN m.establecimiento_id; END IF;
 IF m.estado<>'PENDIENTE' OR m.auth_usuario_id IS NOT NULL THEN RAISE EXCEPTION 'La invitación ya fue usada o no está vigente'; END IF;
 IF EXISTS(SELECT 1 FROM membresias_establecimiento WHERE auth_usuario_id=p_auth_usuario_id) THEN RAISE EXCEPTION 'Esta identidad ya tiene una cuenta en CONVI, usar otro correo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM establecimientos WHERE id=m.establecimiento_id AND estado='ACTIVO') THEN RAISE EXCEPTION 'La escuela no está activa'; END IF;
 UPDATE membresias_establecimiento SET auth_usuario_id=p_auth_usuario_id,estado='ACTIVO',activado_en=clock_timestamp() WHERE id=m.id;
 RETURN m.establecimiento_id;
END $$;

-- Escuela: auditoría, fecha de actualización, datos que no cambian y zona horaria válida
-- HU-021 y HU-022 cada cambio queda auditado, HU-022 el identificador y la fecha de incorporación no cambian, HU-032 la fecha de término de la guía se conserva
CREATE FUNCTION convi.validar_establecimiento() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 PERFORM clock_timestamp() AT TIME ZONE NEW.zona_horaria;
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.creado_en IS DISTINCT FROM OLD.creado_en THEN RAISE EXCEPTION 'Conservar identificador y fecha de incorporación de la escuela'; END IF;
  IF OLD.onboarding_completado_en IS NOT NULL AND NEW.onboarding_completado_en IS DISTINCT FROM OLD.onboarding_completado_en THEN
   RAISE EXCEPTION 'La fecha en que terminó la guía inicial se conserva'; END IF;
  IF (to_jsonb(NEW)-'actualizado_en') IS DISTINCT FROM (to_jsonb(OLD)-'actualizado_en') THEN NEW.actualizado_en:=clock_timestamp(); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validar_escuela BEFORE INSERT OR UPDATE ON convi.establecimientos FOR EACH ROW EXECUTE FUNCTION convi.validar_establecimiento();
CREATE FUNCTION convi.auditar_establecimiento() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 INSERT INTO eventos_auditoria(establecimiento_id,membresia_actor_id,codigo_accion,tipo_recurso,recurso_id,codigo_resultado,metadatos)
 VALUES(NEW.id,nullif(current_setting('app.membresia_id',true),'')::uuid,'MODIFICACION','establecimientos',NEW.id,'OK',
  jsonb_build_object('antes',to_jsonb(OLD),'despues',to_jsonb(NEW),'motivo',nullif(current_setting('app.motivo_cambio',true),'')));
 RETURN NEW;
END $$;
CREATE TRIGGER auditar AFTER UPDATE ON convi.establecimientos FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_establecimiento();


CREATE FUNCTION convi.validar_revision_completa() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE motivo text:=nullif(trim(current_setting('app.motivo_cambio',true)),''); ahora timestamptz:=clock_timestamp(); x record; estado_anio text; anterior text;
BEGIN
 IF TG_TABLE_NAME='estudiantes' THEN
  -- HU-016 la ficha del estudiante no pasa a otra persona
  IF TG_OP='UPDATE' AND NEW.persona_id IS DISTINCT FROM OLD.persona_id THEN RAISE EXCEPTION 'La ficha del estudiante no se asigna a otra persona'; END IF;

 ELSIF TG_TABLE_NAME IN ('cursos','asignaciones_docentes') THEN
  -- HU-012 un nivel desactivado no se ofrece para cursos nuevos
  IF TG_TABLE_NAME='cursos' THEN
   IF NEW.nivel_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.nivel_id IS DISTINCT FROM OLD.nivel_id) AND NOT EXISTS(SELECT 1 FROM niveles_educativos WHERE id=NEW.nivel_id AND activo) THEN
    RAISE EXCEPTION 'El nivel está desactivado y no se ofrece para cursos nuevos'; END IF;
   SELECT estado INTO estado_anio FROM anios_academicos WHERE id=NEW.anio_academico_id;
   IF TG_OP='UPDATE' AND estado_anio<>'CERRADO' THEN SELECT estado INTO estado_anio FROM anios_academicos WHERE id=OLD.anio_academico_id; END IF;
  ELSE
   SELECT a.estado INTO estado_anio FROM cursos c JOIN anios_academicos a ON a.id=c.anio_academico_id WHERE c.id=NEW.curso_id;
  END IF;
  -- HU-018 un año cerrado no admite cambios ordinarios en cursos ni asignaciones, una corrección exige motivo y queda auditada
  IF estado_anio='CERRADO' THEN
   IF motivo IS NULL THEN RAISE EXCEPTION 'El año académico está cerrado, una corrección requiere motivo'; END IF;
   IF TG_OP='INSERT' THEN
    INSERT INTO eventos_auditoria(establecimiento_id,membresia_actor_id,codigo_accion,tipo_recurso,recurso_id,codigo_resultado,metadatos)
    VALUES(NEW.establecimiento_id,nullif(current_setting('app.membresia_id',true),'')::uuid,'CORRECCION_ANIO_CERRADO',TG_TABLE_NAME,NEW.id,'OK',
     jsonb_build_object('despues',to_jsonb(NEW),'motivo',motivo));
   END IF;
  END IF;

 ELSIF TG_TABLE_NAME='situaciones' THEN
  -- HU-023 una categoría inactiva no se ofrece para nuevas situaciones
  IF NEW.categoria_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.categoria_id IS DISTINCT FROM OLD.categoria_id)
   AND NOT EXISTS(SELECT 1 FROM categorias_convivencia WHERE id=NEW.categoria_id AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'La categoría está inactiva y no se ofrece para nuevas situaciones'; END IF;

 ELSIF TG_TABLE_NAME='revisiones_convivencia' THEN
  IF NEW.tipo_revision='DECISION' THEN
   SELECT * INTO x FROM situaciones WHERE id=NEW.situacion_id;
   -- HU-045 una situación vinculada a un caso no se traslada a otro caso ni se desvincula
   IF x.estado='VINCULADA_CASO' THEN RAISE EXCEPTION 'Una situación vinculada a un caso no se traslada ni se desvincula'; END IF;
   -- HU-045 solo se vincula a un caso que comparte al menos un estudiante con la situación
   IF NEW.resultado='VINCULADA_CASO' AND NOT EXISTS(
    SELECT 1 FROM participaciones ps JOIN estudiantes e ON e.persona_id=ps.persona_id
    WHERE ps.situacion_id=NEW.situacion_id AND (
     EXISTS(SELECT 1 FROM participaciones pc WHERE pc.caso_id=NEW.caso_destino_id AND pc.persona_id=ps.persona_id)
     OR EXISTS(SELECT 1 FROM participaciones po JOIN situaciones so ON so.id=po.situacion_id WHERE so.caso_id=NEW.caso_destino_id AND po.persona_id=ps.persona_id))) THEN
    RAISE EXCEPTION 'El caso debe compartir al menos un estudiante con la situación'; END IF;
  END IF;

 ELSIF TG_TABLE_NAME='casos' THEN
  -- HU-046 y HU-065 solo un profesional de Convivencia activo abre casos
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.abierto_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'El caso lo abre un profesional de Convivencia activo'; END IF;

 ELSIF TG_TABLE_NAME='protocolos_caso' THEN
  -- HU-071 el protocolo lo aplica un profesional de Convivencia activo
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.aplicado_por AND codigo_perfil='CONVIVENCIA' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'El protocolo lo aplica un profesional de Convivencia activo'; END IF;

 ELSIF TG_TABLE_NAME='actuaciones' THEN
  -- HU-055 la base rechaza fechas reales futuras
  IF NEW.realizado_en > ahora OR NEW.fin_real_en > ahora THEN RAISE EXCEPTION 'Las fechas reales no pueden ser futuras'; END IF;
  IF TG_OP='UPDATE' THEN
   -- HU-060 un resultado ya registrado no se sobrescribe, corregirlo exige motivo
   IF OLD.estado='REALIZADA' AND (NEW.estado,NEW.resultado,NEW.realizado_en,NEW.fin_real_en,NEW.proxima_accion) IS DISTINCT FROM (OLD.estado,OLD.resultado,OLD.realizado_en,OLD.fin_real_en,OLD.proxima_accion)
    AND motivo IS NULL THEN RAISE EXCEPTION 'La actuación ya fue realizada, corregir su resultado requiere motivo'; END IF;
   IF (to_jsonb(NEW)-'actualizado_en') IS DISTINCT FROM (to_jsonb(OLD)-'actualizado_en') THEN NEW.actualizado_en:=ahora; END IF;
  END IF;

 ELSIF TG_TABLE_NAME='acciones_plan_intervencion' THEN
  -- HU-054 la fecha de cumplimiento no puede ser futura y corregir una acción exige motivo
  IF NEW.completado_en > ahora THEN RAISE EXCEPTION 'La fecha de cumplimiento no puede ser futura'; END IF;
  IF TG_OP='UPDATE' AND motivo IS NULL AND ((NEW.descripcion,NEW.persona_responsable_id,NEW.vence_en) IS DISTINCT FROM (OLD.descripcion,OLD.persona_responsable_id,OLD.vence_en)
   OR (OLD.estado='COMPLETADO' AND (NEW.estado,NEW.notas,NEW.completado_en) IS DISTINCT FROM (OLD.estado,OLD.notas,OLD.completado_en))) THEN
   RAISE EXCEPTION 'Indicar motivo para corregir la acción'; END IF;

 ELSIF TG_TABLE_NAME='acciones_plan_gestion' THEN
  IF TG_OP='UPDATE' THEN
   -- HU-084 corregir lo planificado o un resultado ya registrado exige motivo, la auditoría guarda el valor anterior y el nuevo
   IF motivo IS NULL AND ((NEW.objetivo_id,NEW.titulo,NEW.descripcion,NEW.persona_responsable_id,NEW.publico_objetivo,NEW.evidencia_esperada,NEW.nombre_indicador,NEW.unidad_indicador,NEW.meta_indicador)
     IS DISTINCT FROM (OLD.objetivo_id,OLD.titulo,OLD.descripcion,OLD.persona_responsable_id,OLD.publico_objetivo,OLD.evidencia_esperada,OLD.nombre_indicador,OLD.unidad_indicador,OLD.meta_indicador)
    OR (OLD.estado='COMPLETADO' AND (NEW.estado,NEW.resumen_resultado,NEW.completado_en,NEW.valor_indicador) IS DISTINCT FROM (OLD.estado,OLD.resumen_resultado,OLD.completado_en,OLD.valor_indicador))) THEN
    RAISE EXCEPTION 'Indicar motivo para corregir la acción del Plan'; END IF;
   IF (to_jsonb(NEW)-'actualizado_en') IS DISTINCT FROM (to_jsonb(OLD)-'actualizado_en') THEN NEW.actualizado_en:=ahora; END IF;
  END IF;

 ELSIF TG_TABLE_NAME='actividades_plan_gestion' THEN
  -- HU-085 una actividad empieza Planificada
  IF TG_OP='INSERT' AND NEW.estado<>'PLANIFICADO' THEN RAISE EXCEPTION 'Una actividad nueva empieza planificada'; END IF;
  IF TG_OP='UPDATE' AND motivo IS NULL THEN
   -- HU-135 reprogramar, cambiar lugar o responsable, o cancelar exige motivo
   IF (NEW.inicio_programado,NEW.fin_programado,NEW.lugar,NEW.persona_responsable_id) IS DISTINCT FROM (OLD.inicio_programado,OLD.fin_programado,OLD.lugar,OLD.persona_responsable_id)
    OR (NEW.estado='CANCELADO' AND OLD.estado<>'CANCELADO') THEN RAISE EXCEPTION 'Indicar motivo para reprogramar o cancelar la actividad'; END IF;
   -- HU-090 corregir un resultado ya registrado exige motivo
   IF OLD.estado='COMPLETADO' AND (NEW.estado,NEW.resumen_resultado,NEW.completado_en,NEW.inicio_real,NEW.fin_real) IS DISTINCT FROM (OLD.estado,OLD.resumen_resultado,OLD.completado_en,OLD.inicio_real,OLD.fin_real) THEN
    RAISE EXCEPTION 'Indicar motivo para corregir el resultado de la actividad'; END IF;
  END IF;

 ELSIF TG_TABLE_NAME='accesos_apoderado' THEN
  -- HU-099 el administrador activo otorga, renueva y revoca el acceso
  IF (TG_OP='INSERT' OR NEW.otorgado_por IS DISTINCT FROM OLD.otorgado_por)
   AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.otorgado_por AND codigo_perfil='ADMIN' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'El acceso del apoderado lo otorga un administrador activo'; END IF;
  IF NEW.revocado_por IS NOT NULL AND (TG_OP='INSERT' OR NEW.revocado_por IS DISTINCT FROM OLD.revocado_por)
   AND NOT EXISTS(SELECT 1 FROM membresias_establecimiento WHERE id=NEW.revocado_por AND codigo_perfil='ADMIN' AND estado='ACTIVO') THEN
   RAISE EXCEPTION 'El acceso del apoderado lo revoca un administrador activo'; END IF;

 ELSIF TG_TABLE_NAME='procesos_importacion' THEN
  IF TG_OP='INSERT' AND NEW.estado<>'CARGADO' THEN RAISE EXCEPTION 'Una importación nueva empieza cargada'; END IF;
  IF TG_OP='UPDATE' THEN
   -- HU-020 una importación confirmada no cambia
   IF OLD.estado='CONFIRMADO' AND (to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN RAISE EXCEPTION 'Una importación confirmada no cambia'; END IF;
   -- HU-019 y HU-020 una importación parcial sigue en revisión: queda Confirmada solo cuando todas sus filas fueron confirmadas u omitidas
   IF NEW.estado='CONFIRMADO' AND OLD.estado<>'CONFIRMADO'
    AND EXISTS(SELECT 1 FROM filas_importacion WHERE proceso_importacion_id=NEW.id AND estado NOT IN ('CONFIRMADO','OMITIDO')) THEN
    RAISE EXCEPTION 'Quedan filas por corregir u omitir, la importación sigue en revisión'; END IF;
   -- HU-019 un proceso cancelado no se procesa, corrige ni confirma
   IF OLD.estado='CANCELADO' AND NEW.estado='CANCELADO' AND (to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)) THEN RAISE EXCEPTION 'Un proceso cancelado no se modifica'; END IF;
   IF NEW.estado='CANCELADO' AND OLD.estado<>'CANCELADO' THEN
    -- HU-019 cancelar exige motivo y que no haya filas confirmadas
    IF motivo IS NULL THEN RAISE EXCEPTION 'Indicar motivo para cancelar la importación'; END IF;
    IF EXISTS(SELECT 1 FROM filas_importacion WHERE proceso_importacion_id=NEW.id AND estado='CONFIRMADO') THEN RAISE EXCEPTION 'No se cancela una importación con filas confirmadas'; END IF;
   END IF;
   IF OLD.estado='CANCELADO' AND NEW.estado<>'CANCELADO' THEN
    -- HU-019 restaurar devuelve el estado anterior registrado en la auditoría e indica motivo
    SELECT e.metadatos->'antes'->>'estado' INTO anterior FROM eventos_auditoria e
    WHERE e.tipo_recurso='procesos_importacion' AND e.recurso_id=NEW.id AND e.metadatos->'despues'->>'estado'='CANCELADO' ORDER BY e.ocurrido_en DESC,e.id DESC LIMIT 1;
    IF motivo IS NULL OR NEW.estado IS DISTINCT FROM anterior THEN RAISE EXCEPTION 'Un proceso cancelado solo se restaura a su estado anterior indicando motivo'; END IF;
   END IF;
  END IF;

 ELSIF TG_TABLE_NAME='filas_importacion' THEN
  -- HU-019 y HU-020 las filas de un proceso cancelado o confirmado no cambian, el bloqueo evita confirmar mientras se cancela
  SELECT estado INTO x FROM procesos_importacion WHERE id=NEW.proceso_importacion_id FOR SHARE;
  IF x.estado IN ('CANCELADO','CONFIRMADO') THEN RAISE EXCEPTION 'El proceso está cancelado o confirmado, sus filas no cambian'; END IF;
  -- HU-020 una fila confirmada no se vuelve a procesar y solo se confirman filas válidas o con advertencia
  IF TG_OP='UPDATE' AND OLD.estado='CONFIRMADO' THEN RAISE EXCEPTION 'Una fila confirmada no se vuelve a procesar'; END IF;
  IF NEW.estado='CONFIRMADO' AND (TG_OP='INSERT' OR OLD.estado NOT IN ('VALIDO','ADVERTENCIA')) THEN RAISE EXCEPTION 'Solo se confirman filas válidas o con advertencia'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['estudiantes','cursos','asignaciones_docentes','situaciones','revisiones_convivencia','casos','protocolos_caso','actuaciones',
  'acciones_plan_intervencion','acciones_plan_gestion','actividades_plan_gestion','accesos_apoderado','procesos_importacion','filas_importacion'] LOOP
  EXECUTE format('CREATE TRIGGER revision_completa BEFORE INSERT OR UPDATE ON convi.%I FOR EACH ROW EXECUTE FUNCTION convi.validar_revision_completa()',t);
 END LOOP;
END $$;
-- HU-019 la auditoría del proceso conserva estado anterior, nuevo y motivo
CREATE TRIGGER auditar AFTER UPDATE ON convi.procesos_importacion FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION convi.auditar_cambio();

-- HU-042 al responder la última aclaración pendiente, la situación vuelve a En revisión
CREATE FUNCTION convi.reanudar_revision_situacion() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
BEGIN
 IF NEW.estado='RESPONDIDA' AND OLD.estado='PENDIENTE'
  AND NOT EXISTS(SELECT 1 FROM aclaraciones_situacion WHERE situacion_id=NEW.situacion_id AND estado='PENDIENTE') THEN
  UPDATE situaciones SET estado='EN_REVISION' WHERE id=NEW.situacion_id AND estado='INFORMACION_SOLICITADA';
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER reanudar_revision AFTER UPDATE ON convi.aclaraciones_situacion FOR EACH ROW EXECUTE FUNCTION convi.reanudar_revision_situacion();

-- ===== Códigos legibles =====

-- HU-035 y HU-046 la situación y el caso reciben un código legible y correlativo por escuela y año, por ejemplo SIT-2026-00001 y CASO-2026-00001
-- HU-030 y HU-105 una regla o un protocolo sin código (guía inicial o propuesta de la IA) recibe REGLA-001 o PROT-001
-- Si el backend envía un código, por ejemplo el folio de un caso antiguo, se conserva; el identificador interno sigue siendo el uuid
CREATE FUNCTION convi.asignar_codigo_legible() RETURNS trigger LANGUAGE plpgsql SET search_path=convi,pg_temp AS $$
DECLARE prefijo text; anio text; siguiente integer; zona text;
BEGIN
 IF TG_TABLE_NAME='reglas' THEN
  IF nullif(trim(NEW.codigo_regla),'') IS NOT NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('codigo:reglas:'||NEW.establecimiento_id::text));
  SELECT coalesce(max(substring(codigo_regla from '^REGLA-([0-9]+)$')::integer),0)+1 INTO siguiente FROM reglas WHERE establecimiento_id=NEW.establecimiento_id;
  NEW.codigo_regla:='REGLA-'||lpad(siguiente::text,3,'0');
  RETURN NEW;
 END IF;
 IF nullif(trim(NEW.codigo),'') IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='protocolos' THEN
  prefijo:='PROT-';
 ELSE
  SELECT zona_horaria INTO zona FROM establecimientos WHERE id=NEW.establecimiento_id;
  anio:=to_char(clock_timestamp() AT TIME ZONE coalesce(zona,'America/Santiago'),'YYYY');
  prefijo:=CASE TG_TABLE_NAME WHEN 'situaciones' THEN 'SIT-' ELSE 'CASO-' END||anio||'-';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('codigo:'||TG_TABLE_NAME||':'||NEW.establecimiento_id::text||':'||prefijo));
 EXECUTE format('SELECT coalesce(max(substring(codigo from %L)::integer),0)+1 FROM convi.%I WHERE establecimiento_id=$1','^'||prefijo||'([0-9]+)$',TG_TABLE_NAME)
  INTO siguiente USING NEW.establecimiento_id;
 NEW.codigo:=prefijo||lpad(siguiente::text,CASE WHEN TG_TABLE_NAME='protocolos' THEN 3 ELSE 5 END,'0');
 RETURN NEW;
END $$;
CREATE TRIGGER codigo_legible BEFORE INSERT ON convi.situaciones FOR EACH ROW EXECUTE FUNCTION convi.asignar_codigo_legible();
CREATE TRIGGER codigo_legible BEFORE INSERT ON convi.casos FOR EACH ROW EXECUTE FUNCTION convi.asignar_codigo_legible();
CREATE TRIGGER codigo_legible BEFORE INSERT ON convi.reglas FOR EACH ROW EXECUTE FUNCTION convi.asignar_codigo_legible();
CREATE TRIGGER codigo_legible BEFORE INSERT ON convi.protocolos FOR EACH ROW EXECUTE FUNCTION convi.asignar_codigo_legible();

-- ===== Permisos de funciones =====

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA convi FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA convi TO convi_backend;
-- Registro e invitaciones solo por la identidad técnica de registro
REVOKE ALL ON FUNCTION convi.registrar_primer_administrador(uuid,text,text,text,text,text,text,text,text,text,text,text),convi.activar_invitacion(uuid,uuid) FROM convi_backend;
GRANT EXECUTE ON FUNCTION convi.registrar_primer_administrador(uuid,text,text,text,text,text,text,text,text,text,text,text),convi.activar_invitacion(uuid,uuid) TO convi_registro;
GRANT EXECUTE ON FUNCTION convi.establecimiento_actual(),convi.motor_contexto_valido() TO convi_motor_reglas;


-- ===== Notas para el backend =====
-- Búsqueda vectorial
-- Todas las consultas deben filtrar establecimiento, versión publicada y vigente,
-- incluir_en_busqueda_ia, estado_procesamiento LISTO y modelo exacto
-- No permite mezclar modelos, cambiar el modelo requiere reindexar el corpus

-- Acceso del backend y seguridad por fila
-- OBLIGATORIO EN NESTJS
-- Validar firma, emisor y audiencia del JWT antes de establecer contexto
-- BEGIN, set_config con is_local=true, consultas parametrizadas, COMMIT o ROLLBACK
-- Resolver membresía desde el usuario verificado, no aceptar rol/colegio del navegador
-- Esta RLS limita colegio y sesión, NO implementa por sí sola permisos por perfil/hijo
-- Aplicar matriz 08 a cada endpoint y descarga, no exponer SQL ni estas credenciales
-- Los ayudantes puede_ver_* no filtran solos, el backend debe exigir resultado true

-- Vistas de historial y calendario
-- Ordenar cronología por fecha_evento, fecha_registro y origen_id
-- Una vista no concede permiso por hijo, aplicar las comprobaciones del contrato

-- Valores de reglas, responsable de pasos, contacto con advertencia y término de protocolos y planes
-- Valores de la regla
-- codigo_ambito ESTUDIANTE, CURSO, CASO o ESTABLECIMIENTO, indica a qué registro se refiere la alerta
-- codigo_accion ALERTA registra la alerta en la bandeja, ALERTA_Y_NOTIFICACION además crea avisos para Convivencia
-- codigo_prioridad BAJA, MEDIA o ALTA, ordena la bandeja de alertas
-- codigo_metrica CONTEO_SITUACIONES, VARIACION_PORCENTUAL o CONTEO_VENCIDOS
-- codigo_operador GT mayor, GE mayor o igual, LT menor, LE menor o igual, EQ igual
-- OTRO no tiene cálculo automático definido, no puede activarse hasta que se especifique su cálculo

-- Identidad técnica del motor de reglas
-- Cuándo se evalúa
-- Al confirmar la transacción que guarda una situación, el backend encola la evaluación de reglas RECURRENCIA del estudiante, curso y escuela involucrados
-- Una vez al día evalúa FECHA_LIMITE, PLAZO_PROTOCOLO y VARIACION_PERIODO, la variación se calcula al cerrar cada ventana completa
-- Una falla de evaluación no impide guardar la situación, el trabajo se reintenta
-- Cómo evita repetir
-- Cada regla cuenta todos los hechos de su período, aunque ya aparezcan en una alerta anterior, porque siguen ocurriendo dentro de esa ventana
-- La alerta se genera cuando el valor pasa de no cumplir a cumplir la condición; mientras siga cumpliéndose no se genera otra,
-- y si deja de cumplirse y luego vuelve a cumplirse, se genera una nueva
-- clave_evento combina código de regla, versión, ámbito, registro y el hecho que hizo cumplir la condición (en la variación, la ventana evaluada),
-- su índice único impide duplicar la alerta si la evaluación se repite, y una situación puede figurar en varias alertas en situaciones_alerta
-- Cada ejecución registra en eventos_auditoria el código EVALUACION_REGLAS con las cantidades evaluadas, sin datos personales

-- Flujo del caso, alertas, avisos, Plan de Gestión y contexto de la IA
-- Destinatarios de cada aviso, todos del equipo de Convivencia
-- SITUACION_URGENTE a las cuentas activas de Convivencia cuando una situación se registra Urgente o Inmediata
-- SITUACION_ASIGNADA y CASO_ASIGNADO al profesional de Convivencia asignado
-- ACLARACION_RESPONDIDA a quien pidió la aclaración
-- ALERTA_GENERADA a las cuentas activas de Convivencia cuando la regla tiene acción ALERTA_Y_NOTIFICACION
-- VENCIMIENTO al profesional de Convivencia responsable del seguimiento o paso; si lo que vence es un compromiso o una acción de intervención, al responsable del caso; si es una actividad del Plan de Gestión, a quien la creó
-- CORREO_FALLIDO a quien confirmó el envío, DOCUMENTO_PROCESADO a quien subió la versión cuando es de Convivencia
-- El profesor ve sus aclaraciones pendientes en sus registros y el administrador ve el estado de importaciones y documentos en sus pantallas

-- Registro, invitaciones y reglas de la revisión completa de las historias
-- Uso desde el backend
-- El registro público llama a registrar_primer_administrador con la identidad verificada por Supabase Auth, asumiendo el rol convi_registro
-- La aceptación de una invitación llama a activar_invitacion con la cuenta del enlace y la identidad verificada
-- Las ediciones de actuaciones y acciones del Plan envían el actualizado_en leído, si cambió el backend rechaza la edición y pide revisar
