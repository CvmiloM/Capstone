# CONVI — Docker Compose + Supabase local (Sprint 1 / PB-135)

## Que incluye este commit

- `compose.yaml`, `Dockerfile.dev`, `.dockerignore`: desarrollo de Next.js (`apps/web`) y NestJS (`apps/api`) en contenedores.
- `supabase/config.toml`: puertos y servicios locales de PostgreSQL, Auth, Storage, Studio e Inbucket.
- `supabase/seed.sql`: espacio para datos ficticios, sin datos de personas reales.
- `supabase/migrations/`: directorio para migraciones SQL compartidas (todavia no hay esquema implementado).
- `.env.example`: valores de referencia, **sin claves**.
- `scripts/iniciar.ps1`, `scripts/comprobar.ps1`, `scripts/detener.ps1`: tareas habituales para Windows.

**Alcance:** esto configura la infraestructura de desarrollo. **No** implementa el login, tablas de CONVI, permisos RLS, buckets ni la conexion de la aplicacion a Supabase: eso requiere desarrollo posterior. No hay servicio FastAPI en este Sprint.

## Requisitos (cada equipo)

- Windows 10/11, Docker Desktop iniciado con WSL2/motor Linux.
- Git, para clonar/actualizar el repositorio.
- Node.js **20 o superior**, con `npx.cmd` en PATH. El script utiliza **Supabase CLI 2.117.0** con `npx` y la instala/cachea en el primer uso. Node no se usa para servir las apps, que se ejecutan dentro de Docker.
- Memoria y espacio libre suficientes para el stack local de Supabase (es pesado).
- Conexion a internet en la primera ejecucion para descargar imagenes de Docker y la CLI.

**Ubicacion obligatoria:** ejecutar desde `Capstone/Fase 2/Evidencia Proyecto/Convi/`, donde esta `compose.yaml`, **no** desde la raiz de `Capstone`.

## A. Primer inicio en el equipo

1. Abre Docker Desktop y asegurate de que el motor este iniciado.
2. Abre PowerShell en la carpeta `Fase 2/Evidencia Proyecto/Convi`.
3. Ejecuta:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1 -Build
```

Ese unico script:

1. Verifica Docker y Node.js.
2. Arranca Supabase local con CLI 2.117.0.
3. Obtiene las claves **locales** desde la CLI y rellena/actualiza `.env` (ignorado por Git, sin imprimirlas).
4. Construye e inicia `web` y `api` con Docker Compose.

Comprobar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comprobar.ps1
```

Si el equipo tiene la ejecucion de scripts bloqueada, la invocacion anterior limita la excepcion a ese proceso. **Lee siempre los scripts antes de ejecutarlos.**

### URLs

| Servicio | Direccion en navegador |
|---|---|
| Next.js | http://localhost:3000 |
| NestJS | http://localhost:3001 |
| Supabase Studio | http://localhost:54323 |
| API Supabase | http://localhost:54321 |
| PostgreSQL | localhost:54322 |
| Emails de prueba (Inbucket) | http://localhost:54324 |

## B. Uso diario (desde carpeta `Convi`)

Abre Docker Desktop y ejecuta:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\iniciar.ps1
```

El script intenta `supabase start` y `docker compose up -d` sin reconstruir las imagenes. No borra la base. Comprueba el funcionamiento:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\comprobar.ps1
```

Detener al terminar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\detener.ps1
```

`docker compose ps` **solo muestra estado, no inicia nada**. Docker Desktop puede reiniciar contenedores previamente activos automaticamente.

Si se modifican dependencias o Dockerfile, usa la variante con `-Build`.

## C. Sin scripts (alternativa manual)

Abre Docker Desktop, inicia Supabase y las aplicaciones por separado:

```powershell
npx.cmd --yes supabase@2.117.0 start
npx.cmd --yes supabase@2.117.0 status -o env
docker compose up --build -d
docker compose ps
```

**Atencion:** la alternativa manual muestra claves locales y requiere copiarlas manualmente al `.env` partiendo de `.env.example`. Evita compartir capturas de `supabase status` o volcar esas claves al chat. Para comenzar sin copiar claves, usa `scripts/iniciar.ps1`.

## D. Git y el trabajo con compañeros

**Subir:** `.env.example`, `compose.yaml`, `Dockerfile.dev`, `.dockerignore`, `README-DOCKER.md`, `scripts/`, `supabase/config.toml`, `supabase/seed.sql`, `supabase/migrations/README.md`.

**No subir:** `.env`, `*.env.local`, backups, `node_modules`, `.next`, archivos de credenciales, datos personales reales, `supabase/.temp/`.

Antes de hacer push desde **la raiz del repo Capstone**:

```powershell
git status --short
git status --short --ignored
```

Asegura que `.env` figure como ignorado y **no** en staging. Cuando confirmes, desde raiz del repositorio:

```powershell
git add -- "Fase 2/Evidencia Proyecto/Convi/"
git diff --cached --name-only
git diff --cached --check
git commit -m "chore: entorno local Docker Compose y Supabase para CONVI"
git push origin main
```

Si trabajan con ramas o `main` protegido, usa tu rama y abre un Pull Request en vez de hacer push directo. **Nunca uses `git add -f` para incluir `.env`.**

Los compañeros hacen `git pull` desde la raiz de Capstone y ejecutan el paso A en su equipo. Cada uno tendra **su propia base de datos local**. Los datos no se sincronizan por Git: **solo las migraciones y seed ficticio**.

## E. Cambios de BD en el futuro

- Crear migracion: `npx.cmd --yes supabase@2.117.0 migration new nombre_del_cambio`.
- Revisar y editar SQL, probarlo y versionar el nuevo archivo bajo `supabase/migrations/`.
- `npx.cmd --yes supabase@2.117.0 db reset` **ELIMINA los datos locales y reconstruye el esquema**; no ejecutarlo si tienes datos que necesites preservar.
- Aplicar migraciones nuevas sin borrar datos: consulta `supabase migration up` y revisa las diferencias antes.
- No crear tablas desde Studio sin capturar el cambio en una migracion compartida.
- Login y consultas de datos requeriran permisos de servidor, validacion de identidad y RLS. El uso de claves elevadas es exclusivamente del backend.

## F. Resolucion de problemas

- **Docker sin Engine:** abre Docker Desktop; `docker version` debe mostrar secciones Client y Server.
- **Node o npx no existe:** instala Node.js 20+ y reabre la terminal.
- **`npx` no puede descargar Supabase:** comprueba internet/proxy/firewall; el primer uso necesita red.
- **Puertos 3000/3001/54321-54324 ocupados:** cierra el otro proceso o ajusta de forma coordinada config.toml y .env.
- **La web/API no responde:** `docker compose ps` y `docker compose logs --tail=100 web api`.
- **`supabase start` falla:** revisa memoria asignada a Docker y el mensaje de salud del servicio; Supabase necesita recursos adicionales.
- **No llegan las conexiones entre API y Supabase:** en Docker Desktop, el backend usa `http://host.docker.internal:54321` (no `localhost:54321`). Verifica conectividad al puerto y el firewall local.
- **No compartas:** `supabase status`, `.env`, `docker compose config` o `docker inspect` sin ocultar valores: pueden mostrar claves.

## Seguridad y limites

**Esto es solo para desarrollo local.** No abrir puertos al router ni exponer Supabase/Studio a redes externas. No cargar datos reales de estudiantes en el ambiente de pruebas. El stack local de Supabase no esta endurecido para produccion. Nunca usar claves de servicio en el navegador (`NEXT_PUBLIC_*`).

## Criterios para marcar PB-135 terminado

- [ ] `web` y `api` se construyen e inician en Docker desde cero.
- [ ] Supabase local arranca y Studio responde.
- [ ] `.env` privado se genera por equipo y Git no lo incluye.
- [ ] `comprobar.ps1` verifica las URLs (aceptar/revisar los HTTP devueltos).
- [ ] Otro integrante reproduce todo desde clone limpio sin copiar credenciales de nadie.
- [ ] Se documenta evidencia/captura sin exponer claves privadas.

**Estatus actual:** la ejecución de `web`/`api` ya fue confirmada en el computador de Sebastián. Supabase y los scripts de automatizacion se deben probar localmente antes de marcar la historia como terminada.

Documentacion oficial: https://supabase.com/docs/guides/local-development | https://supabase.com/docs/guides/local-development/cli-workflows | https://docs.docker.com/compose/
