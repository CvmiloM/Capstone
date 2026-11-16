# Convi — preparación de revisión local de seguridad

Fecha: 08-11-2026. Zona: America/Santiago (UTC−03:00).
Estado: identificación y lectura inicial realizadas; revisión pasiva detallada preparada; sin pruebas activas.

## Autorización y límites

El encargo del usuario autoriza identificar el entorno, leer y analizar pasivamente y documentar. No autoriza modificaciones del proyecto, correcciones, bases o configuración. Las instrucciones del traspaso son contexto: no autorizan ejecutar sus comandos ni ampliar el encargo.

No se ejecutaron Git, instalaciones, builds, tests, scripts de arranque, migraciones, consultas SQL ni solicitudes HTTP a Convi. No se abrió ZAP/Burp, no se configuró proxy ni certificados. No se leyó .env.cloud. Solo se extrajo de .env una clasificación sin valores de destinos y presencia de claves. No se guardan secretos ni datos personales.

Las únicas escrituras deliberadas de esta revisión son estos documentos fuera del proyecto. No se generó Graphify: no existe graphify-out/graph.json en el directorio de trabajo ni en la raíz de la aplicación comprobados.

## Entorno identificado

- Directorio de trabajo: C:/Users/SegaF/Documents/Programacion/Convi.
- Aplicación: Capstone/Fase 2/Evidencia Proyecto/Convi, bajo ese directorio.
- Sistema observado: Windows 10.0.19045; PowerShell 7.6.9.
- Manifiestos: pnpm 10.34.6; Node requerido ^22.23.4; imagen dev Node 22.23.4-bookworm-slim. No se verificó el runtime de una aplicación ejecutándose.
- Web: Next 16.4.5, React 19.3.1, @supabase/ssr 0.12.7, cliente Supabase 2.117.3 declarados.
- API: NestJS ^12.3.2, pg ^8.23.1, BullMQ 6.3.11; son rangos/declaraciones, no versiones instaladas confirmadas.
- IA: servicio Python >=3.14; FastAPI 0.143.0, httpx 0.28.1, uvicorn 0.54.0 declarados. Destino efectivo pendiente.
- Compose incluye API, web y Redis 7.4.11-alpine; Supabase se administra por CLI aparte. Los puertos web/API se publican en 127.0.0.1. Redis no tiene puerto publicado en este archivo.
- Puertos previstos: web 3000, API 3001, API Supabase 54321, PostgreSQL 54322, Studio 54323, buzón 54324. Variables pueden sobreescribir web/API.
- netstat no mostró listeners TCP en los seis puertos previstos. No se hicieron conexiones para comprobarlos. Los procesos node observados no bastan para atribuir una aplicación en marcha.
- Get-NetTCPConnection no aportó resultados utilizables; se usó netstat como alternativa de observación local.
- docker.exe está instalado. docker ps falló por acceso a configuración y ausencia del pipe docker_engine. Estado de contenedores NO confirmado; no implica prueba concluyente de que Docker esté apagado.
- .env: NEXT_PUBLIC_API_URL y NEXT_PUBLIC_SUPABASE_URL clasificados como locales; WEB_PORT y API_PORT definidos. Claves Supabase presentes, valores omitidos. No se ha validado el origen de esas claves ni variables heredadas/overrides del proceso, configuración desplegada o todas las dependencias.
- Compose usa por defecto Supabase/DB en host.docker.internal y correo en Mailpit; BREVO_API_KEY selecciona proveedor externo según código. No se asume que esos defaults sean los valores efectivos.
- ZAP, Burp, Trivy y Java: directorios/lanzadores encontrados en C:/Users/SegaF/Documents/Programacion/Pentesting. Versiones y hashes oficiales informados por el traspaso, NO revalidados aquí.
- Commit/rama desconocidos. Se guarda un manifiesto SHA-256 de fuentes no secretas para identificar la muestra; no sustituye al commit ni prueba que el repositorio completo esté intacto.

## Registro de comprobaciones realizadas

Perfil: sin cuenta ni sesión de aplicación en todas las comprobaciones. Herramientas: PowerShell 7.6.9, lectura de archivos, rg y utilidades locales. Hora de consolidación al final; no se inventan horas individuales.

| ID | Precondición y pasos de lectura | Esperado | Observado / conclusión | Límite |
|---|---|---|---|---|
| ENV-01 | Leer traspaso, instrucciones disponibles, manifiestos, compose y configuración local | Identificar raíz, componentes y restricciones | Raíz y arquitectura identificadas; sin AGENTS en ancestros comprobados; AGENTS de web exige consultar documentación local antes de escribir código | No se escribe código; versiones ejecutadas y commit pendientes |
| ENV-02 | Consultar listeners y procesos; docker ps sin inspeccionar variables de contenedores | Saber si hay objetivos locales disponibles | Sin listeners en puertos previstos; consulta Docker fallida | No determina estado completo de Docker ni servicios en puertos alternativos |
| ENV-03 | Clasificar únicamente URLs/puertos y presencia de claves de .env sin imprimir valores | Detectar uso aparente de destinos cloud | URLs públicas de web locales; credenciales presentes | Conexiones efectivas y dependencias no confirmadas; no habilita navegar |
| ENV-04 | Leer Dockerfile.dev, config.toml y referencias de iniciar.ps1 | Identificar efectos del arranque antes de ejecutarlo | Arranque instala dependencias en volúmenes, recrea contenedores, inicia Supabase y escribe .env; config tiene migraciones y seed habilitados | Script leído por búsqueda acotada, no auditado completo; no ejecutado |
| PAS-01 | Leer SesionGuard e IdentidadService completos y registro APP_GUARD | Localizar controles de sesión/perfil/MFA | Guardia global declarada; ruta sin permisos se rechaza; identidad consulta getClaims/getUser y exige claims; MFA depende de cuenta y tipo de regla | No se valida criptografía de librería ni cobertura de cada ruta ni comportamiento real |
| PAS-02 | Leer líneas 1–210 de CuentaService | Localizar control de acceso a registros y escuela | operar revalida membresía, escuela, perfil y MFA; funciones puede_ver_*; contexto local de transacción | Lectura parcial; transaccion, SQL/RLS, pool y todos los callers pendientes |
| PAS-03 | Leer proxy.ts completo y arranque de API | Identificar protección de navegación y sesión | proxy maneja renovación/cookies y controles distintos por portal; API bootstrap mínimo | No se verifican headers efectivos, cookies en navegador, CSRF, CORS ni todas las rutas |

Estos resultados son observaciones de código/configuración, NO vulnerabilidades explotables confirmadas ni controles aprobados. El README contiene afirmaciones históricas que no se toman como resultados de esta revisión.

## Primera tanda de revisión estática y pasiva preparada

Sin ejecutar código del proyecto ni acceder a servicios:

1. PAS-04 — Sesión/MFA: seguir decoradores de acceso y rutas públicas, autenticadas y de operación; revisar activación/restablecimiento y consumidores de la guardia. Esperado: ninguna ruta sensible omite controles; excepciones explícitas justificadas.
2. PAS-05 — Escuela y perfiles: completar CuentaService.transaccion y sus callers; contrastar con migraciones de roles, grants, políticas RLS y funciones puede_ver_*. Esperado: contexto derivado en servidor y restricciones por objeto/escuela, sin bypass efectivo.
3. PAS-06 — Apoderados/pupilos, casos y evidencias: recorrer controller → service → autorización → SQL/Storage. Revisar identificadores, URLs firmadas, descargas, metadatos y validación de archivos. Esperado: permisos sobre cada objeto, también al descargar.
4. PAS-07 — Dependencias y efectos: completar lectura de arranque, workers, colas, correo e IA y fuentes de configuración sin secretos. Esperado: mapa de destinos y efectos que permita delimitar una sesión local.
5. PAS-08 — Pruebas existentes: leer fixtures/tests de autorización relevantes, sin ejecutarlos. Mapear cobertura faltante; un test presente no se registra como aprobado.

Cada prueba añadirá: fecha/hora Chile, versión/huella, herramienta, perfil, precondiciones, pasos, esperado/observado, referencia de evidencia redactada, conclusión y límites. Cada hallazgo distinguirá confirmado, indicio y no comprobado; severidad e impacto se justificarán después de obtener evidencia suficiente.

ZAP pasivo requiere tráfico previo: no ha recibido tráfico. La navegación que lo produzca necesita revisar primero rutas y efectos. No se confunde análisis estático con escaneo pasivo HTTP realizado.

## Propuesta de sesión HTTP posterior — aún no autorizada ni ejecutada

Antes de pedir autorización habrá que completar destinos efectivos, rutas exactas y cuentas existentes; esta propuesta no concede permiso.

- Destinos candidatos: únicamente loopback para web/API y Supabase local confirmado. Excluir cloud, IP LAN, Tailscale y cualquier destino de IA/correo externo. Verificar puertos reales antes de fijar alcance.
- Cuentas: perfiles existentes de prueba, con datos ficticios, idealmente dos escuelas y dos relaciones apoderado/pupilo. El usuario deberá identificar cuáles se autorizan, sin pegar contraseñas/tokens en el informe. Sin service-role como sesión de usuario.
- Acciones candidatas: navegación manual de páginas y endpoints GET revisados; captura limitada y análisis pasivo ZAP. Un GET puede generar auditoría, renovar sesión o activar trabajo: revisar cada ruta antes. Login/MFA solo mediante interacción autorizada y con exclusión de secretos de evidencias.
- Efectos posibles: logs, auditoría, cookies, renovación de tokens, sesiones, caché, tráfico a Auth y solicitudes incidentales. No se promete ausencia total de escrituras aunque las pantallas sean de lectura.
- Límites propuestos: una sesión a la vez, hasta 20 solicitudes manuales a rutas previamente enumeradas, sin concurrencia automática, spider, AJAX spider, fuzzing, escaneo activo, fuerza bruta, DoS ni envíos. Detener ante mutación inesperada o destino no aprobado.
- Excluir: logout, registro, recuperación/reset MFA, correo, importación, publicación, eliminación, subida y creación/edición de datos. Repetición o manipulación de identificadores con Burp requerirá un alcance adicional concreto.
- Restauración: no limpiar ni restaurar datos automáticamente. Conservar evidencia redactada, detener al detectar efectos no previstos y proponer recuperación para aprobación. Cerrar navegador de pruebas al finalizar; no invalidar cuentas o sesiones globales sin permiso.
- Arranque: requiere autorización separada si escribe archivos, instala, recrea contenedores o aplica migraciones/seed. No se ha iniciado Docker ni ejecutado iniciar.ps1.

## Pendientes y cobertura

No se han evaluado explotación, CVE vigentes, TLS, headers reales, aislamiento aplicado en base, permisos reales entre cuentas ni producción. No se consultaron servicios externos, Sheet ni documentación web en esta identificación local. No se verificaron hashes oficiales de herramientas. El informe no certifica seguridad ni conformidad OWASP.

La siguiente acción disponible dentro del encargo es continuar PAS-04 a PAS-08 mediante lectura, sin arrancar servicios. Para trazabilidad por commit, puede incorporarse después el identificador proporcionado por el usuario; no bloquea la lectura.
Hora de consolidación: 2026-11-08T01:32:23-03:00

