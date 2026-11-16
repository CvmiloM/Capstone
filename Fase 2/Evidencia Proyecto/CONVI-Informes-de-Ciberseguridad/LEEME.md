# CONVI · Evidencias de ciberseguridad

Paquete para la entrega de CONVI, preparado el 15 de noviembre de 2026. Reúne los informes de revisión local con OWASP ZAP, la auditoría de código con la skill de Cloudflare, los resultados de las correcciones y dos documentos académicos de apoyo.

## Dónde empezar

1. **ZAP / ANALISIS-CONSOLIDADO-ALERTAS-CONVI.md** contiene la conclusión del escaneo local. Los archivos de la revisión inicial y de Profesor muestran cómo se obtuvo parte de la evidencia.
2. **Cloudflare / REPORT.md** explica las observaciones de la revisión de código. Los archivos de hallazgos y validación indican qué se pudo comprobar en ese momento.
3. **Correcciones / RESULTADOS-AD-001.md** documenta el antes, el cambio, las pruebas y las limitaciones.
4. **Correcciones / Dependencias-04-11.txt** documenta las actualizaciones de Node y dependencias. Fue un trabajo anterior a ZAP y Cloudflare.
5. **Evidencia-academica** contiene el plan de pruebas y el catálogo de requisitos no funcionales tal como se prepararon para la entrega.

Los informes conservan su fecha de corte. Las menciones históricas a trabajo pendiente de integración se actualizan en esta guía.

## Qué se encontró y qué se hizo

| Tema | Qué mostró la revisión | Cambio aplicado y alcance de la verificación |
| --- | --- | --- |
| Cabeceras web y API | ZAP no vio CSP ni protección contra incrustación en las páginas analizadas | Se añadió CSP inicial, protección frente a clickjacking y nosniff. Se desactivó X-Powered-By. La portada en Azure respondió con CSP, X-Frame-Options y nosniff el 15 de noviembre. |
| CSRF y cookies de sesión | ZAP señaló posibles problemas en el entorno HTTP local | En un formulario de laboratorio, Next.js rechazó un origen ajeno sin ejecutar la acción. Se mantuvo la configuración de cookies. La prueba cubrió el formulario aislado y la revisión de HttpOnly sigue pendiente. |
| Archivos Excel | Cloudflare observó que el archivo podía expandirse antes de comprobar los límites de filas y columnas | Se aisló el lector en un worker y se acotaron la expansión, memoria y tiempo. Se validaron archivos sintéticos, documentos inválidos y la conservación del flujo CSV. |
| Acciones simultáneas | Se estudiaron la aplicación de protocolos, la revisión de borradores y el registro de decisiones que dependen de la revisión normativa | Los tres problemas de integridad se reprodujeron en PostgreSQL local con dos conexiones. Tras el cambio se rechazaron el protocolo activo duplicado, la revisión de un borrador sustituido y la decisión basada en una revisión normativa anterior. |
| Confirmación de identidad | La revisión de código pidió comprobar si un enlace de confirmación podía cambiar la identidad sin aceptación clara | Se añadió confirmación explícita y verificación de la sesión antes de consumir el enlace. Las regresiones se ejecutaron con Auth simulado. No se reprodujo una toma de cuenta. |
| Correos e invitaciones | Podía quedar una entrega incierta si el proveedor aceptaba un correo y el guardado local fallaba | Se guarda la solicitud antes de contactar al proveedor y se conserva el estado incierto para revisar la entrega antes de repetirla. Se verificó con proveedor simulado. |
| Capacidad de IA | La auditoría recomendó limitar el trabajo simultáneo | Se incorporó una cola por proceso con hasta cuatro llamadas en curso, 20 en espera y un máximo de 20 segundos de espera. Se comprobó localmente el orden, los rechazos y la liberación de cupos. |
| Dependencias y despliegue | Se revisaron avisos de dependencias, versiones de imágenes y contenido de compilación | Se actualizó Node y dependencias, se añadió auditoría de producción a GitHub Actions, se fijaron imágenes por digest y se reforzaron las exclusiones del contexto Docker. |
| Respaldo y archivos | Se observó que un manifiesto podía existir incluso con una copia incompleta | Se endureció el recuento de copias completas y se añadió un chequeo del bucket privado al despliegue manual. El primer respaldo programado de Azure terminó el 15 de noviembre a las 03:03:38 en Santiago. La prueba de restauración de la copia manual verificó 90 tablas y 104 archivos y dejó 14 errores SQL en el paso de roles. |

## Cifras y límites

- ZAP consolidó **14 familias de alertas locales**. Fueron tres medias, cuatro bajas y siete informativas, sin alertas altas. Las **20 comprobaciones de permisos** devolvieron los códigos esperados. En la evidencia no se confirmó explotación de SQL injection ni de XSS.
- La auditoría con la skill de Cloudflare priorizó **cinco observaciones de código**. El informe original no reprodujo las hipótesis. Las tres reproducciones de concurrencia corresponden al trabajo local posterior de AD-001.
- En el mantenimiento de dependencias, los avisos altos de producción bajaron de **2 a 0** en aquella corrida. Quedaron tres moderados. Los resultados son del día 4 de noviembre.
- El informe de AD-001 registra 937 pruebas aprobadas en su suite de referencia y pases posteriores de regresión. El plan académico registra un corte posterior del 14 de noviembre con 1.036 aprobadas y 17 omitidas. Son ejecuciones distintas.
- La repetición completa de ZAP tras el parche y el pentesting en Azure quedan fuera de las comprobaciones registradas en este paquete.

## Referencias de integración

- [#116 · Dependencias](https://github.com/CvmiloM/Capstone/pull/116), fusionado en `82306df`.
- [#144 · AD-001 Seguridad e integridad](https://github.com/CvmiloM/Capstone/pull/144), commit `f1ba1b6`, fusionado en `0fea7cd`.
- [#161 · PB-133 Respaldo diario](https://github.com/CvmiloM/Capstone/pull/161), commit `51cd5a1`, fusionado en `6c21f9a`.
- [Product Backlog y evidencias del equipo](https://docs.google.com/spreadsheets/d/1YgSeYGm4VTE7bbecgVhbIqhC_yZM8zYMqweDwosbTso/edit?gid=90064742).

## Datos de las exportaciones ZAP

Las tablas CSV se generaron a partir de los informes privados conservados. Incluyen elementos de inventario, nivel, confianza y recuento, sin extraer sesiones, tráfico, cookies, parámetros, cuerpos ni URLs de las instancias. Los recuentos por informe pueden repetirse entre ejecuciones. El consolidado es la referencia para contar familias distintas.

El manifiesto indica el origen y la huella SHA-256 de los informes copiados. Los perfiles de ZAP, las sesiones brutas y los archivos de autenticación se mantuvieron en su ubicación de trabajo.
