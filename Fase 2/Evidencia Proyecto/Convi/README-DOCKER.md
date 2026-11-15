# CONVI con Docker

Guía para levantar CONVI en un equipo con Windows: la web, la API y Redis corren con Docker Compose, Supabase local corre con su CLI y el servicio de IA convi-ia corre aparte con uv.

**Ubicación obligatoria:** todos los comandos se ejecutan en PowerShell desde `Capstone/Fase 2/Evidencia Proyecto/Convi`, donde está `compose.yaml`, y no desde la raíz del repositorio.

## Qué hay en la carpeta

| Archivo o carpeta | Para qué sirve |
|---|---|
| `compose.yaml` | Proyecto `convi-dev` con los servicios `web`, `api` y `redis` |
| `Dockerfile.dev` | Imagen de desarrollo de la web y la API, con Node 22.23.4 fijado por digest |
| `Dockerfile.production` | Imágenes de producción `api` y `web` construidas en varias etapas, que GitHub Actions publica en Azure (ver `AZURE.md`) |
| `Dockerfile.respaldo` | Imagen del respaldo diario en Azure (ver `RESPALDOS.md`) |
| `.dockerignore` | Deja fuera de las imágenes los `.env`, `node_modules`, `.next`, `dist`, respaldos y archivos temporales |
| `.env.example` | Todas las variables de entorno, comentadas y sin claves |
| `supabase/` | `config.toml` con los puertos locales, las migraciones del esquema, `seed.sql` y las pruebas pgTAP |
| `scripts/` | `iniciar.ps1`, `comprobar.ps1` y `detener.ps1` para el día a día, y los scripts de IA y de respaldo |

## Servicios

| Servicio | Cómo corre | Puerto en el equipo | Qué hace |
|---|---|---|---|
| `web` | Docker Compose con `next dev` | 127.0.0.1:3000 | Portales de Administración, Convivencia, Profesor y Apoderado |
| `api` | Docker Compose con `nest start --watch` | 127.0.0.1:3001 | API de NestJS y trabajadores de BullMQ |
| `redis` | Docker Compose con `redis:7.4.11-alpine` | Sin publicar | Colas de BullMQ con AOF y `noeviction`, solo la usa la API dentro de Docker |
| Supabase local | CLI 2.117.0, fuera de Compose | 54321 a 54324 | Auth, PostgreSQL 17 con pgvector, Storage, Studio y Mailpit |
| convi-ia | uv, sin contenedor | 127.0.0.1:8000 | Asistente de IA con Ollama, es opcional (sección E) |

El código se monta en `/workspace` dentro de los contenedores, así los cambios se ven al instante, y las dependencias de pnpm y la carpeta `.next` viven en los volúmenes `pnpm_root_modules`, `web_modules`, `api_modules` y `web_next`, para no mezclar dependencias de Windows y Linux, mientras `redis_data` conserva la cola entre reinicios.

Los contenedores llegan a Supabase local y a convi-ia por `host.docker.internal`, porque dentro de un contenedor `localhost` no es el equipo.

## Requisitos

- Windows 10 u 11 con Docker Desktop iniciado y el motor de Linux con WSL2.
- Node.js **22.23.4**, la versión de `.node-version`, con `npx.cmd` en el PATH: se usa para la CLI de Supabase, porque la web y la API usan el Node de su imagen.
- Git para clonar y actualizar el repositorio.
- Memoria y disco suficientes, porque Supabase local levanta varios contenedores.
- Conexión a internet la primera vez, para descargar las imágenes y la CLI.
- Solo para el asistente de IA: Ollama y uv, idealmente con una tarjeta de video (sección E).

## A. Primer inicio

1. Abre Docker Desktop y espera que el motor esté iniciado.
2. Abre PowerShell en la carpeta `Fase 2/Evidencia Proyecto/Convi`.
3. Ejecuta:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Build
```

El script hace cuatro pasos:

1. Revisa que Docker y Node.js estén disponibles.
2. Inicia Supabase local con la CLI 2.117.0, que la primera vez crea la base y aplica todas las migraciones de `supabase/migrations`.
3. Crea `.env` a partir de `.env.example` si no existe, y le escribe las claves locales de Supabase sin mostrarlas.
4. Construye las imágenes, sincroniza las dependencias con `pnpm-lock.yaml` e inicia `web`, `api` y `redis`.

Para comprobar que todo responde:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comprobar.ps1
```

Si el equipo tiene bloqueada la ejecución de scripts, esa forma de llamarlos permite el script solo para ese proceso, y conviene leer cada script antes de ejecutarlo.

### Direcciones

| Servicio | Dirección |
|---|---|
| CONVI | http://localhost:3000 |
| API | http://localhost:3001 |
| Supabase Studio | http://localhost:54323 |
| API de Supabase | http://localhost:54321 |
| PostgreSQL | localhost:54322 |
| Correos de prueba (Mailpit) | http://localhost:54324 |

### Primer ingreso

Con una base nueva hay dos formas de entrar:

- **Escuela propia:** en http://localhost:3000/registro se crea la cuenta, se confirma el correo desde Mailpit, se registra la escuela y se configura el segundo factor con una aplicación de autenticación.
- **Escuelas ficticias:** el generador de datos sintéticos de la sección F crea escuelas completas con tres años de historia y al final muestra los correos de Convivencia con los que se puede entrar.

## B. Uso diario

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comprobar.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\detener.ps1
```

- `iniciar.ps1` no borra la base, los archivos, el `.env` ni las colas, y en cada arranque sincroniza las dependencias con el lockfile y recrea `web` y `api` para cargar el código recibido.
- `-Build` solo hace falta cuando cambia `Dockerfile.dev` o sus herramientas, no por recibir dependencias nuevas.
- `detener.ps1` detiene los contenedores y Supabase local conservando los datos.
- `docker compose ps` solo muestra el estado y no inicia nada, y Docker Desktop puede volver a iniciar solo los contenedores que estaban activos.
- Después de cambiar `.env` hay que volver a ejecutar `iniciar.ps1`, porque `docker compose restart` no vuelve a leer las variables.

## C. Variables de entorno

Todas las variables están en `.env.example`, con un comentario de para qué sirve cada una, y `iniciar.ps1` completa las claves locales en `.env`.

| Variables | Quién las usa | Para qué |
|---|---|---|
| `WEB_PORT` y `API_PORT` | Compose | Puertos del equipo para la web y la API, 3000 y 3001 por defecto |
| `NEXT_PUBLIC_API_URL` | web | Dirección con la que la web llama a la API |
| `SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_URL` | web y API | Dirección de Supabase desde los contenedores y desde el navegador |
| `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_ANON_KEY` | web y API | Clave pública de Supabase |
| `SUPABASE_SECRET_KEY` y `SUPABASE_SERVICE_ROLE_KEY` | Solo API | Clave privada de Supabase para invitaciones y otras operaciones de servidor, nunca va en una variable `NEXT_PUBLIC` |
| `SUPABASE_DB_URL` | Solo API | Conexión a PostgreSQL, que en la nube exige `sslmode=verify-full` |
| `REDIS_URL` | Solo API | Redis de las colas, en Docker se usa `redis://redis:6379` si queda vacía |
| `IA_EMBEDDINGS_URL`, `IA_GENERACION_URL` e `IA_EMBEDDINGS_TOKEN` | Solo API | Direcciones de convi-ia para buscar en el reglamento y para redactar, y su token |
| `CORREO_MAILPIT_URL`, `CORREO_REMITENTE`, `BREVO_API_KEY` y `CORREO_DESTINOS_PERMITIDOS` | Solo API | Correos al apoderado, que en local van a Mailpit y en la nube salen por Brevo |

- `.env` y `.env.cloud` son privados, Git los ignora y nunca se suben ni se comparten.
- No hay que definir estas mismas variables en la sesión de PowerShell, porque Docker les da prioridad sobre las del archivo.
- convi-ia no lee `.env`: sus variables se explican en la sección E.

## D. Supabase en la nube

Para usar la web y la API locales contra el proyecto de Supabase en la nube:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Entorno Cloud
```

Este modo usa `.env.cloud` en vez de `.env`, no inicia Supabase local, exige la misma URL HTTPS de Supabase para la web y la API y una conexión a PostgreSQL con `sslmode=verify-full`, y no permite trabajar con ambas bases a la vez desde los mismos contenedores, como detalla `SUPABASE-CLOUD.md`.

## E. Servicio de IA (opcional)

Sin convi-ia CONVI funciona igual, y solo las funciones de IA, como la consulta del reglamento, la orientación y los borradores, avisan que el servicio de IA no está configurado.

1. Instala Ollama y descarga los dos modelos:

```powershell
ollama pull bge-m3:567m-fp16
ollama pull qwen3.5:9b
```

2. Instala uv y levanta el servicio desde la carpeta `Convi`:

```powershell
uv run --directory apps/ia convi-ia
```

3. Agrega estas dos líneas a `.env` y vuelve a ejecutar `iniciar.ps1`:

```dotenv
IA_EMBEDDINGS_URL=http://host.docker.internal:8000/api/embed
IA_GENERACION_URL=http://host.docker.internal:8000/api/chat
```

Variables de convi-ia, leídas del entorno del proceso:

| Variable | Por defecto | Para qué |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Dirección de Ollama |
| `IA_HOST` | `127.0.0.1` | Dónde escucha convi-ia |
| `IA_PUERTO` | `8000` | Puerto de convi-ia |
| `IA_EMBEDDINGS_TOKEN` | Sin token | Obligatorio si escucha fuera del equipo, de al menos 32 caracteres y con el mismo valor que recibe la API |

- `http://127.0.0.1:8000/salud` dice si Ollama responde y si los modelos están instalados.
- Las pruebas del servicio se corren con `uv run --directory apps/ia pytest`.
- En producción convi.tech llega a convi-ia por HTTPS y con token, con `scripts/iniciar-ia.ps1` y `scripts/vigilar-ia.ps1`, como explica `AZURE.md`.

## F. Datos de prueba

El generador de datos sintéticos crea escuelas ficticias con tres años de historia, sin datos de personas reales, y corre dentro del contenedor de la API, que ya tiene las variables de la base y de Supabase:

```powershell
docker compose exec api node apps/api/dist/herramientas/sinteticos/generar.js --semilla 2026 --clave-convivencia
```

| Opción | Qué hace |
|---|---|
| `--semilla <texto>` | Fija los datos generados, por defecto 2026 |
| `--situaciones <número>` | Total de situaciones, por defecto 10000 |
| `--clave-convivencia` | Pide una clave para la cuenta de Convivencia de cada escuela, que así puede iniciar sesión |
| `--reemplazar` | Borra y vuelve a crear las escuelas de esa semilla |
| `--permitir-nube` | Permite correrlo en una base que no es la local, solo después de acordarlo con el equipo |
| `--ayuda` | Muestra todas las opciones |

## G. Cambios en la base de datos

- Crear una migración: `npx.cmd --yes supabase@2.117.0 migration new nombre_del_cambio`, y después revisar el SQL, probarlo y subirlo en `supabase/migrations/`.
- Aplicar las migraciones recibidas por Git sin borrar datos: `npx.cmd --yes supabase@2.117.0 migration up`.
- Correr las pruebas pgTAP de `supabase/tests`: `npx.cmd --yes supabase@2.117.0 test db`.
- `npx.cmd --yes supabase@2.117.0 db reset` **borra los datos locales** y reconstruye el esquema, así que solo se usa si se aceptan perder esos datos.
- No se crean tablas desde Studio sin dejar el cambio en una migración compartida.
- Las claves privadas son solo del backend, y el acceso a los datos pasa siempre por la API con la seguridad por fila.

## H. Pruebas y revisión del código

```powershell
docker compose exec api corepack pnpm --filter @convi/api test
docker compose exec api corepack pnpm --filter @convi/api lint
docker compose exec web corepack pnpm --filter @convi/web lint
```

En cada cambio de la rama principal GitHub Actions repite estas revisiones, junto con la auditoría de dependencias y la compilación de la API y la web, antes de publicar en Azure.

## I. Alternativa sin scripts

```powershell
npx.cmd --yes supabase@2.117.0 start
npx.cmd --yes supabase@2.117.0 status -o env
docker compose up --build -d
docker compose ps
```

**Atención:** esta alternativa muestra las claves locales en pantalla y obliga a copiarlas a mano en un `.env` hecho desde `.env.example`, así que no hay que compartir capturas de `supabase status` ni pegar esas claves en un chat, y para empezar sin copiar claves es mejor usar `iniciar.ps1`.

## J. Git y trabajo en equipo

- **Se suben:** `compose.yaml`, los Dockerfile, `.dockerignore`, `.env.example`, los README, `scripts/`, `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations/` y `supabase/tests/`.
- **No se suben:** `.env`, `.env.cloud`, `*.env.local`, respaldos, `node_modules`, `.next`, archivos de credenciales, datos de personas reales ni `supabase/.temp/`.
- Antes de un commit, `git status --short --ignored` debe mostrar `.env` como ignorado y nunca en staging, y nunca se usa `git add -f` para incluirlo.
- Cada cambio va en su propia rama y entra a `main` con un pull request.
- Cada integrante tiene su propia base local, los datos no viajan por Git y solo se comparten las migraciones y la semilla ficticia.

## K. Solución de problemas

- **Docker sin motor:** abre Docker Desktop, y `docker version` debe mostrar las secciones Client y Server.
- **No existe Node o npx:** instala Node.js 22.23.4 y abre otra terminal.
- **`npx` no puede descargar Supabase:** revisa internet, proxy y firewall, porque el primer uso necesita red.
- **Puertos 3000, 3001 o 54321 a 54324 ocupados:** cierra el otro programa o cambia de forma coordinada `config.toml` y `.env`.
- **La web o la API no responden:** revisa `docker compose ps` y `docker compose logs --tail=100 web api`.
- **"Module not found" después de un pull:** vuelve a ejecutar `iniciar.ps1`, que sincroniza las dependencias y recrea los contenedores.
- **`supabase start` falla:** revisa la memoria asignada a Docker y el mensaje de salud del servicio.
- **La API no llega a Supabase o a convi-ia:** dentro de Docker se usa `host.docker.internal` y no `localhost`, y hay que revisar la conexión al puerto y el firewall.
- **No compartas** la salida de `supabase status`, `.env`, `docker compose config` ni `docker inspect` sin ocultar los valores, porque pueden mostrar claves.

## L. Producción

Producción no usa Docker Compose: `Dockerfile.production` construye las imágenes `api` y `web`, que corren sin privilegios con el usuario `node`, y el flujo `.github/workflows/convi-azure.yml` las valida, las sube al Container Registry con la etiqueta del commit y actualiza los contenedores de Azure Container Apps, como detalla `AZURE.md`, mientras el respaldo diario corre con `Dockerfile.respaldo`, como detalla `RESPALDOS.md`.

## Seguridad y límites

- El entorno de Docker Compose es solo para desarrollo local, y Supabase local no está endurecido para producción.
- Los puertos solo escuchan en `127.0.0.1`, y no se abren al router ni se exponen Supabase o Studio a otras redes.
- No se cargan datos reales de estudiantes en los ambientes de prueba.
- Las claves de servicio nunca van al navegador ni en variables `NEXT_PUBLIC`.

## Revisión de dependencias del 4 de noviembre de 2026

- Node se actualizó a **22.23.4** en Windows, en Docker y en GitHub Actions, y para recibirlo hay que instalarlo desde [el sitio oficial](https://nodejs.org/en/blog/release/v22.23.4), abrir otra terminal, comprobar `node --version` y ejecutar `iniciar.ps1 -Build`.
- Dentro de Docker se comprueba con `docker compose exec api node --version` y `docker compose exec web node --version`, que deben mostrar `v22.23.4`, y Azure recibe el mismo Node cuando se publican nuevas imágenes con el flujo habitual de pull request y merge.
- `pnpm audit` quedó sin avisos altos ni críticos, incluidas las herramientas de desarrollo, y en producción pasó de 2 altos y 4 moderados a 0 altos y 3 moderados, y el flujo de GitHub bloquea nuevos avisos altos o críticos de producción antes de compilar y publicar.
- Quedan avisos moderados transitivos de `uuid` y `minimatch` que se siguen revisando sin ocultarlos con `audit --ignore`: ExcelJS 4.4.0 usa UUID v4 mientras el aviso afecta a v3, v5 y v6 con buffer, y CONVI no recibe patrones glob de los usuarios.
- El aviso de `minimatch` también alcanza a la CLI de Nest, y forzar minimatch 11 en los consumidores antiguos cambiaría su API y podría romper la importación o la compilación, así que se mantiene hasta actualizar esos consumidores o probar un reemplazo compatible.
- Los overrides de Undici y tmp corrigen versiones fijadas por Mau y su editor y se retiran cuando esos paquetes incorporen los parches, sin autorizar scripts de instalación adicionales ni desactivar las comprobaciones de TLS.
- La auditoría de paquetes de Node no cubre las imágenes del sistema operativo, los servicios administrados, Python ni una prueba de penetración de permisos y lógica.

Documentación oficial: [Supabase local](https://supabase.com/docs/guides/local-development) · [Flujo con la CLI](https://supabase.com/docs/guides/local-development/cli-workflows) · [Docker Compose](https://docs.docker.com/compose/)
