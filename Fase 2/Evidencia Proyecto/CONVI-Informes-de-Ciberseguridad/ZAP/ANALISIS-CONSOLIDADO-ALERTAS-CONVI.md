# Evaluación consolidada de alertas ZAP de Convi local

Fecha: 09-11-2026, America/Santiago. Revisión de evidencia guardada, sin lanzar ataques, acceder al despliegue ni modificar Convi.

## Resultado principal

Los JSON revisados contienen **14 familias de alertas locales: 3 medias, 4 bajas y 7 informativas; ninguna alta**. Las familias se deduplicaron por ID de regla entre informes. No son 14 vulnerabilidades explotables confirmadas. Los cientos o miles de registros anteriores, en particular User Agent Fuzzer, tampoco equivalen a cientos de fallos distintos. Los ejemplos exportados no constituyen el historial completo de cada regla.

No hay alertas de SQL injection, XSS reflejado/persistente/DOM, lectura de `.env`/`.htaccess` o recorrido de rutas confirmadas en estos informes. Esto describe lo detectado en las entradas ejercitadas, no demuestra que esas vulnerabilidades sean imposibles en toda la aplicación.

## Prioridad 1: validar controles de acciones y proteger las pantallas

### 10202 — Ausencia de tokens anti-CSRF

**ZAP: medio, confianza baja. Clasificación: pendiente de validación, no explotación demostrada.**

Hay ejemplos en login, Profesor, Admin, Apoderado y Convivencia. En las respuestas completas antiguas de login y Profesor se observan formularios POST con campos `$ACTION_*`, compatibles con Server Actions de Next.js. Algunos avisos de Profesor corresponden al formulario pequeño de sesión, no a una prueba exitosa de creación de registros.

La ausencia de un token con un nombre reconocido por ZAP no demuestra por sí sola CSRF. [Next.js](https://nextjs.org/docs/app/guides/data-security#allowed-origins-advanced) documenta comprobaciones de Origin frente a Host/X-Forwarded-Host para Server Actions. No se ha demostrado con estos informes que todos los formularios estén protegidos por esa vía ni que un origen ajeno pueda modificarlos.

**Decisión:** verificar este control en las acciones que guardan o modifican datos, antes de confirmar o descartar la alerta. Prioridad de validación superior a la de avisos cosméticos. No se añadió un token ni se modificó código.


### 10038 — Content Security Policy ausente

**ZAP: medio, confianza alta. Clasificación: falta de defensa observada en respuestas locales.**

Aparece en las pantallas de los cuatro perfiles y en login/segundo factor. Las respuestas completas revisadas de la página inicial y login son HTTP 200 sin Content-Security-Policy. Esto permite confirmar la ausencia en esas capturas, pero no un XSS ni una configuración idéntica en Azure.

**Decisión:** dar prioridad a comprobar la política en el despliegue HTTPS. Una CSP adecuada limita el impacto de ciertas inyecciones; su ausencia no prueba que exista una inyección. El entorno de desarrollo puede necesitar una política diferente del build de producción.

### 10020 — Protección anti-clickjacking ausente

**ZAP: medio, confianza media. Clasificación: falta de defensa observada; abuso no demostrado.**

Se repite en pantallas autenticadas. En las respuestas completas antiguas revisadas tampoco aparecen X-Frame-Options ni CSP con frame-ancestors. No se realizó una demostración de incrustación en iframe ni de una acción sensible inducida.

**Decisión:** comprobar que el despliegue impida incrustar las pantallas autenticadas en sitios ajenos, mediante una política coherente con las integraciones legítimas. Es una mejora relevante, no una toma de control demostrada.

## Prioridad 2: sesión y endurecimiento de respuestas

### 10010 — Cookie de sesión sin HttpOnly

**ZAP: bajo. Clasificación: decisión de arquitectura que necesita contexto.**

La evidencia antigua de login muestra `sb-convi-auth-token` sin HttpOnly, sin Secure y con SameSite=Lax. No se reproducen sus valores. SameSite no está ausente en esa cookie concreta. La ausencia de Secure en HTTP local es esperable; debe verificarse de nuevo sobre HTTPS.

JavaScript puede acceder a una cookie sin HttpOnly, lo que aumenta el impacto potencial de un XSS. Sin embargo, [Supabase](https://supabase.com/kb/troubleshooting/how-do-i-make-the-cookies-httponly-vwweFx) explica que el cliente de navegador puede necesitar acceso al refresh token; no sería correcto activar HttpOnly automáticamente y romper la sesión sin revisar el diseño usado por Convi.

**Decisión:** comprobar necesidad real de acceso desde el cliente y atributos en Azure. No es un robo de sesión demostrado ni se ha probado que MFA pueda saltarse.


### 10021 — Falta X-Content-Type-Options

**ZAP: bajo. Clasificación: endurecimiento real de cabeceras en las respuestas señaladas.**

Se observa tanto en la web como en la API; ejemplos API incluyen rutas de resumen y cursos. No hay una demostración de ejecución de contenido subido ni de interpretación MIME maliciosa.

**Decisión:** revisar Content-Type correcto y `X-Content-Type-Options: nosniff`, especialmente para respuestas y archivos que el navegador pueda renderizar. Menor prioridad que autenticar/autorizar acciones y proteger las pantallas.

### 10037 — Divulgación por X-Powered-By

**ZAP: bajo. Clasificación: exposición menor de tecnología.**

Evidencia: `X-Powered-By: Next.js` en la web y `X-Powered-By: Express` en la API. Estas cadenas no contienen una versión concreta ni demuestran una CVE explotable.

**Decisión:** retirar la cabecera cuando se endurezca el despliegue. No es urgente frente a los controles anteriores.

## Prioridad 3: indicios débiles y ruido del desarrollo

### 10031 — Atributo HTML controlable por el usuario, posible XSS

**ZAP: informativo, confianza baja. Clasificación: 32 ejemplos para triage; ningún XSS confirmado.**

La evidencia tiene tres coincidencias con el atributo fijo de viewport: `pagina=1`, `adjuntar=1` o `nuevo=1` se asocian al `1` de `width=device-width, initial-scale=1`. Estos ejemplos no demuestran que el parámetro controle el viewport; son coincidencias heurísticas que no deben contarse como XSS.

Los demás ejemplos corresponden a filtros de calendario reflejados en input/value, selección de sección en atributos id y un año asociado al mínimo de un input. Son comportamientos compatibles con una interfaz normal. No hay evidencia en esta alerta de romper el atributo o ejecutar JavaScript. [ZAP](https://www.zaproxy.org/docs/alerts/10031/) define la regla como localización de puntos a revisar, no como explotación.

**Decisión:** no contar estos 32 registros como 32 vulnerabilidades. Revisar el escape/contexto de los ejemplos restantes si se valida XSS en el despliegue; descartar los ejemplos de viewport como evidencia de explotación.


### 10104 — User Agent Fuzzer

**ZAP: informativo. Clasificación: diferencias de respuesta, no fallo de autorización demostrado.**

[La regla de ZAP](https://www.zaproxy.org/docs/alerts/10104/) compara códigos y hashes del cuerpo al cambiar User-Agent. Las aplicaciones dinámicas pueden responder distinto por motivos legítimos. Los ejemplos de los informes finales no incluyen evidencia adicional que demuestre datos ajenos, privilegios extra o un bypass. Por tanto, las grandes cifras de esta regla no deben presentarse como vulnerabilidades graves. Tampoco bastan para concluir que todas las diferencias son inofensivas sin examinar el par de respuestas correspondiente.


### 10027 — Comentarios sospechosos

**ZAP: informativo, confianza baja. Clasificación: ruido en los ejemplos revisados de Next.js/React de desarrollo.**

Se señalan bundles `/_next/static/chunks/`, código de HMR y patrones como TODO o DEBUG. No se confirmó una contraseña ni una clave privada expuesta en las muestras de esta alerta. No se ha hecho una búsqueda exhaustiva de secretos en todos los bundles.

**Decisión:** no tratar estos ejemplos del framework como filtraciones confirmadas. Comprobar un build de producción cuando se revise Azure.

### 10096 — Supuesto timestamp Unix

**ZAP: bajo, confianza baja. Clasificación: falso positivo del ejemplo revisado.**

La evidencia `2080374784` está en una operación binaria de React: `lanes & 2080374784 ? "Idle" : "Other"`. Es una máscara de bits en código de desarrollo, no una fecha privada de un usuario ni una filtración de datos de Convi.

**Decisión:** descartar ese ejemplo como hallazgo de seguridad.

### 10019 — Content-Type ausente

**ZAP: informativo. Clasificación: baja relevancia, contexto incompleto.**

Aparece en una captura preliminar de `/convivencia`. El JSON de esa captura no aporta los encabezados y cuerpo completos para determinar si era una redirección o una respuesta vacía. No permite afirmar una descarga ejecutable ni un problema MIME explotable.

**Decisión:** comprobar solo si se reproduce en una respuesta con contenido que deba renderizarse. No elevarlo a vulnerabilidad grave.

### 10109 — Aplicación web moderna

**ZAP: informativo.** Identifica navegación dinámica. No es un defecto de seguridad y puede ignorarse como tarea de corrección.

### 10112 — Respuesta de gestión de sesión identificada

**ZAP: informativo.** Reconoce el flujo de login/cookie. No implica que se haya robado una sesión ni que se haya roto MFA. No requiere corrección por sí mismo.

### 10113 — Petición de verificación identificada

**ZAP: informativo.** Detecta peticiones usadas para comprobar la sesión. No requiere corrección por sí mismo.

## Alertas iniciales de terceros: no atribuirlas a Convi

El primer HTML mezclaba 21 familias de alertas entre el navegador, servicios externos y Convi. La captura inicial de Convi mostraba cuatro familias; las posteriores amplían la evidencia local. El aviso CORS mostrado era de Plausible, no una demostración de CORS inseguro en la API de Convi. Había además advertencias de cookies de Bing y cabeceras de Microsoft.

Los avisos externos de Secure, SameSite, HttpOnly, HSTS, Server, X-AspNet-Version, IP privada, caché y CORS no se convierten en defectos de Convi por aparecer en el mismo árbol de ZAP. Se excluyen de la lista de arreglos del proyecto. Esto no aprueba la configuración de cookies/HTTPS/CORS de Azure: ese despliegue no se probó en esta ronda.

Las advertencias dependientes de HTTPS no son una razón para reprobar por sí solas el HTTP de desarrollo local. Sí deben comprobarse en el despliegue HTTPS.

## Resultado de autorización que sí está documentado

La matriz guardada tiene 20/20 códigos esperados en cuatro rutas representativas de API: 4 respuestas 401 sin sesión, 4 respuestas 200 del perfil correspondiente y 12 respuestas 403 de otros perfiles. Se autenticaron las cuatro cuentas y Admin/Convivencia completaron MFA normal para las pruebas.

Eso respalda la separación por perfil en esas rutas. No prueba aislamiento de todos los registros, pupilos o escuelas ni demuestra la corrección de todas las operaciones de escritura. Los informes de una sesión también incluyen tráfico sembrado con otras cuentas para la matriz: el nombre de archivo de un perfil no demuestra que ese perfil obtuvo acceso a todas las rutas listadas dentro.

## Límites que condicionan la interpretación

- Solo entorno local: no se probó Azure, HTTPS del despliegue ni Supabase cloud.
- Dos reglas de Profesor web quedaron limitadas por tiempo: DOM XSS y User Agent Fuzzer. Profesor API y Apoderado registran ejecución terminada.
- Admin y Convivencia completaron 64 combinaciones de 16 reglas por web/API. Las reglas pueden no aplicar o no encontrar entradas inyectables en algunos nodos: un 100 % no equivale a todas las funciones del producto.
- DOM XSS de Convivencia se redujo a 42 objetivos representativos de 32 plantillas: 39 se probaron y 3 devolvieron 404; no se probó cada una de las 231 URLs observadas.
- La siembra directa de API fue de rutas GET. No hay demostración de cobertura equivalente de todos los POST/PATCH/DELETE; los flujos web recorridos no sustituyen una matriz completa de operaciones.
- Los fallos de memoria/caché fueron incidencias de ZAP y no se cuentan como vulnerabilidades de Convi ni como un ataque DDoS exitoso contra la aplicación.
- Esta revisión interpreta evidencia guardada. No valida nuevas explotaciones ni introduce cambios en el proyecto.

## Orden práctico

1. Validar CSRF en operaciones sensibles y revisar CSP/anti-clickjacking en el despliegue real de pruebas.
2. Revisar el diseño de la cookie de autenticación, Secure en HTTPS y `nosniff`.
3. Dejar X-Powered-By para el endurecimiento general. Revisar una vez los indicios de atributos HTML; no elevar coincidencias normales a XSS.
4. Descartar los falsos positivos concretos de viewport/máscara React y los avisos de identificación de aplicación/sesión como tareas de corrección.

No se recomienda corregir automáticamente cada alerta de ZAP. La evidencia actual no justifica decir que Convi fue comprometido, ni permite certificar que todo el producto está libre de vulnerabilidades.

## Fuentes y trazabilidad

El inventario redactado de familias, rutas sin parámetros privados, archivos fuente y huellas SHA-256 está en `inventario-alertas-consolidado-redactado.json`. Se revisaron los seis JSON finales web/API de Apoderado, Admin y Convivencia; el JSON conservado de la sesión reciente de Profesor; la revisión anterior con solicitudes/respuestas de Profesor; y las tablas de los dos HTML iniciales. Se excluyeron snapshots duplicados para no inflar los resultados.

Los informes originales y sesiones se conservan privados. Este documento no reproduce contraseñas, códigos MFA, cookies ni tokens.
