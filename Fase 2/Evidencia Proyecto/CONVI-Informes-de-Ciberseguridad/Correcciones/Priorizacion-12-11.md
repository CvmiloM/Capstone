# Orden recomendado — seguridad, rendimiento y refinamientos de Convi

12-11-2026, America/Santiago. Recomendación de trabajo, no autorización de implementación. Solo se leyeron código, informes y evidencias; no se ejecutaron Git, Convi, consultas de base, navegadores, pruebas activas ni despliegues. Los artefactos nuevos son personales y están fuera del repositorio.

## Decisión recomendada

Empezar por una revisión acotada de protección de recursos e integridad, con regresiones pequeñas y correcciones solo donde se justifiquen. Después, rendimiento medido sobre la versión actual junto con optimizaciones de recursos de bajo riesgo. Continuar con las correcciones funcionales pequeñas de las 14 secciones y, por último, las ampliaciones/reorganizaciones grandes de Inicio, Plan de Gestión e informes.

No abrir un único cambio con todos estos temas. No esperar indefinidamente por hipótesis sin reproducir: cada una debe terminar en confirmada y corregida, refutada con evidencia, o pendiente con límite concreto. Un informe inconcluso no prueba un fallo ni justifica alterar controles de acceso.

## Fuentes realmente contrastadas

- Rendimiento: INFORME-RENDIMIENTO-CONVI.md, run-metadata.json, performance-summary.json, los ocho resúmenes localhost, assets-diagnostic.json, favicon-diagnostic.json y el método de captura/cálculo de browser.mjs, final-measurements.mjs y summarize.mjs (solo lectura, no ejecución). Se abrieron las ocho trazas gzip para comprobar su estructura/eventos; no se rehízo un análisis causal completo de cada traza.
- Seguridad: REPORT.md, NEEDS-VALIDATION.md, findings.json, findings-phase3-draft.json, run-metadata.json, manifiesto de fuentes y evidencia complementaria de dependencias; inspección del registro de cobertura. No se repitieron todas las exploraciones de los 17 grupos originales ni se ejecutaron sus scripts.
- Código actual: lector/importaciones, aplicación y pasos de protocolos, versiones/revisión de borradores IA, consulta/decisión normativa, transacciones de CuentaService, confirmación de correo, layouts/marca/fuentes/favicon, datos de Admin, bandeja, nuevas migraciones de sesión, política/test SQL, envío de correos y retención de respaldos.
- Graphify: consulta de relaciones existentes en el mapa de API del 02-11 (2471 nodos, 7077 relaciones). Confirmó rutas de importación→lector, aplicarProtocolo→casoAbierto y operar→transaccion. El grafo es parcial y anterior al checkout; se comprobó fuente actual, no se regeneró ni se trató como evidencia vigente por sí solo.
- Las matrices de secciones 1–14, anexo y decisiones D01–D08 de esta carpeta siguen siendo la referencia funcional. Las cinco huellas guardadas al empezar aquella revisión coinciden; eso no constituye un hash completo de toda la matriz ni de todo el proyecto.

## Antigüedad y solidez de la evidencia

Comparación SHA256 del manifiesto de seguridad con el checkout actual: 796 rutas comprobadas; 729 iguales; 67 distintas; ninguna ausente. El manifiesto antiguo no inventaría todos los archivos nuevos. No se dedujo un commit ni se inspeccionó .git. Detalle reproducible de esta comparación: contraste-informes-20261112.json.

El lector, borradores.service.ts, convivencia.service.ts, revision-normativa.ts, confirmar-correo/route.ts y esquema inicial coinciden con sus hashes antiguos. CuentaService y casos.service.ts cambiaron, pero los recorridos objeto de hipótesis todavía usan la comprobación separada de filas relacionadas y REPEATABLE READ como aislamiento predeterminado. Eso mantiene la necesidad de validación, no confirma por sí solo el resultado concurrente.

El informe de seguridad NO demuestra cinco vulnerabilidades. findings.json contiene solo Excel como needs_validation sin severidad. Las otras cuatro observaciones están en el borrador preliminar y no terminaron el segundo pase final. No asignarles CVSS ni afirmar caída, robo de cuenta, salto de MFA o fuga entre colegios.

Las medianas de rendimiento se reprodujeron aritméticamente desde las 30 muestras guardadas. Hay ocho trazas correspondientes. Admin: mediana LCP 8076 ms, intervalo 2236–9304; Convivencia: 6548 ms, intervalo 6356–9008. Son muestras locales DE DESARROLLO, no medidas de Azure ni de producción. La ejecución tenía memoria escasa; no se aisló su efecto. «Caché fría» describe caché HTTP del navegador, no necesariamente servidor/compilación completamente fríos. No convertir estas cifras en una promesa de ahorro o en diagnóstico de Supabase/Docker.

## Bloque 1 — protección de recursos y consistencia del trabajo

| Orden | Tema | Trabajo mínimo y aceptación | Relación con las 14 secciones |
|---|---|---|---|
| 1A | Lector de importaciones XLSX | Validar expansión, tiempo, memoria y coordinación con archivos sintéticos acotados en entorno aislado; diseñar presupuesto y aislamiento efectivos conservando CSV, tildes, primera hoja y errores útiles. Los límites de filas después de cargar el libro no acotan por sí solos la descompresión. Un worker sin presupuesto no garantiza aislamiento de memoria de todo el proceso. | Es IMPORTAR Excel, independiente de EXPORTAR informes con o sin gráficos. Prioridad por consumo potencial de recursos compartidos, no por un ataque demostrado. |
| 1B | Protocolos, borradores y decisiones concurrentes | Tratar tres invariantes relacionados en una revisión: no duplicar aplicación activa del mismo protocolo en un caso; revisar solo edición vigente; decisión vinculada a la revisión normativa vigente. Regresiones de dos operaciones concurrentes, controles secuenciales y manejo claro de conflictos. Resolver en el ámbito de cada operación. | Protege los registros antes de reorganizar Casos/Plan. Código automático del catálogo de protocolos es otro requisito: no corrige aplicación duplicada. |
| 1C | Confirmación de correo | Reproducir con identidades ficticias sesión existente/enlace válido e inválido, identidad mostrada y atribución de acción posterior. Si funciona como aceptación legítima de enlace, no inventar corrección de toma de cuenta. | Complementa claridad de identidad y acceso; no exige rehacer MFA. |

No cambiar globalmente REPEATABLE READ a READ COMMITTED, quitar RLS/MFA, elevar privilegios o reemplazar validaciones por controles del frontend para resolver concurrencia/rendimiento. La documentación de PostgreSQL explica que cada nivel tiene propiedades distintas; el remedio depende del invariante y de toda la operación.

Antes de migraciones que afecten datos o restricciones, comprobar recuperación. La nota del informe sobre retención de respaldos sigue siendo relevante: respaldar.ps1 escribe manifiesto incluso si falla alguna descarga, y al retener considera la existencia del manifiesto, no su éxito. Una ejecución exitosa posterior puede clasificar una carpeta fallida como completa para el recuento. No es prueba de pérdida ocurrida; merece corregirse antes de confiar en esa limpieza automática. No ejecutar ni borrar respaldos durante esta revisión.

## Bloque 2 — rendimiento actual y mejoras pequeñas de descarga

Hay una migración POSTERIOR a las mediciones: `supabase/migrations/20261111144634_sesion_valida_una_vez.sql`. Reescribe las políticas para evaluar la comprobación de sesión una vez por consulta y conserva condiciones de escuela y WITH CHECK. Existe test `supabase/tests/politicas_sesion_una_vez.sql`. Sus comentarios registran mediciones de consultas, pero no se reprodujeron aquí ni prueban que esté aplicada en local/cloud. Verificar estado antes de repetir trabajo.

Plan:

1. Establecer referencia actual con build de producción local, mismos datos/rutas, recursos estables y MFA normal. Comprobar la migración efectiva cuando se autorice trabajar sobre ese entorno. No ejecutar la migración «por si acaso».
2. Medir por separado recepción del contenido, autenticación/contexto, API, espera de conexión y consultas. Preservar privacidad y registro sin secretos. El LCP de Admin/Convivencia fue texto: la imagen no explica por sí sola su retraso.
3. Aplicar cambios pequeños verificables de recursos: tamaños adecuados en marca de portada y Admin, favicon real pequeño, precargas de fuentes solo donde aportan. Mantener resolución de impresión y comprobar diseño/CLS después de ajustar fuentes. No eliminar familias que se usan en otras rutas.
4. Comparar antes/después y actuar solo sobre el tramo costoso comprobado; atribuir la demora a Azure no es una conclusión de estas medidas. No proponer migrar de Supabase a Azure, escalar recursos o caché compartida de respuestas privadas como primera solución.

Evidencia vigente en código: portada conserva Image sin sizes para marca de 48 px; Admin también importa una marca grande; favicon pesa 680157 bytes y diagnóstico registró firma PNG; layout raíz mantiene cinco familias sin configuración diferenciada de precarga. Comparación antigua de marca: 72376 frente a 3264 bytes, 95,5% menos BYTES de esa solicitud, NO 95,5% menos tiempo de página. Favicon transfirió aproximadamente 566 KB sin caché; no se estableció que bloquee LCP.

Las optimizaciones de marca/favicon son independientes y pueden hacerse como cambio pequeño sin esperar una investigación extensa, pero no mezclarlo con el parche de integridad en el mismo PR ni venderlo como solución completa de rendimiento.

## Bloque 3 — correcciones funcionales y comprensión de las 14 secciones

Priorizar lo que evita errores cotidianos:

- Categorías (D08): advertencia destacada de impacto histórico; recomendar nueva categoría ante cambio de significado; filtro Activas/Inactivas/Todas, solo Activas por defecto, conservando nombres en registros históricos.
- Avisos: unificar o explicar criterio de expiración de campana/listado y probar actualización al leer/navegar. Aviso leído y alerta revisada siguen siendo estados distintos.
- Alertas (D06): presentar comparaciones en palabras con unidad y período, conservando datos y cálculo del servidor.
- Bandeja/Expedientes: búsqueda, filtros y límites/paginación según lo documentado. Coordinar las consultas con el trabajo de rendimiento para no producir más carga sin medir.
- Código automático del catálogo de protocolos: requisito confirmado pendiente, con compatibilidad de códigos/históricos; es independiente de concurrencia al aplicar protocolos.
- Informes: aclarar guardado/publicación, selección/comparación y conservación de cambios según matriz. No reconstruir los hallazgos que ya funcionan.

Si una advertencia o corrección pequeña puede evitar ya una equivocación, no hace falta esperar a todas las ampliaciones del bloque 4. Mantener cambios revisables y aceptación concreta.

## Bloque 4 — reorganización y nuevas vistas

Después de estabilizar los recorridos, hacer Inicio/Mi jornada y Plan de Gestión con las relaciones reales Plan→Objetivos→Acciones→Actividades. Resumen rápido, accesos al detalle y métricas agregadas con corte/definición visibles. D01: progreso de ejecución por actividades completas/total, no eficacia del Plan. No crear conteos nuevos en cascada por cada tarjeta.

Conservar la decisión D05: calendario ya elimina lista independiente inferior; reutilizar datos mensuales para mostrar todos los eventos del día es aceptado. No crear un endpoint diario innecesario. Documentos/Categorías/Reglas/IA ya tienen partes implementadas: leer matrices antes de reescribirlas.

Para informes, priorizar mejoras deterministas reutilizando cálculos. Excel exportado tabular (D07); nuevas conclusiones IA continúan como decisión aparte con Camilo. No posponer seguridad o corrección de registros para añadir carruseles, gráficos o IA opcional.

## Forma de ejecutar cuando el usuario autorice cambios

- Primera unidad recomendada: revisar/proteger lector de importaciones y conservar una regresión acotada de recursos. Seguir con los tres invariantes concurrentes relacionados.
- PRs separados: protección/consistencia; rendimiento/recursos; correcciones funcionales; Inicio/Plan. Los cambios de varias secciones pueden agruparse si comparten una causa, no por ahorrar un número de PR.
- Seguir Git manual del usuario; comprobar estado y actualizar antes de rama. Nada de Git ejecutado en esta revisión.
- Antes de asociar trabajo a PB o modificar estados, leer Sheet y Para IA. No hay acceso conectado al Sheet aquí; no inventar IDs, responsables ni marcar backlogs terminados a partir de esta recomendación. Documentar correcciones fuera del backlog como hallazgos/refinamientos vinculados a evidencia y aceptación.
- Toda función/restricción/permiso nuevo de base requiere revisar propuesta concreta con la regla de aprobación existente. La revisión no equivale a aplicar migraciones.

## Referencias externas consultadas

- PostgreSQL, aislamiento de transacciones: https://www.postgresql.org/docs/current/transaction-iso.html
- Next.js, evaluación para producción: https://nextjs.org/docs/app/guides/production-checklist
- Next.js Image, sizes y selección de recursos: https://nextjs.org/docs/app/api-reference/components/image#sizes

## Límites de este cierre

Se contrastó evidencia guardada con código actual, sin confirmar hipótesis mediante ejecución. No se midió de nuevo local/Azure, no se verificó aplicación de migraciones ni recursos efectivos, no se revisaron permisos reales de Brevo/buckets/cloud ni estado del Sheet. No se prometen tiempos ni severidades. La recomendación es un orden de trabajo, no un certificado de seguridad o rendimiento.
