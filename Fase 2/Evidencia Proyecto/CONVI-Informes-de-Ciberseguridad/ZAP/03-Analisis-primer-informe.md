# Análisis del primer informe ZAP — Convi local

Fecha de revisión: 08-11-2026, America/Santiago.
Fuente: C:/Users/SegaF/Documents/Programacion/Pentesting/Informes/2026-11-08-ZAP-Report-.html.
Método: lectura del HTML y sus tablas, sin ejecutar scripts del informe, contactar objetivos ni modificar proyecto/informe original. ZAP 2.17.0 según sesión y capturas. Evidencia HTTP local de ejemplo: GET /, respuesta 200, Date 08-11-2026 04:48:26 GMT (01:48:26 Chile). El reporte incluye peticiones y respuestas de ejemplo; no es el historial completo.

## Resultado y alcance

Resumen global: 21 entradas de alerta, 0 altas, 3 medias, 12 bajas y 6 informativas. El total mezcla Convi con Microsoft, Bing y Plausible; no equivale a 21 vulnerabilidades de Convi.

Para http://127.0.0.1:3000: 4 entradas, 0 altas, 1 media, 1 baja y 2 informativas. Insights registra 29 endpoints locales, 100% GET, 17% respuestas 2xx y 82% 3xx (porcentajes del reporte, con redondeo). Esto incluye recursos, no 29 funcionalidades. Respuestas 304/caché y capturas de desarrollo limitan interpretación. No se demuestra cobertura de API 3001, Supabase, sesiones, perfiles, MFA ni permisos entre escuelas.

El informe global informa 33% de fallos de red, 286 warnings y 2 errores de ZAP. Son estadísticas de la sesión mezclada, no métricas de disponibilidad de Convi. Logs no inspeccionados. Los 502 HMR vistos en capturas son una incidencia a aclarar antes de ampliar pruebas, no explotación demostrada.

## Alertas locales y evaluación

| ID revisión | Alerta y riesgo ZAP | Evidencia mínima | Evaluación y estado |
|---|---|---|---|
| ZAP-L01 | Falta de cabecera Anti-Clickjacking; medio, confianza media | GET / 200; respuesta de ejemplo sin X-Frame-Options ni CSP frame-ancestors | Ausencia de protección por cabecera observada en esa respuesta. Un sitio atacante podría intentar incrustarla y engañar al usuario para que pulse controles. Impacto sensible no demostrado: solo página pública local. Prioridad media provisional; comprobar páginas autenticadas y despliegue antes de extrapolar. No se probó iframe. |
| ZAP-L02 | Divulgación por X-Powered-By; bajo, confianza media | GET /; X-Powered-By: Next.js | Identifica el framework, sin versión en esa cabecera. Exposición confirmada de ese dato, no robo de información ni acceso indebido. Prioridad baja. |
| ZAP-L03 | Aplicación Web Moderna; informativo, confianza media | Enlace Privacidad con href="#" | Detección heurística de navegación; no es vulnerabilidad. No obliga a usar AJAX Spider. |
| ZAP-L04 | Comentarios sospechosos; informativo, confianza baja | Archivo react-dom.development de /_next/static/chunks/; patrón DEBUG; texto de ayuda react.dev/link/invalid-hook-call | El ejemplo es texto de diagnóstico de React en desarrollo. No acredita secretos ni comentario sensible propio. Candidato a descartar como hallazgo de seguridad de este ejemplo; no se generaliza a todos los bundles. |

La cabecera Cache-Control: no-store aparece en la respuesta pública de ejemplo. Eso no prueba controles de caché correctos en páginas privadas.

## Alertas externas (no atribuir a Convi)

- CSP no configurada: el detalle mostrado corresponde a edge.microsoft.com.
- CORS Cross-Domain: plausible.io/api/event, con Access-Control-Allow-Origin: *. No demuestra fallo CORS de API Convi.
- Cookies sin HttpOnly/Secure, SameSite None o ausente: ejemplos de Bing.
- Server, X-AspNet-Version, IP privada, timestamps, X-Content-Type-Options, HSTS, caché y detección de sesión: detalles de servicios externos.

No se investigaron ni atacaron esos servicios. Que no figuren esas alertas bajo Convi no aprueba sus controles: la cobertura actual es insuficiente. Tampoco se supone que toda petición externa provenga de la aplicación; puede proceder del navegador o herramientas.

## Procedimiento recomendado, ejecutado manualmente por el usuario

1. Afinar alcance: contexto ZAP solo para origen web local y orígenes API/Auth locales realmente utilizados. Mantener 127.0.0.1 y localhost diferenciados para sesiones/cookies; elegir un origen coherente. No incluir terceros ni Supabase cloud. No hace falta cambiar proxy global ni instalar certificados raíz del sistema.
2. Aclarar captura: comprobar que no queden mensajes pendientes de análisis pasivo, revisar errores HMR y tráfico cacheado; no tratar 304 como evidencia de cabeceras ausentes sin examinar respuesta completa. Guardar el informe actual como línea de base.
3. Navegación pasiva con sesión: tras acordar cuentas locales de prueba y efectos, recorrer manualmente pantallas de lectura, un perfil por sesión aislada. Auth/MFA generan sesiones y posiblemente auditoría; las lecturas también pueden tener efectos. Nada de guardar, subir, enviar correo, reset MFA, importar ni borrar. Revisar API asociada y exportar informe por perfil/origen con secretos depurados.
4. Autorización manual: diseñar tabla de dos escuelas, perfiles y relaciones apoderado/pupilo, con datos ficticios existentes. Probar lecturas de objetos permitidos y denegados cambiando un identificador conocido en peticiones seleccionadas. Requiere aprobación del alcance, cuentas, rutas y efectos. Esperado: no entregar datos ajenos y denegar acceso con respuesta coherente. No usar service-role como usuario.
5. Escaneo activo local acotado: solo después de mapa de rutas y estado recuperable confirmado. Modo protegido con alcance explícito, reglas seleccionadas, baja concurrencia y límites de peticiones/duración acordados. Excluir mutaciones y servicios externos. Incluso reglas consideradas ligeras pueden generar logs/carga y tener efectos; no prometer seguridad por usar GET. Spider y AJAX Spider requieren aprobación propia porque descubren/interactúan con rutas. No realizar DoS, fuerza bruta, OAST ni envíos reales.
6. Convi desplegado: revisión aparte. Primero acordar URL exacta y autorización del despliegue y servicios dependientes; preferir staging con datos ficticios. Comparar HTTPS/cookies/cabeceras en ejecución de producción. Un despliegue puede diferir de next dev. No iniciar contra producción por inferir propiedad.
7. Dependencias e imágenes: Trivy/lectura de lockfiles como examen complementario separado, sin construir ni instalar. Detallar antes descargas de bases de vulnerabilidades, uso de caché y destinos permitidos. Una CVE no es explotación confirmada.

Ninguna prueba nueva se ejecutó al elaborar este análisis. El siguiente paso recomendado es preparar la navegación autenticada de lectura, no lanzar un escaneo automático general. Antes de cada nueva tanda se documentarán destinos/cuentas/rutas, herramientas, esperado, efectos, límites y recuperación, y se obtendrá la autorización correspondiente.

## Referencias

- Reglas pasivas ZAP: https://www.zaproxy.org/docs/desktop/addons/passive-scan-rules/
- Escaneo activo y límites para lógica/autorización: https://www.zaproxy.org/docs/desktop/start/features/ascan/
- Modos y alcance protegido: https://www.zaproxy.org/docs/desktop/start/features/modes/

## Limitaciones

No se verificaron explotación, producción, todas las rutas, logs ni integridad/completitud de la captura. No se cambió código/configuración ni se ejecutaron ataques. No se publica el informe original: contiene tráfico de terceros y cookies. Una búsqueda inicial sin JWT/Bearer no certifica ausencia de secretos.
