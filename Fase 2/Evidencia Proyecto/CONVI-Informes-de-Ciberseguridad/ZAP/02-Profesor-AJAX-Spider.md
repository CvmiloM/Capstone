# Profesor — descubrimiento AJAX Spider 01

Fecha: 08-11-2026, America/Santiago. Ejecución manual del usuario; lectura posterior de exportaciones por el asistente. Usuario autorizó descubrimiento y pruebas activas locales de Profesor, aceptando cambios/pérdida de datos ficticios. No autoriza modificar código/configuración del proyecto, envíos externos, DoS ni fuerza bruta.

Fuentes originales en C:/Users/SegaF/Documents/Programacion/Pentesting/Informes:
- Convi-Profesor-Spider-01.csv
- Convi-Profesor-PostSpider-01 (HTML sin extensión)

CSV: 2625 filas; GET 2622, POST 3; estados 200: 128, 304: 2465, 403: 32. Host local 2618 entradas; 7 externas de servicios de Microsoft. Conteos no equivalen a páginas funcionales ni vulnerabilidades. No se imprimieron valores de formularios, cookies o tokens.

Rutas locales observadas, UUID sustituidos:
- GET /profesor: 37 respuestas 200.
- GET /profesor/cursos/{uuid}: 35 respuestas 200.
- GET /profesor/situaciones: 17 respuestas 200.
- GET /profesor/cursos/{uuid}/registrar: 17 respuestas 200.
- GET /profesor/situaciones/{uuid}: 14 respuestas 200.
- POST /profesor/cursos/{uuid}/registrar: 1 respuesta 200.
- POST /profesor/situaciones/{uuid}: 1 respuesta 200.

Un POST 200 no demuestra éxito funcional ni qué datos se guardaron. La captura previa muestra autenticación browser-based OK y verificación por /profesor con identidad de prueba. No demuestra conservación de sesión en cada solicitud ni autorización correcta por objeto. No se confirmó estado final explícito de ejecución en captura.

Informe: tabla por sitio local muestra 6 entradas: 2 medias (anti-clickjacking, anti-CSRF), 1 baja (X-Powered-By), 3 informativas (aplicación moderna, comentarios, petición de verificación). Anti-CSRF tiene confianza baja; ausencia de campo token no acredita vulnerabilidad sin estudiar protecciones equivalentes y comprobar reproducción. Resúmenes globales contienen 11 entradas y tipos no desarrollados en el detalle local; usar el detalle por sitio para atribución y no sumar como fallos de Convi.

Siguiente examen propuesto: escaneo activo sobre el subárbol http://127.0.0.1:3000/profesor, contexto Convi-Profesor-Auto y usuario de prueba configurado. Recursión solo dentro de dicho subárbol; sin login, MFA, otros perfiles, estáticos, servicios externos ni endpoints de Supabase. Primera política: todas las reglas apagadas excepto SQL Injection genérica y XSS reflejado, fuerza baja, umbral medio; desactivar variantes temporales, OAST y DOM XSS para esta pasada. Un hilo y 10 minutos máximo, sujeto a comprobar opciones reales de ZAP antes de iniciar. Efectos: carga, auditoría, creación/alteración de datos ficticios y posible almacenamiento de payloads; no borrado/restauración automática. Detener si pierde sesión, hay fallos persistentes o alcanza destinos no aprobados. No se ha ejecutado este escaneo activo al escribir el registro.

Limitación: API 3001 no aparece en el CSV; las llamadas servidor-servidor no están necesariamente capturadas. Formularios Next.js/Server Actions requieren comprobar que el escáner reconoce parámetros y que llega a la lógica esperada; no concluir ausencia de SQLi por un escaneo sin vectores efectivos. El análisis de tráfico de web no sustituye la revisión directa posterior de API, código y permisos.
