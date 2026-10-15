# Supabase cloud y Docker

Web y API siguen ejecutándose en Docker. Supabase cloud aloja Auth y PostgreSQL.
La base local se conserva para desarrollo separado; sus usuarios, QR y datos
no se copian automáticamente a la nube.

## Archivos y arranque

- `.env`: entorno local, el script completa sus claves desde Supabase local.
- `.env.cloud`: entorno cloud, privado y ya ignorado por Git. El script no
  escribe sus claves ni inicia Supabase local cuando se elige Cloud.
- `compose.yaml`: permite indicar la URL de Supabase de ambos servidores.
- `.env.example`: ejemplo sin credenciales, usado como base de configuración.
- `scripts/iniciar.ps1`: selecciona el entorno y comprueba la configuración.
- `supabase/certs/prod-ca-2021.crt`: certificado público ofrecido por el panel
  oficial de Supabase para verificar TLS, no es una clave privada.

Para arrancar con la base local:

```powershell
.\scripts\iniciar.ps1
```

Para arrancar con cloud, después de completar `.env.cloud`:

```powershell
.\scripts\iniciar.ps1 -Entorno Cloud
```

Se usan los mismos contenedores de web y API: el arranque Cloud siempre los
recrea para cargar el código recibido y su configuración, sin borrar volúmenes.
No permite trabajar
con ambas bases a la vez desde esos mismos contenedores. `-Build` solo hace
falta si cambian la imagen o sus dependencias, no por cambiar las URL.

## Configuración privada

Guardar las credenciales solo en `.env.cloud`, nunca en esta guía o el Sheet.
La URL del proyecto es pública, las claves privadas y contraseña de PostgreSQL no.

```dotenv
WEB_PORT=3000
API_PORT=3001
NEXT_PUBLIC_API_URL=http://host.docker.internal:3001
SUPABASE_URL=https://cwgydufnbpapinzauzui.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://cwgydufnbpapinzauzui.supabase.co
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_DB_URL=
```

La clave publicable se obtiene en Project Settings / API Keys. La conexión
privada se obtiene con Connect / Session pooler, puerto 5432. Incluir la
contraseña codificada para una URL y agregar `?sslmode=verify-full` (o
`&sslmode=verify-full` si ya tiene parámetros). Esto comprueba el certificado
del servidor, no basta desactivar su verificación para superar un error.

La conexión requiere la CA del proyecto, ya incluida en
`supabase/certs/prod-ca-2021.crt`. Agregar a la URL de PostgreSQL
`&sslrootcert=/workspace/supabase/certs/prod-ca-2021.crt`, conservando
`sslmode=verify-full`. La ruta corresponde al archivo montado dentro de Docker.
Si Supabase cambia su CA, descargar la nueva desde Database / Settings /
Download certificate y actualizar la conexión manteniendo su verificación.
No incluir una contraseña en comandos, capturas ni mensajes del equipo.

No definir estas mismas variables en la sesión de PowerShell: Docker da
prioridad a las variables del proceso sobre las de `--env-file`.
El modulo de cuentas de PB-010 ya necesita SUPABASE_SECRET_KEY, obtenida en
Project Settings / API Keys del mismo proyecto, para enviar invitaciones.
Se agrega solo a la API; jamás a variables NEXT_PUBLIC. Como alternativa
legacy admite SUPABASE_SERVICE_ROLE_KEY, no se necesitan ambas.
La API actual comprueba Auth con la clave publicable y consulta PostgreSQL
usando la conexión privada y los roles limitados del modelo.

## Modelo y Auth

Las cinco migraciones base crean el esquema `convi`, sus 51 tablas,
funciones, restricciones, roles y seguridad por fila, además del índice de
un único año activo por escuela. No exponer `convi` a anon/authenticated ni
añadirlo a los esquemas expuestos de la Data API: los datos pasan por NestJS.

La migración `20261014070000_consultar_registro_inicial.sql` añade una consulta
limitada para retomar el alta desde el login. Solo permite el registro si
el correo está confirmado y no existe ninguna membresía de esa identidad
o correo, incluidas invitaciones pendientes y cuentas suspendidas o revocadas.
No concede acceso al portal ni expone datos de otras cuentas. En cloud ya se
aplicó; para una base local existente ejecutar
`npx.cmd --yes supabase@2.117.0 migration up` antes de probar ese recorrido.

La CLI se vincula al proyecto con `supabase link --project-ref`; comprobar
`db push --dry-run` antes de `db push`. Mantener la versión 2.117.0 del equipo.
Las migraciones no copian cuentas ni datos locales y no configuran correos.
No usar `db reset` sobre el proyecto cloud ni modificar su historial a mano.

En Auth comprobar correo obligatorio, contraseña mínima de ocho caracteres,
TOTP habilitado y las plantillas del repositorio. La confirmación debe llevar
a `/confirmar-correo?token_hash=...&type=email`, como la plantilla existente.
Mientras la web esté local, Site URL es `http://localhost:3000`; configurar
los retornos necesarios y actualizarlos cuando se publique la aplicación.

Sin SMTP propio, los correos de Supabase están limitados a miembros del
equipo. Preparar SMTP y remitente antes de probar cuentas externas e invitaciones.

## Correos con Brevo

SMTP se configura una sola vez en Supabase / Authentication / Emails /
SMTP Settings. El equipo no necesita agregar la clave SMTP a sus archivos
locales. Usar el remitente verificado en Brevo, host `smtp-relay.brevo.com`,
puerto `587`, intervalo por usuario de `60` segundos y el Login exacto que
muestra Brevo. Password corresponde a la clave SMTP, no a una clave API ni
a la contraseña de la cuenta Brevo.

En Confirm sign up se guardó la plantilla `supabase/templates/confirmacion.html`
con el asunto "Confirma tu correo en CONVI". Su enlace usa Site URL y llega
a la ruta del servidor que verifica el correo antes de crear la escuela.
Mientras Site URL apunte a localhost, abrir el enlace en el computador que
ejecuta CONVI. Cada integrante debe usar el puerto 3000 para este recorrido.

En Invite user se guarda `supabase/templates/invitacion.html`, con asunto
"Te invitaron a CONVI". Esta plantilla incluye la membresía asignada por la
API y lleva a `/activar-cuenta`. La confirmación de registro y la invitación
son plantillas distintas; no sustituir una por la otra.

Después de traer nuevos módulos o cambiar `.env.cloud`, ejecutar
`.\scripts\iniciar.ps1 -Entorno Cloud` para que Docker cargue los valores nuevos.
El script usa `--force-recreate`: no depende de que los procesos en desarrollo
detecten todos los archivos nuevos del pull. Un `docker compose restart` no
incorpora cambios en las variables del archivo.
No ejecutar `docker compose up` sin seleccionar el entorno cloud, porque
Compose puede cargar el archivo local `.env`.

Brevo mantiene activo el bloqueo de IP SMTP. Se autorizó `3.216.26.214` tras
comprobar que el rechazo de Supabase coincidía con esa conexión bloqueada.
Los correos salen desde Supabase cloud, no desde los computadores del equipo.
Si cambia su IP de salida, comprobar el evento bloqueado antes de autorizar
la nueva dirección; no desactivar el bloqueo ni autorizar rangos completos.
El error `535` indica rechazo de credenciales; `525` indica IP no autorizada.

Por ahora se usa un remitente Gmail verificado. Brevo puede sustituir la
dirección de envío por una de su dominio. Un dominio propio y autenticado
queda para la publicación definitiva, junto con las URL públicas de retorno.

## Verificación realizada

Las cinco migraciones se aplicaron al proyecto `cwgydufnbpapinzauzui` y el
historial remoto coincide con el repositorio. El panel muestra el esquema
`convi` con 51 tablas y siete vistas, todavía sin datos de negocio importados.
El arranque Cloud pasó ocho comprobaciones en memoria con comandos simulados:
campos requeridos, URL HTTPS coincidente, TLS verificado, conservación de
ambos archivos privados, argumentos de arranque y protección del archivo local.
No se cambió la política de ejecución de PowerShell ni se guardaron pruebas
en el repositorio. El arranque real de Docker con cloud también fue comprobado.

La primera conexión rechazó las credenciales con `28P01`: la contraseña se
había generado en el panel pero no se había confirmado el cambio. Sebastian
lo completó y la conexión funcionó. Al volver a pegar la URI se restauraron
los parámetros SSL omitidos, sin cambiar ni mostrar la contraseña.

Se comprobó TLS 1.3 y certificado validado entre la API y el pooler, las 51
tablas con RLS activada y forzada, sin acceso al esquema para anon/authenticated,
cero escuelas para el backend sin contexto y permiso de registro para
convi_registro. Docker recreó solo web y API con `.env.cloud`, conservando
volúmenes y Supabase local. Auth, registro de escuela y años académicos
respondieron 401 sin sesión, con la API conectada al proyecto cloud correcto.

La prueba original de aislamiento PB-141 pasó sus 13 comprobaciones usando
la conexión PostgreSQL cloud de la API; su ROLLBACK dejó cero identidades
ficticias y ninguna extensión pgTAP instalada. La CLI con `test db --linked`
falló antes de las pruebas por no encontrar `plan(integer)` en su preparación,
por eso se ejecutó el mismo archivo directamente, sin editarlo.

Auth cloud confirma correo obligatorio, TOTP habilitado y mínimo de ocho
caracteres guardado en el proveedor Email, igual que CONVI. SMTP Brevo y la
plantilla de confirmación quedaron configurados, sin guardar secretos en
el repositorio ni en el Sheet.

Sebastian completó la prueba manual: registro, recepción y confirmación del
correo, creación de escuela, configuración del QR y entrada a Administración.
Luego inició sesión desde una ventana privada nueva con correo y contraseña,
verificó el código del autenticador existente y volvió al portal sin crear
otro QR. Una consulta de solo lectura confirmó correo verificado, membresía
ADMIN activa, escuela activa, ficha vinculada a la misma escuela y un TOTP
verificado. La cuenta creada se conserva; no se eliminó ni se cambió su clave.

El panel Admin todavía muestra "Liceo Bicentenario Los Aromos" y "Manuel Reyes"
como datos de ejemplo en `apps/web/src/app/admin/datos.ts`. Eso no cambia la
escuela real de la cuenta. Conectar esos textos conserva su tarea de HU-033.

La preparación cloud quedó validada y lista para el commit de Sebastian.
La integración siguiente completa el ajuste de PB-004/PB-002. El cierre de
sesión mantiene PB-006 y las invitaciones de apoderados y el reenvío conservan
su alcance pendiente.

## Integración de los módulos recibidos después

PB-010 y PB-003 ya tienen API y pantalla en main para Profesor y Convivencia.
Se incorporó su clave privada al contenedor API y se guardó la plantilla de
invitación en cloud. La API nueva rechaza con 401 las peticiones sin sesión;
después de reiniciar la web, Usuarios redirige al login si falta la sesión.

El login ya consulta el permiso de registro inicial cuando no encuentra una
cuenta activa. Si el servidor permite registrar, conserva la sesión y vuelve
a crear escuela; una cuenta bloqueada o invitada no usa ese camino. La
redirección mantiene las pantallas existentes y no crea otra escuela por sí sola.

Comprobaciones de esta integración: tres casos de configuración privada,
diez casos de permiso de registro en PostgreSQL cloud con reversión y limpieza,
seis destinos del login con Auth simulado, compilación API, tipos de web y
lint de los archivos cambiados. Las herramientas de web se ejecutan en Docker;
el editor de Windows necesita sus dependencias locales para repetirlas allí.
También se comprobó la recreación con y sin Build y que el script conserva
el archivo privado de configuración, usando Docker simulado.

Sebastian confirmó el recorrido de Profesor en cloud: invitación recibida,
contraseña definida, cuenta activa y login nuevo directo a su portal. Confirmó
también Convivencia: invitación, contraseña, QR, acceso a su bandeja y login
nuevo con el código del factor existente, sin crear otro QR. Administración
mostró ambas cuentas Activas en lugar de Pendientes.

Para el registro interrumpido, confirmó el correo de una cuenta nueva, cerró
la sesión antes de crear escuela y volvió por el login al formulario de
establecimiento. El primer intento encontró una ruta que el proceso API aún
no había cargado; reiniciar la API lo resolvió. El arranque Cloud fuerza ahora
la recreación para evitar ese problema después de recibir archivos nuevos.
La consulta de solo lectura confirmó cero membresías y permiso de registro
para esa identidad; no se creó otra escuela para completar esta prueba.

Integración validada, lista para un único commit de Sebastian. Las cuentas
usadas en las pruebas manuales se conservan, no se borraron datos del equipo.
Los apoderados y el reenvío siguen fuera de las funciones actuales de PB-010.

## PB-011: correo para continuar una invitación

El reenvío de una cuenta Pendiente conserva la invitación normal,
si el correo ya se confirmó pero la activación se interrumpió, Supabase envía
un Magic Link para la misma identidad, sin crear otra.

En el panel del proyecto cloud, abrir **Authentication → Email Templates →
Magic Link**, poner el asunto **Continúa tu acceso a CONVI** y guardar como
contenido el archivo `supabase/templates/continuar-invitacion.html`.
No cambiar el proveedor SMTP ni las claves.
La plantilla toma la membresía de los datos de la invitación original,
sin ese cambio el correo usaría la plantilla predeterminada y no volvería
directamente al formulario de activación de CONVI.
Esta configuración se hace una sola vez en el proyecto compartido,
los demás integrantes solo necesitan traer el código actualizado.

En local la plantilla se aplica desde `supabase/config.toml` al reiniciar
Supabase local, no requiere migraciones ni cambia las tablas.
