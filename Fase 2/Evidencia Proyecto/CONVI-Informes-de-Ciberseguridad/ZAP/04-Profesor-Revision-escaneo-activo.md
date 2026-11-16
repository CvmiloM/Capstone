# Convi Profesor — revisión y conservación previa al apagado

Fecha/hora Chile: 2026-11-08T04:25:28.941461-03:00.

## Evidencias conservadas

- profesor-revision-20261108-042352.json: informe estructurado con peticiones y respuestas.
- profesor-revision-20261108-042352.html: informe legible con peticiones y respuestas.
- estado-revision-20261108-042352.json: la API devuelve una lista de escaneos vacía.
- sesion-profesor.session y archivos auxiliares: sesión persistida completa. Conservar juntos; no borrar auxiliares ni publicar credenciales.
- Informes provisionales y exportaciones anteriores conservados sin sobrescribir.

No se han iniciado nuevos ataques ni modificado el proyecto, sus bases o configuración en esta revisión. Se consultó únicamente la API de administración local de ZAP. Se solicitó cierre normal de ZAP después de verificar ambos informes; devolvió Result OK y su API dejó de responder. Se detuvo el supervisor redundante de ejecución única para evitar otra exportación/cierre; no se canceló el temporizador nativo de apagado de Windows.

## Estado real del examen activo

NO SE ACREDITA FINALIZACIÓN. La última observación acreditada antes de persistir la sesión fue escaneo 0 RUNNING, 55 %, 620 peticiones, sin alertas nuevas. Tras guardar la sesión, la API dejó de listar ese escaneo y siguió devolviendo scans vacía hasta esta revisión. No es correcto interpretar una lista vacía como escaneo completado ni afirmar que el examen estuvo atacando durante la hora posterior. La persistencia coincidió con la desaparición del registro; la causa exacta no se ha verificado. El guardado final no subsana esa falta de cobertura. No se relanzó el ataque automáticamente.

Para continuar: abrir una copia de la sesión y comprobar si contiene estadísticas/historial del ataque; si no puede recuperarse una ejecución completa, repetir el escaneo autorizado con la sesión ya persistida antes de comenzar. Comprobar progreso, reglas ejecutadas, vectores reconocidos y estado final. No declarar ausencia de SQLi/XSS por este informe.

## Alertas del sitio local

El JSON filtrado contiene 11 tipos: 0 altos, 3 medios, 4 bajos y 4 informativos. Son alertas de la captura acumulada del mismo sitio (incluidos login y recursos), no exclusivamente resultados nuevos del ataque ni once vulnerabilidades demostradas.

| Alerta | Riesgo ZAP | Interpretación / validación pendiente |
|---|---|---|
| Ausencia de tokens anti-CSRF | Medio, confianza baja | Ejemplos GET/POST login y GET profesor; ausencia heurística de token no demuestra explotación. Revisar Server Actions, Origin, SameSite y controles equivalentes antes de confirmar. |
| CSP no configurada | Medio | Ejemplos de página inicial, login y segundo factor. Falta de cabecera observada en esta captura local; no prueba XSS ni configuración del despliegue. |
| Anti-clickjacking ausente | Medio | Ejemplos inicial/login/segundo factor. Requiere validar framing y acción sensible; no explotación confirmada. |
| Cookie sin HttpOnly | Bajo | Cookie de autenticación emitida por POST login. No se reproduce valor. Revisar necesidad de lectura por cliente y riesgo de XSS; no cambiar automáticamente una cookie Supabase SSR. |
| Timestamp Unix | Bajo, confianza baja | Ejemplo dentro de bundle React DOM development; no acredita exposición de datos privados. |
| X-Powered-By | Bajo | Revela Next.js; no concede acceso. |
| X-Content-Type-Options ausente | Bajo | Ejemplos de recursos CSS/fuentes; revisar tipos MIME y despliegue antes de estimar impacto. |
| Aplicación moderna | Informativo | Identificación de tipo de aplicación. |
| Comentarios sospechosos | Informativo, confianza baja | Principalmente bundles Next/React de desarrollo; revisar ejemplos antes de clasificar como filtración. |
| Petición de verificación identificada | Informativo | Detección del flujo de sesión de ZAP; no vulnerabilidad por sí misma. |
| Respuesta de gestión de sesión identificada | Informativo | Detección de cookie/sesión; no vulnerabilidad por sí misma. |

No se reproduce ningún token, contraseña, cookie, código MFA ni identificador personal. Los originales privados sí contienen información de sesión y no deben subirse a Git ni compartirse sin redactar.

## Cobertura y pendientes

El spider anterior alcanzó /profesor, cursos, formularios de registro, situaciones y detalles, con tráfico mayoritariamente de recursos cacheados. No demuestra todas las funciones ni los permisos por objeto. API 3001 y llamadas servidor-servidor no necesariamente quedaron capturadas. Pendientes: cobertura activa completa acreditada, análisis de parámetros Next.js, validación CSRF/cookies, aislamiento entre escuelas/perfiles, MFA Admin y perfiles restantes. No se probó producción ni se certifica seguridad.

## Apagado

Windows aceptó el temporizador para las 04:31:48 Chile del 08-11-2026. No se programó un segundo apagado en esta revisión. El temporizador con tiempo positivo puede forzar cierre de otras aplicaciones; solo se guardaron y consolidaron evidencias de ZAP, no documentos abiertos en otras apps. La sesión se cerró con antelación para darle tiempo a consolidar su base.

Verificación de cierre: desaparecieron los archivos de bloqueo/log/transitorios; quedaron los cuatro archivos de sesión consolidados. Huellas SHA-256 guardadas en verificacion-sesion-cerrada.csv.
