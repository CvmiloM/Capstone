# PB-145: CONVI en Azure con HTTPS

Actualización 17/10/2026: PR36 (BullMQ) y PR37 (infraestructura Redis) fusionados;
API y web publicadas con la imagen `07d5b2c`. API mínima/máxima 1/1 y, con
autorización de Sebastian, web también 1/1. Presupuesto de aviso actualizado
a USD60, conservando destinatarios y umbrales. No es un límite de gasto.
Correcciones del lector Excel, escrituras y consulta de avance preparadas en
`sebastian/rendimiento-importaciones`, todavía sin publicar. Git lo maneja Sebastian.
Los apartados del despliegue inicial y rendimiento conservan su contexto histórico;
la configuración vigente del piloto se detalla al final.

Estado: publicado con HTTPS y dominio propio. PB-145 se fusionó en PR32,
commit original `2897f73`, merge `8853de3`. Validación y publicación automáticas
aprobadas en el segundo intento de Actions38871008073. Corrección persistente
de OIDC en `sebastian/pb-145-oidc`; cierre de sesión explícito aún pendiente.
Git lo ejecuta Sebastian.

Base Azure creada y comprobada. Sebastian autorizó explícitamente transferir
`SUPABASE_SECRET_KEY` y `SUPABASE_DB_URL` desde `.env.cloud` a los secretos de
`ca-convi-api-pruebas`, en su grupo `rg-convi-pruebas` de Azure for Students,
conociendo los permisos heredados del directorio institucional. Las seis variables
públicas de GitHub fueron guardadas por Sebastian, no contienen el DSN ni la clave
secreta. La primera web está publicada con HTTPS; Sebastian completó login,
segundo factor y acceso Admin sin errores. Site URL de Supabase apunta a esa web.

El entorno inicial resultó Express: Azure rechazó enlazar el dominio propio y no
devolvió IP estática. Aunque la API declaraba ingreso interno, una consulta externa
alcanzó su guard de autenticación (401); no considerar verificado su aislamiento.
Se creó `cae-convi-estandar-pruebas` con `environmentMode: WorkloadProfiles`
explícito y API de recursos 2026-07-01, conservando la instalación inicial mientras
se comprueba el reemplazo. La plantilla de aplicaciones y el workflow ya apuntan
a `ca-convi-api-estandar` y `ca-convi-web-estandar`, ambas creadas con las imágenes
ya comprobadas `pb145-inicial`. Sebastian autorizó explícitamente entregar los
dos secretos al nuevo destino `ca-convi-api-estandar`, mismo grupo/suscripción.
La nueva web responde login200, Admin sin sesión303/login y HSTS. La API interna
recibe404 desde fuera del entorno, sin alcanzar Nest, con validación TLS normal.
La instalación Express se conserva temporalmente hasta verificar el reemplazo.

Sebastian registró `convi.tech` sin coste inicial, vence el 16/10/2027 y desactivó
la renovación automática (panel mostraba USD89,99). CNAME `www` al FQDN inicial
y TXT `asuid.www` publicados y verificados inicialmente. Se pidió cambiar CNAME
www a `ca-convi-web-estandar.jollydune-312063d0.brazilsouth.azurecontainerapps.io`,
crear A raíz a `20.201.94.113` y TXT raíz `asuid` con el mismo identificador de
verificación de la web. `https://www.convi.tech/login` ya responde200 con
certificado administrado válido y HSTS; la raíz `https://convi.tech/login` también
responde200 con certificado válido y ambos enlaces están SniEnabled.
Comunicación web/API HTTPS comprobada desde el contenedor web:401 sin sesión,
fuera404 Azure. Sebastian aprobó login, TOTP y Admin en www.convi.tech. Se pidió
cambiar Site URL a `https://www.convi.tech` y probar invitación/activación con otro
correo propio. La invitación falló con Supabase401 en los logs sanitizados.
Corrección del diagnóstico: la lectura directa inicial de PowerShell no permitía
deducir que la clave era inválida, porque su User-Agent predeterminado parece un
navegador y Supabase bloquea Secret keys en navegadores. Sebastian reemplazó la
clave; lectura administrativa como servidor respondió200, con y sin Bearer,
mientras PowerShell predeterminado respondió401 con la misma clave. No registrar
secretos ni cuentas al comprobarlo. La clave nueva se actualizó en los secretos
de ca-convi-api-estandar, con autorización existente, conservando el DSN verify-full
y limpiando el JSON temporal. Se reinició la revisión y raíz interna respondió200
desde web. SDK real dentro de la API comprobado: auth.admin.listUsers con una
lectura mínima respondió200, sin imprimir cuentas. Sebastian repitió la invitación:
correo recibido, enlace de activación aceptado, contraseña definida y entrada
correcta en `https://convi.tech/profesor`. No se expusieron tokens ni contraseñas.
Falta confirmar logout explícito publicado y fusionar la corrección persistente
de OIDC antes de declarar el backlog terminado.

La primera publicación automática pasó validación pero falló en azure/login con
AADSTS700213: Azure esperaba el subject antiguo basado solo en nombres. GitHub
envió `repo:CvmiloM@135039204/Capstone@1349101566:ref:refs/heads/main`, verificado
contra los identificadores públicos del propietario y repositorio. Se actualizó
la credencial federada existente, conservando issuer, audience, roles y restricción
a main. El reintento de los jobs fallidos terminó success, sin repetir el merge.
`infra/azure/base.bicep` conserva ahora ese subject exacto para evitar que una
futura instalación restaure la configuración anterior. No cambiar a comodines
ni añadir credenciales privadas en GitHub para resolver este error.

El ingreso de ambas apps Express se deshabilitó, pero la API siguió atendiendo401
y Azure devolvió InternalServerError al desactivar su revisión. La revisión
automática rechazó eliminarlas por falta de autorización específica de borrado,
no se borraron. Alternativa reversible aplicada: `publicNetworkAccess: Disabled`
en el entorno antiguo `cae-convi-pruebas` (solo esas dos apps), mediante PATCH API
2026-07-01. Comprobado API antigua403Azure sin alcanzar Nest y web actual200.
Conservar ese bloqueo: las plantillas nuevas ya no administran el entorno antiguo.

## Arquitectura y coste

- Suscripción Azure for Students, grupo `rg-convi-pruebas`, recursos en
  `brazilsouth`. El grupo conserva su metadato de ubicación `eastus`, que no obliga
  a alojar sus recursos allí. East US fue rechazado en la simulación por una
  segunda política de Students, Brazil South coincide con ambas listas permitidas.
- Arquitectura prevista: web Next.js pública y API NestJS interna, dentro del mismo Container Apps
  Environment con perfil **Consumption**. Ambas aceptan HTTPS en el ingreso,
  Azure cifra también el tráfico entre sus componentes mediante peer encryption.
- API_URL de la web apunta al FQDN **HTTPS interno** de la API. No se habilita
  CORS público, no se cambia ningún permiso de CONVI ni se publica PostgreSQL.
- Supabase cloud conserva Auth, PostgreSQL y Storage. PostgreSQL usa
  `sslmode=verify-full` y el certificado público incluido en la imagen de API.
- Piloto PB-027: API 0,25 vCPU/0,5 GiB con mínimo y máximo una réplica,
  para que el trabajador siga sin visitas. Web 0,5 vCPU/1 GiB con mínimo y máximo
  una réplica, para evitar el arranque por escalado a cero. Reinicios y despliegues
  todavía pueden producir esperas.
- Azure Managed Redis Balanced B0 de un nodo, TLS, NoEviction y NoCluster,
  en Brazil South. Sin alta disponibilidad ni persistencia; ver el apartado del piloto.
- **Container Registry Basic tiene coste por día incluso con las apps apagadas**,
  más almacenamiento/tráfico que supere lo incluido. No asumir que una oferta
  gratuita para otro SKU lo cubre. Tarifa pública consultada en Brazil South:
  USD0,1666/día, aproximadamente USD5 por 30 días, antes de extras y condiciones
  de la suscripción. Las imágenes se construyen en Docker/GitHub, no ACR Tasks.
- Presupuesto mensual de aviso originalmente USD10, después USD45 y actualizado
  a USD60 al aprobar la web encendida el 17/10. Conserva destinatarios y umbrales
  50/80/100 %. No corta el gasto.
  El crédito estudiantil inicial USD100 vence el 16/10/2027, según su panel.
- Este directorio Duoc tiene administradores institucionales con permisos heredados,
  Sebastian conoce esa condición. Se usa como entorno académico con datos ficticios.
- No se contrata Log Analytics en esta primera instalación: logs técnicos en vivo,
  sin historial persistente. La auditoría funcional existente permanece en la base.
  Añadir retención y revisar acceso institucional antes de operar con datos reales.

## Preparación e instalación inicial

1. Tener Azure CLI, Docker Desktop y la rama actualizada, iniciar sesión con
   `az login --use-device-code` y seleccionar Azure for Students.
2. Confirmar que el grupo anterior existe y que la región está permitida. Camilo
   Monge y Fernando Torres tienen Contributor limitado al grupo, Sebastian Owner.
3. Revisar las plantillas `infra/azure/base.bicep`, `redis.bicep` y `aplicaciones.bicep`. La primera
   crea ACR privado sin contraseña de administrador, entorno e identidades. La
   identidad de GitHub recibe Contributor **solo en el grupo** y AcrPush; la de
   las aplicaciones solo AcrPull en el registro. No se crea una cuenta Microsoft
   Entra nueva ni se comparten contraseñas personales.
4. Desde Convi, ejecutar, sustituyendo el identificador de la suscripción propia:

   ```powershell
   .\scripts\publicar-azure.ps1 -SubscriptionId 'ID-DE-TU-SUSCRIPCION' -Etapa Base
   ```

5. Conservar las cuatro variables públicas que imprime. El script no ejecuta Git,
   no imprime claves ni ejecuta migraciones. La etapa Redis actualiza únicamente
   `AZURE_REDIS_URL` dentro de `.env.cloud`. Las plantillas
   son declarativas y se pueden volver a aplicar al mismo grupo.
6. Completar el `.env.cloud` privado existente con las claves modernas del proyecto
   CONVI (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`), URL HTTPS y DSN con
   verify-full. No enviar el archivo al repositorio ni copiarlo a GitHub Actions.
7. Crear primero el Redis piloto y guardar su conexión privada:

   ```powershell
   .\scripts\publicar-azure.ps1 -SubscriptionId 'ID-DE-TU-SUSCRIPCION' -Etapa Redis
   ```

   Esta etapa registra Microsoft.Cache y aplica `infra/azure/redis.bicep` al mismo
   grupo. Guarda la clave codificada en `AZURE_REDIS_URL` del `.env.cloud` existente,
   sin imprimirla. No agrega `REDIS_URL` a ese archivo: la API local debe consumir
   el Redis de Docker, incluso cuando use Supabase cloud. El archivo sigue excluido
   tanto de Git como del contexto de construcción Docker. No compartirlo ni usar trazas.

   Después ejecutar la etapa inicial de imágenes y aplicaciones:

   ```powershell
   .\scripts\publicar-azure.ps1 -SubscriptionId 'ID-DE-TU-SUSCRIPCION' -Etapa Aplicaciones
   ```

   Solo URL/clave publicable pasan al build de Next, los secretos se entregan a
   Azure como parámetros seguros y secretos de Container Apps. El JSON temporal
   privado se elimina al finalizar, incluso si Azure devuelve error. No ejecutar
   con trazas de depuración que revelen variables ni subir temporales a artefactos.
8. En Supabase Auth → URL Configuration, usar la nueva URL HTTPS como Site URL y
   permitir los destinos de registro/activación que usan las plantillas actuales,
   conservar localhost explícito para desarrollo. Probar ambos orígenes, las
   invitaciones basadas en Site URL abrirán la web publicada. No usar comodines
   amplios ni modificar plantillas o datos de compañeros sin revisar su alcance.

## Automatización después del merge

El workflow está en `.github/workflows/convi-azure.yml`, en la raíz de **Capstone**,
no dentro de Convi. Solo afecta cambios de Convi o del propio workflow.

1. La identidad federada confía exactamente en `CvmiloM/Capstone` y
   `refs/heads/main`. Un PR o una rama personal no cumple ese subject OIDC.
   No se requiere crear un GitHub Environment: Sebastian puede gestionar variables,
   pero no las opciones administrativas del repositorio de Camilo.
2. En GitHub → Settings → Secrets and variables → Actions → Variables,
   crear estas **variables de repositorio**, no secretos de base de datos:
   `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
   `AZURE_REGISTRY_NAME` (salida de Base), `SUPABASE_URL` y
   `SUPABASE_PUBLISHABLE_KEY` (públicas, del proyecto CONVI).
3. PR ejecuta lint, pruebas existentes y compilación, sin identidad Azure ni
   secretos cloud. Main, después de las validaciones, autentica por OIDC, construye
   imágenes privadas identificadas por SHA y actualiza API y web, sin tocar sus
   secretos ni la base de datos. Hay una sola publicación a la vez, sin cancelar
   otra a mitad de una actualización. No se publican ramas personales ni forks.
   Antes de actualizar se comprueba que el SHA siga siendo el actual de main,
   una validación lenta de un commit anterior no reemplaza una versión más reciente.
4. Verificar Actions y el enlace del resumen. Un merge sin conflictos no sustituye
   estas comprobaciones. La configuración inicial debe existir antes del primer
   workflow de publicación, su ausencia hace fallar la publicación claramente.
5. Solicitar al dueño del repositorio que proteja main con los controles de CI y
   el flujo de PR del equipo, no habilitar publicación de cualquier rama. Nunca usar
   la identidad de despliegue para PR no confiables, nunca usar
   `pull_request_target` para ejecutar código de PR con acceso Azure.

## Operación y recuperación

### Dominio propio

DNS se administra en Name.com, no contratar otro alojamiento ni certificado.
La web está en `ca-convi-web-estandar` y el entorno en
`cae-convi-estandar-pruebas`, ambos en `rg-convi-pruebas`.

| Tipo | Host en Name.com | Destino |
| --- | --- | --- |
| A | vacío (raíz) | `20.201.94.113` |
| CNAME | `www` | `ca-convi-web-estandar.jollydune-312063d0.brazilsouth.azurecontainerapps.io` |
| TXT | `asuid` | Identificador público de verificación de la web |
| TXT | `asuid.www` | El mismo identificador público |

Consultar el identificador con `az containerapp show -g rg-convi-pruebas -n
ca-convi-web-estandar --query properties.customDomainVerificationId -o tsv`.
Después de propagar DNS, agregar cada hostname con `az containerapp hostname add`
y enlazar certificado administrado con `az containerapp hostname bind`, usando
validación `CNAME` para www y `HTTP` para la raíz. No basta crear los registros:
comprobar estado del certificado y una petición HTTPS con validación normal.
El script conserva `customDomains` al repetir Aplicaciones y el workflow solo
actualiza imágenes, sin sustituir enlaces de certificados.

No cambiar Site URL al dominio propio hasta que HTTPS funcione, después probar
un correo nuevo de invitación y su activación. Las sesiones pertenecen al hostname:
al pasar desde la URL Azure al dominio propio hay que iniciar sesión otra vez.
El certificado se administra en Azure; la renovación del dominio es independiente
y la renovación automática de Name.com está desactivada por Sebastian.

### Encender, apagar y recuperar las aplicaciones

- El escalado a cero ahorra cómputo, una visita lo reactiva. Detener explícitamente
  todas las revisiones activas de ambas apps evita que se atiendan visitas hasta
  volver a activar una revisión, ACR y otros recursos conservan sus propios costes.
- Un Contributor del grupo puede hacerlo desde Container App → Revisions,
  **Deactivate/Activate**, con coordinación del equipo. No eliminar el grupo para
  apagar una demo. Un despliegue nuevo puede volver a activar las aplicaciones.
- Configuración vigente: mínimo uno en ambas apps. Volver la web a cero requiere
  actualizar también Bicep; la API debe continuar disponible mientras haya trabajos.
- Para volver al código previo, seleccionar sus revisiones guardadas de **ambas**
  apps o sus imágenes SHA anteriores. No reconstruir un tag antiguo con código nuevo.
- No hay rollback automático de datos, revisar compatibilidad antes de migraciones.
  Conservar imágenes necesarias y limpiar versiones antiguas después de comprobar
  que ya no sirven para recuperación, revisar consumo semanalmente.
- Las imágenes usan usuarios sin privilegios, no montan el código ni node_modules
  del computador y no contienen `.env.cloud`, tests ni fuentes de la API.
- Las cookies de sesión son Secure en producción, HSTS se aplica en la web de
  producción. El HTTP local de desarrollo se conserva. El identificador de build
  permite que una pestaña desactualizada recargue tras una publicación.

## Criterios pendientes para cerrar PB-145

- Construir y arrancar ambas imágenes, verificar archivos estáticos y ausencia de
  secretos/copias de `.env`, versiones de dependencias y usuario sin privilegios.
- Validar plantillas, disponibilidad/cuota Azure y despliegue completo.
- HTTP público redirige a HTTPS, certificado válido, HSTS, cookies Secure y cero
  contenido mixto, API inaccesible desde Internet y accesible desde web por HTTPS.
- PostgreSQL con verificación de CA/host, Supabase Auth/Storage HTTPS.
- Login/MFA/logout, registro de escuela e invitación/activación en la URL publicada,
  probar una sesión existente y el desarrollo local sin romper a los compañeros.
- Primer workflow real sobre main con controles aprobados, recuperación documentada
  y comprobada, consumo observado. No confundir build local con despliegue probado.

## Comprobaciones locales realizadas

- Ambas imágenes compiladas con el lockfile, usuario `node` (UID1000), API unos
  91MB y web unos96MB, sin `.env.cloud` ni fuentes `src` de API en la imagen final.
- Web de producción en un puerto local separado: login200 y recursos estáticos200,
  HSTS presente, portales Admin/Convivencia sin sesión redirigen303 a login,
  Profesor solo entrega el shell con redirección a login, sin datos protegidos.
- API de producción con configuración ficticia y base local: raíz200,
  auth/sesion y admin/contexto sin sesión401. Sin modificar datos cloud.
- 32 pruebas existentes de API, oxlint API sin hallazgos, ESLint completo web y
  build Next con TypeScript correctos, formato de cuatro TS modificados correcto.
- Nueve comprobaciones externas del script con Azure/Docker simulados: argumentos,
  proveedores, salida sin claves, dos imágenes, limpieza del JSON privado en éxito
  y fallo, restauración del entorno, fallo de build y rechazo de TLS sin verify-full.
- Supabase SSR real con token ficticio y fetch simulado confirma Secure en producción
  y compatibilidad HTTP en desarrollo. Sin archivos de prueba nuevos en Git.
- Bicep compilado y simulación Azure real aprobada en Brazil South, se verificó
  la restricción regional efectiva antes de crear la base. Sin rediseño de interfaz.

Referencias oficiales: [Container Apps](https://learn.microsoft.com/azure/container-apps/),
[OIDC con identidad administrada](https://learn.microsoft.com/azure/developer/github/connect-from-azure-identity),
[cifrado interno](https://learn.microsoft.com/azure/container-apps/ingress-environment-configuration),
[facturación](https://learn.microsoft.com/azure/container-apps/billing).

## Primera mejora de rendimiento, 16 de octubre de 2026

Registro histórico: en esta primera mejora se conservó `minReplicas: 0`.
El piloto del 17/10 y la autorización posterior de web encendida lo reemplazan.
En aquella mejora no se contrataron recursos ni se cambió el modelo
de datos. La API reutiliza las conexiones inactivas durante 60 segundos, en lugar
de los 10 predeterminados. Esto evita abrir otra conexión cuando alguien tarda
unos segundos en pasar a otra pantalla; no mantiene encendido un contenedor
escalado a cero. El máximo del pool no cambia y sigue siendo 10 por proceso.

El inicio de la transacción y `SET LOCAL ROLE` viajan juntos, como SQL fijo.
La identidad y la escuela siguen siendo parámetros separados; se conservan
aislamiento, comprobación de membresía, MFA, bloqueos, COMMIT/ROLLBACK y descarte
de conexiones dañadas. No se agregaron tablas, columnas, índices ni migraciones.

Mediciones de referencia (no equivalen al tiempo de una página completa):

| Escenario | Antes | Después |
| --- | --- | --- |
| Viajes SQL para resolver la cuenta | 5 | 4 |
| Viajes para una operación de establecimiento con un SELECT de trabajo | 9 | 8 |
| Transacción sintética de solo lectura, equipo → cloud, mediana de 6 muestras | 764,5 ms | 599 ms |

Las muestras se alternaron sobre la misma conexión. No se consultaron datos de
personas ni se hicieron escrituras. El ahorro de esa transacción fue aproximadamente
22 %; el de cada pantalla depende de sus consultas y debe medirse tras publicar.

El diagnóstico previo desde Azure mostró unos 25 segundos para despertar la API
y 96–97 ms para su raíz ya caliente, sin consultar la base. Una conexión nueva a
PostgreSQL tardó 825 ms y SELECT 1, 117–119 ms. Esta mejora no elimina el arranque
en frío. No usar un ping periódico como supuesto ahorro: también genera actividad.

Validación local: 32 pruebas existentes, compilación, lint y formato de API;
49 comprobaciones externas de autorización, transacciones y limpieza de contexto
con PostgreSQL local. Las pruebas adicionales se mantienen fuera del repositorio.
La revisión posterior quitó la consulta duplicada a la base del proxy de Admin:
este valida la sesión firmada y cada endpoint autoriza cuenta, escuela y MFA.
Convivencia conserva su control previo. No se cachean permisos entre solicitudes.
PB-131/PB-137 conservan su responsable y requieren sus propios escenarios de aceptación.

La imagen publicada se actualiza con el flujo habitual de PR, merge y Actions.
Hasta ese despliegue, la web online conserva el código anterior. Comparar después
las mismas rutas con la misma cuenta, tanto en caliente como tras inactividad.

### Diagnóstico de los seis segundos y carga de Admin

Sebastian observó 5 s al entrar después de MFA y unos 6 s entre Usuarios y Cursos
en la versión publicada, antes de estos cambios. No es una medición automatizada
ni un percentil de carga. La primera mejora de transacciones, por sí sola, no
resolvía la cadena de peticiones de cada pantalla.

EXPLAIN ANALYZE de lecturas reales cloud, conservando el contexto autorizado:
resolver membresía ejecutó en 0,39–0,44 ms, encabezado en 1,25–1,28 ms y usuarios
en 2,63–2,66 ms. Desde el equipo, cada viaje tardó unos 145–169 ms. Las pruebas
separan ese coste del tiempo de ejecución dentro de PostgreSQL y no imprimen datos
de personas. No se justifican índices o triggers para corregir esos viajes de red.

Se identificó una cadena serial: proxy → sesión → encabezado → contenido. Admin
ahora verifica la firma de sesión en el proxy y entrega datos únicamente a través
de los endpoints protegidos. Encabezado y listas son independientes. Los 401/403
conservan sus redirecciones y los fallos impiden mostrar los datos. El cache de
React del encabezado sigue limitado a la solicitud, nunca es un permiso persistente.

Cursos obtiene años, año elegido, niveles y cursos con `GET /admin/cursos/vista`,
una operación autorizada y una fotografía consistente de la escuela. Reutiliza
las consultas originales; las rutas individuales siguen disponibles. Se conserva
la elección: año solicitado propio, o el activo, o el más reciente; sin años se
muestra el mismo estado vacío. Un ID de otra escuela no permite consultar sus datos.
Con años son 3 lecturas en una transacción, frente a 3 peticiones y transacciones.

La aplicación está en Brazil South y el pooler de Supabase en us-east-1. La política
Students consultada permite Canada Central, South Africa North, Chile Central,
Brazil South y Mexico Central; no permite simplemente mover Azure a East US. Acercar
la base y la API merece evaluarse si queda latencia, pero exige preparar migración
y verificar también las políticas institucionales. No se cambiaron regiones, DNS,
datos, claves ni recursos. Mantener mínimo cero sigue permitiendo arranques en frío
que superan el objetivo de 1–2 s.

La meta pendiente es medir clic → contenido completo en las mismas rutas calientes
tras publicar; no declarar 1–2 s a partir de SELECT 1, una maqueta o una estimación.

Al reproducir solo la cadena SQL de Usuarios sobre cloud, con conexiones calientes
y las mismas consultas, las 3 muestras seriales fueron 5352/5057/5088 ms y las
paralelas 1780/1776/2526 ms: medianas 5088 y 1780 ms. El modelo serial incluye las
dos resoluciones previas y luego contexto y lista; el nuevo las pide en paralelo
sin esas dos resoluciones duplicadas. Ya usa el inicio de transacción agrupado en
ambos casos, por lo que no mezcla ese ahorro con el de la cadena. Excluye Supabase
Auth, HTTP y navegador: no es una medición end-to-end ni garantiza un máximo.

En la escuela cloud sin años, agrupar Cursos redujo viajes totales de 24 a 12,
pero no dio un ahorro estable de tiempo frente a dos listas que ya eran paralelas:
las muestras quedaron aproximadamente entre 1,8 y 2,4 s. Con años se elimina además
la segunda fase secuencial de carga de cursos. No atribuir todo el ahorro a agrupar.

Pasaron además 68 comprobaciones aisladas de la web y 70 de la vista de Cursos,
incluidas comparaciones contra los servicios anteriores en dos escuelas locales,
selección de años, MFA y rechazo de otra escuela, sin modificar datos. TypeScript,
ESLint web, build Next en imagen de producción, 32 pruebas existentes, compilación,
lint y formato de API correctos. Las pruebas adicionales están fuera del repositorio.

Referencias: [autorización y Proxy en Next.js](https://nextjs.org/docs/app/guides/authentication#optimistic-checks-with-proxy-optional),
[EXPLAIN de PostgreSQL](https://www.postgresql.org/docs/current/using-explain.html),
[regiones de Supabase](https://supabase.com/docs/guides/platform/regions),
[reubicación de Container Apps](https://learn.microsoft.com/azure/container-apps/relocate-region).


## Piloto de importaciones en segundo plano: PB-027, 17/10/2026

Sebastian aprobó este piloto para probar CONVI online hasta cerca de fin de año
y revisar el consumo real al mes. El PR36 de Camilo aporta BullMQ, trabajador,
avance y Reanudar; ambos PR ya se fusionaron y publicaron en `07d5b2c`. No se cambian
tablas, columnas, permisos ni migraciones.

`redis-convi-vpko3nqhasxza` se declara en `infra/azure/redis.bicep`: Balanced B0,
sin alta disponibilidad, autenticación por clave habilitada, TLS mínimo 1.2,
protocolo cifrado, NoCluster y NoEviction. No usar OSSCluster con el cliente
ioredis del PR ni permitir que Redis elimine trabajos al llenarse.

`aplicaciones.bicep` recibe `redisUrl` como parámetro seguro, guarda `redis-url`
y lo entrega únicamente como `REDIS_URL` a `ca-convi-api-estandar`. El script lee
`AZURE_REDIS_URL` del archivo privado y valida TLS antes de construir imágenes.
La web no recibe esta clave. El workflow de GitHub solo actualiza imágenes y
conserva la configuración; no necesita otra variable o secreto en GitHub.

La API mantiene una réplica para que el trabajador continúe aunque no haya
visitas; máximo uno conserva el escenario probado por Camilo. Esto evita el
escalado a cero de la API, pero no elimina reinicios, despliegues o fallos. Sebastian
autorizó también mínimo uno en la web después de medir su arranque en frío.
No se modifica el entorno Express antiguo bloqueado.

### Coste y límites del piloto

Estimación consultada el 17/10/2026, Brazil South, 730 h/mes, USD antes de
impuestos, cuotas gratuitas y consumos adicionales:

| Recurso | Supuesto | Estimación mensual |
| --- | --- | ---: |
| Redis B0, un nodo | 0,023 USD/h, siempre asignado | 16,79 USD |
| API mínima 1 | Desde todo idle hasta todo activo | 5,91–19,71 USD |
| Web mínima 1 | Aproximadamente 2 h activas y 22 h idle al día | 14,13 USD |
| ACR Basic | 0,1666 USD/día | 5,07 USD |
| Total de referencia | Antes de cuotas y extras | 41,90–55,70 USD |

El presupuesto de aviso es 60 USD/mes, no un tope ni una garantía de consumo.
La web puede consumir más que el supuesto: activa 24 h/día serían unos 39,42 USD
solo de web, antes de cuotas. Las cuotas gratuitas se comparten a nivel de
suscripción; no se suman los créditos de los tres integrantes. Los 100 USD
nominales cubrirían aproximadamente 1,8–2,4 meses del escenario de referencia,
dependiendo del saldo y actividad real. Revisar Cost Management → Cost analysis
en el grupo y Education → crédito restante; el gasto tarda en aparecer.

Redis y ACR tienen coste aunque no entren usuarios. Quitar REDIS_URL o cerrar el
navegador no detiene ese coste. Si se decide volver a local, primero resolver o
detener las confirmaciones pendientes y acordar retirar los recursos facturables;
no se eliminan recursos automáticamente ni se corta el sitio por alcanzar la alerta.

El piloto de un nodo no admite persistencia AOF/RDB: Azure exige alta disponibilidad
para habilitarla. Puede perderse la cola por fallo o mantenimiento. Las filas ya
confirmadas quedan en PostgreSQL; tras publicar PB-027, Reanudar permite continuar
desde las pendientes. No equivale a recuperación automática ni alta disponibilidad.
La alternativa de dos nodos añadiría aproximadamente 16,79 USD/mes y necesita una
decisión de presupuesto aparte. No se ha contratado.

### Comprobación y recuperación

Resultado inicial del 17/10, antes de los merges: despliegue `convi-redis-piloto`
Succeeded, Redis 7.4.3.
La API quedó Ready en revisión `ca-convi-api-estandar--0000005`, con REDIS_URL
referida al secreto. Se comprobó AUTH/PONG desde ese contenedor con validación de
certificado y TLS mínimo 1.2. La imagen de API y web en esa comprobación estaba identificada por
`95c3ca8ea37fc6575f1ad9bbde5920111e1a9b03`; no se adelantó el código de PR36.
Ambos dominios devolvieron HTTP200 en /login por HTTPS. Las referencias a secretos
Supabase, su configuración pública, el ingreso interno y los dominios se conservaron.

Con BullMQ 6.3.11 e ioredis 5.11.1 se verificaron encolar, progreso, fallo ficticio,
reintento y finalización usando una cola de nombre único. Se eliminó solo esa cola;
no se usaron trabajos reales, PostgreSQL ni FLUSHDB. Ambas plantillas compilaron
y el script pasó comprobaciones simuladas de TLS, codificación de clave, preservación
de variables/dominios, aislamiento de Docker local y limpieza de parámetros privados
en éxito y error. Las pruebas adicionales están fuera del repositorio.

Antes de avisar que Redis está listo: comprobar TLS y PONG desde la API real,
configuración NoEviction/NoCluster y una cola ficticia aislada con las versiones
del PR. No usar FLUSHDB/FLUSHALL ni la cola real para verificar conectividad.
Después del merge y publicación de PR36, revisar que no aparezcan los avisos
«Falta configurar REDIS_URL» o «No hay conexión con Redis» y confirmar un archivo
pequeño en convi.tech: respuesta rápida, progreso, finalización y reanudación.
La conectividad por sí sola no valida esa prueba funcional completa.

Si falla la cola, los demás endpoints deben seguir atendiendo. Quitar REDIS_URL
deshabilita confirmar; no restaura el código síncrono anterior. Para recuperar ese
comportamiento hay que volver a la revisión/imagen previa compatible. No borrar
Redis ni cambiar su política de clúster para solucionar errores sin revisar antes
los trabajos pendientes. Ningún secreto debe aparecer en Git, Sheet o logs.

Fuentes: [Managed Redis](https://azure.microsoft.com/en-us/pricing/details/managed-redis/),
[facturación Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/billing),
[persistencia y requisito de HA](https://learn.microsoft.com/en-us/azure/redis/how-to-persistence),
[conexiones BullMQ](https://docs.bullmq.io/guide/connections).

## Corrección de lentitud de importaciones, 17/10/2026

Rama `sebastian/rendimiento-importaciones`. Trabajo transversal a PB-019,
PB-020, PB-026 y PB-027; conserva los responsables y la lógica de confirmación
de Camilo. Sin tablas, columnas, índices ni migraciones nuevas. El código de
esta sección está preparado localmente; falta commit, PR y publicación.

### Diagnóstico y cambios

- En ExcelJS 4.4.0, `Worksheet.columnCount` recorre las filas. Consultarlo en la
  condición del bucle de cada celda multiplicaba el trabajo aproximadamente de
  forma cuadrática. Ahora se calcula una vez por hoja.
- Los XLSX desde 256 KiB se leen en un hilo de Node separado del que atiende
  peticiones. Se transfiere una copia para conservar el archivo original que
  luego se guarda en Storage. El hilo no hereda variables de entorno privadas;
  no es un sandbox de seguridad ni obtiene recursos adicionales.
- Se admite una lectura pesada por proceso; otra recibe 503 antes de escribir
  en PostgreSQL o Storage. No queda una carga pendiente oculta. Los CSV y XLSX
  pequeños pueden seguir leyéndose. El hilo se termina a los 45 segundos si no
  acaba, devuelve un error recuperable y libera la capacidad para reintentar.
- Carga y revisión escriben lotes de hasta 1.000 filas dentro de la misma
  transacción, sin elevar el `statement_timeout` de cinco segundos. Una falla
  deshace todos los lotes. La revisión omite filas cuyo estado, datos normalizados
  y problemas son idénticos, incluyendo valores NULL.
- La barra de avance mantiene como máximo una petición en vuelo. Una respuesta
  lenta ya no se acumula con consultas posteriores ni reemplaza un avance más nuevo.

### Mediciones y alcance

Docker local, imagen de producción, Node 22, 512 MiB, sin red. Se usó el mismo
XLSX de 5.000 filas y unos 4,4 MB, sin imprimir sus celdas. Son ensayos del lector,
no tiempos completos de subida, revisión, confirmación o navegación.

| Lector | Límite CPU | Tiempo de lectura |
| --- | ---: | ---: |
| Original | 0,25 CPU | Más de 270 s; benchmark detenido sin terminar |
| Original | 1 CPU | 178,8 s |
| Corregido, imagen final con hilo | 0,25 CPU | 17,4 s |
| Corregido, imagen final con hilo | 1 CPU | 6,3 s |

Con 20 filas: 0,36 s a 0,25 CPU y 0,11 s a 1 CPU en esos ensayos finales.
La salida de las 5.000 filas del hilo coincide íntegramente con la lectura
directa y el Buffer original queda intacto. El ensayo intermedio sin hilo dio
10,6 s a 0,25 CPU: el hilo añade coste, pero reduce el bloqueo del proceso que
atiende páginas. En la prueba final a 0,25 CPU, el retraso máximo del bucle
principal fue unos 0,70 s y el proceso usó unos 202 MiB de RSS máximo.
Estas cifras no garantizan la misma duración bajo tráfico real.

Prueba PostgreSQL local con RLS y rollback: repetir la revisión de 5.000 filas
sin cambios pasó de unas 6,9 s y 5.000 reescrituras a 1,5 s y cero reescrituras
con los cinco lotes. Cambios reales y NULL también comprobados. La carga real
del servicio con 5.000 filas ficticias conservó atomicidad: una falla provocada
en el tercer lote no dejó proceso, archivo ni filas parciales, ni llamó Storage.
Se comprobaron formatos de celdas, codificación CSV, encabezados repetidos,
límites, capacidad ocupada, error del hilo, vencimiento y recuperación posterior.
Pasaron las 32 pruebas existentes de API, lint de API y web, compilaciones de
API, web e imagen API de producción y compilación de Bicep. Otras 22 comprobaciones
externas cubrieron errores de Storage/SQL/COMMIT y contratos ya existentes.
Las pruebas adicionales permanecen fuera de Git y las dos muestras privadas
binarias se eliminaron al terminar; no se registraron celdas ni credenciales.

En Azure, antes de estos cambios, la API alcanzó su cuota de 0,25 CPU con cero
reinicios y unos 261 MiB de memoria máxima sobre 512 MiB. Las consultas de
lectura medidas bajo el rol de la aplicación no explicaban por sí solas 50 s:
conteo de 4.500 filas unos 352 ms de servidor; muestra de 50 filas unos 4 ms.
No se pudo precisar qué etapa produjo los 50 segundos reportados por Camilo.

La web escalada a cero tardó 23,3 s en responder /login y, ya activa, 0,4 s.
Sebastian autorizó mínimo uno y la alerta USD60; ambos cambios se aplicaron
sin reemplazar imágenes ni dominios. Después, /login respondió HTTPS200 en
0,54 s. Esto evita dormir por inactividad, no esperas por reinicios/despliegues.
La API conserva 0,25 CPU/0,5 GiB: la prueba de 1 CPU fue solo local.

Después de publicar, repetir los mismos archivos midiendo por separado subir,
revisar y confirmar, además de navegar mientras trabaja. La confirmación conserva
su cola, tramos y operaciones por fila; no atribuirle la mejora medida del lector
ni prometer tiempos máximos de un segundo para importar miles de filas.

Referencias: [código ExcelJS 4.4.0](https://github.com/exceljs/exceljs/blob/v4.4.0/lib/doc/worksheet.js),
[hilos Node 22](https://nodejs.org/docs/latest-v22.x/api/worker_threads.html),
[escalado Container Apps](https://learn.microsoft.com/en-us/azure/container-apps/scale-app).

### Segunda revisión: viajes a Supabase y confirmación

Sebastian pidió investigar más mejoras conservando las funciones. Se consultaron
las guías oficiales de rendimiento, conexiones, RLS y regiones de Supabase,
y la documentación PostgreSQL 17 de SAVEPOINT, RELEASE y RETURNING.
Esta ronda conserva escuela, permisos, MFA, auditoría, cola, errores por fila,
reanudación y duplicados. No cambia la estructura ni las políticas de la base.

- El detalle de una importación obtiene los años editables en la consulta del
  proceso y calcula el total con el resumen por estado que ya necesita devolver.
  Pasa de cuatro consultas de negocio a tres y de dos conteos completos a uno.
  El listado conserva su contrato y su propio total por importación.
- El contexto de una importación de Cursos omite la consulta de personas,
  estudiantes y cuentas, que su validación no usa. Los otros cinco tipos
  conservan su contexto completo. No cambia ningún dato ni opción de pantalla.
- Al confirmar, cerrar el punto de guardado anterior y abrir el siguiente
  comparten una llamada con SQL fijo, dentro de la misma conexión/transacción.
  Cada fila conserva su rollback; no se acumulan puntos de guardado abiertos.
- Crear una persona nueva y su ficha de estudiante usa una sentencia con
  `WITH ... INSERT ... RETURNING`. Ambas altas mantienen sus restricciones,
  RLS y disparadores. La búsqueda y reutilización del estudiante existente
  conservan sus reglas; no se usan nombres para identificar duplicados.

Comparación local con servicios reales, PostgreSQL/RLS, 60 estudiantes nuevos,
dos tramos y cola/Storage simulados: el trabajador pasó de 331 a 213 llamadas a
la base (118 menos, alrededor del 36 %). Con un fallo SQL provocado después de
guardar una fila, de 332 a 215; las otras 59 se confirmaron y la fallida no dejó
persona huérfana. Los conteos de auditoría por recurso/acción y los resultados
coincidieron entre las implementaciones. No es una medida del tiempo online.

El detalle devolvió exactamente los mismos valores y errores con filtros,
estados sin filas y páginas fuera de rango. Se compararon los seis contextos;
se comprobó aislamiento entre dos escuelas. Los ensayos se deshacen mediante
rollback y no envían correos ni escriben en Supabase cloud.
Un fallo general provocado tras escribir un estudiante revirtió el tramo entero;
el reintento confirmó los 60. Otra importación reutilizó esas fichas sin duplicar
personas. El límite 429 de invitaciones se simuló: las filas quedaron disponibles
para reintentar y no quedaron cuentas pendientes sin invitación. Pasaron lint,
las 32 pruebas existentes, build de API y la imagen de producción actualizada.

Lectura agregada de estadísticas existentes de Supabase, sin mostrar consultas
ni valores: grupo `filas_importacion`, 262 llamadas históricas, media de ejecución
48,20 ms y máximo 3.077,13 ms; resolver membresía, 1.866 llamadas, media 1,77 ms.
Son grupos de sentencias y un historial compartido: no representan una sola
importación ni incluyen tiempo de red, espera del pool, Auth o parseo del Excel.
La conexión usa el pooler `us-east-1`, puerto 5432 (sesión), apropiado para un
backend persistente IPv4. La API está en Brazil South. No cambiar de modo de
pool ni multiplicar conexiones sin medir una espera real del pool.

Dos candidatos posteriores:

1. **Regiones próximas.** Reducir la distancia API/PostgreSQL puede beneficiar
   cada consulta secuencial. Requiere planificar una migración o un despliegue
   distinto con sus políticas, secretos, dominio y coste; no forma parte de
   estos cambios. Una réplica de lectura no acelera las escrituras de importación.
2. **RLS con initPlan.** El modelo llama funciones de sesión por fila. Supabase
   documenta envolver funciones que no dependen de la fila en `SELECT` para
   evaluarlas por sentencia. Aplicarlo requiere revisar políticas y demostrar
   equivalencia de permisos. No corresponde cambiar una función que sí dependa
   de cada registro ni desactivar RLS para obtener velocidad.

Tampoco se sustituye esta importación por COPY: PostgreSQL no admite COPY FROM
con RLS aplicada al rol. La importación de CONVI necesita conservar validación,
aislamiento, vista previa, auditoría y recuperación. El pool ya se reutiliza;
las transacciones siguen usando el mismo cliente y el DSN conserva verify-full.
No se agregan dependencias ni se amplían recursos de Azure en esta ronda.

Fuentes: [rendimiento Supabase](https://supabase.com/docs/guides/platform/performance),
[conexiones](https://supabase.com/docs/guides/database/connecting-to-postgres),
[casos y buenas prácticas RLS](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv),
[regiones](https://supabase.com/docs/guides/platform/regions),
[RETURNING](https://www.postgresql.org/docs/17/dml-returning.html),
[SAVEPOINT](https://www.postgresql.org/docs/17/sql-savepoint.html),
[COPY y RLS](https://www.postgresql.org/docs/17/sql-copy.html).

### Prueba online y confirmación por lotes (17 de octubre de 2026)

La versión publicada `6118098` completó una importación ficticia de 20
estudiantes: 20 fichas guardadas y ninguna fila omitida. La escuela de prueba
no tenía años; Sebastián autorizó crear 2026 Planificado, sin activarlo.
Un XLSX ficticio de 5.000 filas y 405 KiB abrió su vista previa en unos 21 s
y sus 5.000 filas quedaron válidas. No es una prueba de un archivo de 5 MiB.
Los tiempos observados incluyen la navegación y el control del navegador;
los avisos de confirmación impidieron cronometrar con precisión el caso de 20.

La confirmación masiva sí mostró otro cuello de botella: 550 filas confirmadas
en 220 s, y 1.850 en 713 s. Seguía Procesando y avanzando, sin filas Con error
en esas lecturas. La estimación a ese ritmo era de unos 33 minutos, no una
medición final. Navegando durante el trabajo, Usuarios respondió en unos 2,9 s
y Cursos en unos 11,1 s. El flujo en segundo plano funcionaba, pero esos tiempos
no cumplen el objetivo de rendimiento. La API estaba Running, mínimo uno,
0,25 CPU y 0,5 GiB; no era un arranque desde cero.

Se preparó una tercera mejora, pendiente de commit y publicación:

- El trabajador mantiene sus transacciones de 50 filas, su cola y sus permisos.
  Los estudiantes se buscan por código y RUT en conjunto. El código conserva
  prioridad cuando ambos identifican fichas diferentes. Las fichas existentes
  se reutilizan sin cambiar sus datos, conforme a la opción elegida.
- Para estudiantes nuevos, las personas, fichas y matrículas opcionales se
  insertan en conjunto mediante CTE y `RETURNING`, con SQL parametrizado.
  RLS, restricciones y disparadores siguen ejecutándose. Año, curso y fecha
  usan los mismos controles de la ruta por fila; los bloqueos duran el tramo.
- Si un estudiante existente trae curso, si se repite un código o RUT dentro
  del tramo o si corresponde marcar duplicados como error, se conserva la
  ruta por fila. También sigue usándose para los otros tipos de importación.
- El lote tiene su propio SAVEPOINT. Un error esperado lo revierte y permite
  identificar las filas fallidas con el método anterior. Un error inesperado
  sigue revirtiendo el tramo completo. Tras revertir, se descarta la memoria
  de cursos/año para volver a leerlos y adquirir sus bloqueos al reintentar.
  No se amplían timeouts ni se ignoran errores para obtener velocidad.

Comparación local de servicios reales con PostgreSQL, rol `convi_backend`,
RLS y rollback final:

| Caso del trabajador | Consultas anteriores | Consultas por lotes |
| --- | ---: | ---: |
| 60 estudiantes nuevos sin curso, dos tramos | 213 | 39 |
| Los mismos 60 con un fallo SQL provocado en una fila | 215 | 192 |
| Reutilizar 60 fichas ya existentes | — | 37 |
| 20 estudiantes nuevos con matrícula | 105 | 28 |
| Curso cerrado después de encolar: 19 confirmadas y una fallida | 106 | 112 |

El caso de error puede necesitar consultas adicionales para recuperar la ruta
por fila; se privilegia conservar el resultado. Resultados, acciones y conteos
de auditoría por recurso coincidieron con la implementación anterior. Se
comprobaron mezcla de nuevos/existentes, datos previos intactos, prioridad del
código sobre el RUT, fechas y campos opcionales, fallo de búsqueda recuperable,
error tras escribir, reintento sin duplicados y aislamiento entre escuelas.
Una confirmación local de 5.000 nuevos sin curso terminó en unos 30–33 s,
1.411 consultas, 5.000 confirmadas y cero errores. No es un tiempo de Azure.
Las pruebas adicionales quedan fuera de Git y revierten sus datos locales;
no envían correos ni modifican la estructura de la base.

La imagen final de producción también se probó con 0,25 CPU y 512 MiB, usando
PostgreSQL local y un CSV ficticio de 5.000 filas: carga 3,5 s, revisión 3,6 s,
confirmación 33,1 s, 1.411 consultas del trabajador, 5.000 confirmadas y cero
errores; RSS al finalizar 108 MiB, no una medición de su máximo. Storage y
cola se simularon; se usaron los servicios, SQL y RLS reales y rollback final.
Pasaron compilación, lint, las 32 pruebas existentes de API y construcción de
la imagen Docker. La prueba no incluye red Azure/Supabase ni tráfico concurrente.

La distancia Brazil South / Supabase us-east-1 sigue siendo un candidato a
investigar con mediciones desde la API. El ping de 142–148 ms se midió desde
el equipo de desarrollo, no desde Azure. Las estadísticas agregadas de SQL
no incluyen esa red. Esta mejora reduce viajes mediante operaciones sobre
conjuntos; no cambia de driver, no activa pipeline de libpq, no migra regiones
ni aumenta recursos o costes contratados.

Fundamento: PostgreSQL explica el coste acumulado de muchos viajes pequeños
en su [documentación de latencia y pipeline](https://www.postgresql.org/docs/17/libpq-pipeline-mode.html#LIBPQ-PIPELINE-WHEN-TO-USE).
Supabase recomienda considerar la cercanía a la base para trabajo intensivo
en datos en su [guía de ejecución regional](https://supabase.com/docs/guides/functions/regional-invocation).
Después de publicar hay que repetir la prueba online antes de atribuirle
un porcentaje o duración garantizados a la mejora.
