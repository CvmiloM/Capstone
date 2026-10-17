# PB-145: CONVI en Azure con HTTPS

Actualización 17/10/2026: piloto Redis de PB-027 creado y conectado a la API;
API mínima/máxima 1/1 y web 0/1. Presupuesto de aviso actualizado a USD45.
TLS/PONG desde la API y BullMQ con una cola ficticia comprobados. PR36 de Camilo
sigue pendiente de merge y de la prueba funcional publicada. Los cambios de
infraestructura y documentación están preparados; Git lo maneja Sebastian.
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
  para que el trabajador siga sin visitas. Web 0,5 vCPU/1 GiB con mínimo cero y
  máximo una réplica; la web aún puede tener arranque en frío.
- Azure Managed Redis Balanced B0 de un nodo, TLS, NoEviction y NoCluster,
  en Brazil South. Sin alta disponibilidad ni persistencia; ver el apartado del piloto.
- **Container Registry Basic tiene coste por día incluso con las apps apagadas**,
  más almacenamiento/tráfico que supere lo incluido. No asumir que una oferta
  gratuita para otro SKU lo cubre. Tarifa pública consultada en Brazil South:
  USD0,1666/día, aproximadamente USD5 por 30 días, antes de extras y condiciones
  de la suscripción. Las imágenes se construyen en Docker/GitHub, no ACR Tasks.
- Presupuesto mensual de aviso originalmente USD10, actualizado a USD45 para el
  piloto aprobado del 17/10. Conserva destinatarios y umbrales 50/80/100 %. No corta el gasto.
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
- En una defensa se puede fijar temporalmente mínimo uno, volver a cero después.
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

Se conserva `minReplicas: 0`: no se contrataron recursos ni se cambió el modelo
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
avance y Reanudar; la infraestructura se prepara antes de su merge. No se cambian
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
escalado a cero de la API, pero no elimina reinicios, despliegues o fallos. La web
conserva mínimo cero. No se modifica el entorno Express antiguo bloqueado.

### Coste y límites del piloto

Estimación consultada el 17/10/2026, Brazil South, 730 h/mes, USD antes de
impuestos, cuotas gratuitas y consumos adicionales:

| Recurso | Supuesto | Estimación mensual |
| --- | --- | ---: |
| Redis B0, un nodo | 0,023 USD/h, siempre asignado | 16,79 USD |
| API mínima 1 | Desde todo idle hasta todo activo | 5,91–19,71 USD |
| Web mínima 0 | Aproximadamente 2 h activas al día | 3,29 USD |
| ACR Basic | 0,1666 USD/día | 5,07 USD |
| Total de referencia | Antes de cuotas y extras | 31,06–44,86 USD |

El presupuesto de aviso es 45 USD/mes, no un tope ni una garantía de consumo.
La web puede consumir más que el supuesto: activa 24 h/día serían unos 39,42 USD
solo de web, antes de cuotas. Las cuotas gratuitas se comparten a nivel de
suscripción; no se suman los créditos de los tres integrantes. Los 100 USD
nominales cubrirían aproximadamente 2–3 meses del escenario de referencia,
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

Resultado del 17/10: despliegue `convi-redis-piloto` Succeeded, Redis 7.4.3.
La API quedó Ready en revisión `ca-convi-api-estandar--0000005`, con REDIS_URL
referida al secreto. Se comprobó AUTH/PONG desde ese contenedor con validación de
certificado y TLS mínimo 1.2. La imagen de API y web sigue identificada por
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
