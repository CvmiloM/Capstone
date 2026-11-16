# Convi — informe defensivo de mejoras

Fecha de cierre: 10 de noviembre de 2026.

La revisión de código encontró **cinco observaciones que merecen validación**, sin demostrar una vulnerabilidad mediante ejecución. La prioridad práctica es reforzar la lectura de Excel y revisar la consistencia de tres operaciones concurrentes. No se modificaron archivos de Convi, bases de datos ni configuración.

Este documento contiene errores posibles, impacto limitado a la evidencia y propuestas defensivas. Omite credenciales, datos personales, cargas de ataque y procedimientos de explotación.

## Qué atender primero

El orden es una prioridad de trabajo, **no una clasificación de severidad**. Ninguna observación tiene una severidad confirmada.

| Orden | Área | Observación y posible consecuencia | Trabajo defensivo propuesto |
|---|---|---|---|
| 1 | Importación Excel | Los límites de filas y columnas se aplican después de cargar el libro. La biblioteca instalada descomprime entradas completas; ciertos archivos se procesan dentro del proceso de la API. Podría consumir recursos compartidos. No se midió una caída o lentitud real. | Revisar el presupuesto de expansión y el aislamiento del lector; diseñar una regresión acotada de memoria y tiempo antes de decidir el cambio. |
| 2 | Aplicación de protocolos | La comprobación de que no exista otro protocolo activo y su creación son operaciones separadas. Podrían quedar flujos activos duplicados en un mismo caso. | Revisar la garantía de unicidad y la coordinación de la operación completa; comprobar que la base y el servicio rechacen duplicados concurrentes. |
| 3 | Edición y revisión de borradores | Una edición crea un sucesor sin cambiar la fila anterior. Una revisión concurrente podría aceptar una edición ya sustituida. El alcance es el estado del borrador, no su publicación ni envío. | Revisar la garantía de «última edición» y la consistencia entre versión, sucesor y estado de revisión. |
| 4 | Decisiones sobre situaciones | Una consulta normativa agrega una revisión sin modificar la fila principal. Una decisión concurrente podría conservar un antecedente de revisión desactualizado. | Revisar que la decisión siempre use la revisión vigente y que el linaje de revisiones conserve una única continuación válida. |
| 5 | Confirmación de correo | El flujo instala una sesión después de verificar el enlace. Falta observar si puede sustituir una identidad sin aceptación y producir una acción atribuida a una cuenta no deseada. El funcionamiento normal de un enlace de confirmación no demuestra un fallo. | Comprobar la intención del cambio de cuenta y la identidad mostrada al continuar. No tratar esta hipótesis como toma de cuentas, salto de MFA ni acceso a registros ajenos. |

Las propuestas son objetivos de fortalecimiento y validación, no correcciones ya probadas. No recomiendo presentar estas cinco observaciones como vulnerabilidades explotadas.

## Ubicaciones para el equipo

Las rutas siguientes son relativas a `Capstone/Fase 2/Evidencia Proyecto/Convi`.

| Área | Código principal |
|---|---|
| Excel | `apps/api/src/modules/importaciones/lector.ts:34` y `:108`; `importacion.ts:20` |
| Protocolos activos | `apps/api/src/modules/situaciones/casos.service.ts:543`; `protocolo-caso.ts:229` |
| Borradores | `apps/api/src/modules/orientacion/borradores.service.ts:276` y `:341` |
| Consulta y decisión | `apps/api/src/modules/situaciones/convivencia.service.ts:615` y `:676`; `revision-normativa.ts:321` |
| Confirmación de correo | `apps/web/src/app/(publico)/confirmar-correo/route.ts:5`; `apps/web/src/lib/supabase/servidor.ts:19` |
| Transacciones compartidas | `apps/api/src/database/cuenta.service.ts:103` y `:300` |

Las tres observaciones de concurrencia comparten un tema: un bloqueo de fila no garantiza por sí solo que una comprobación vea nuevos registros relacionados cuando conserva una instantánea anterior. Cada flujo requiere su propia validación; no se ha demostrado que todos produzcan el resultado supuesto.

## Mejoras preventivas adicionales

Estas notas no son vulnerabilidades confirmadas:

- **IA compartida:** considerar límites globales de admisión y reparto de capacidad. Los límites por petición y los tiempos de espera no demuestran por sí solos un reparto justo ni la cancelación efectiva del trabajo remoto.
- **Correos e invitaciones:** revisar la recuperación e idempotencia cuando el proveedor confirma una entrega y la transacción local falla. Podría duplicarse una entrega; no se estableció un destinatario no autorizado.
- **Respaldos:** la limpieza de copias antiguas debería distinguir un manifiesto exitoso de uno que registra descargas fallidas. Es una mejora de recuperación, no una fuga demostrada.
- **Publicación:** fijar imágenes por digest y alinear las exclusiones del contexto de compilación con los artefactos locales que no deben incluirse. No se demostró exposición de un secreto en una imagen final.
- **Almacenamiento:** comprobar operativamente que un bucket ya existente conserve la configuración privada y sus límites esperados. La creación condicional no prueba el estado desplegado.
- **Consistencia administrativa:** valorar restricciones o coordinación adicional para correcciones concurrentes de asignaciones históricas. La persona que las realiza ya tiene autoridad administrativa; no se encontró una ampliación de privilegios.

## Controles positivos observados

- Autorización global que rechaza rutas sin declaración de acceso y revalida la membresía activa.
- Rol y colegio derivados del servidor; MFA exigido en las operaciones correspondientes.
- Transacciones con contexto de colegio y RLS forzado; relaciones compuestas que refuerzan el aislamiento.
- Comprobaciones de curso, autoría y vínculo del apoderado antes de acceder a los recursos revisados.
- Archivos privados, claves generadas por el servidor y comprobaciones de integridad.
- Uso de consultas parametrizadas en los recorridos revisados y renderizado de texto mediante React.
- Contexto de IA acotado por colegio, salidas tratadas como borradores y sin autoridad general para ejecutar acciones elegidas por el modelo.
- Fuente de despliegue con API interna, web HTTPS y separación de secretos entre cargas.

Son controles comprobados en código, no una certificación del entorno desplegado.

## Alcance, evidencia y estado real

- Skill oficial de Cloudflare instalada: `security-audit`, revisión `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`.
- Perfil: estándar. No se fijó un presupuesto numérico de agentes o tokens.
- Plan inicial: 24 unidades en 8 grupos; plan ampliado por los controles de cobertura: **33 unidades en 17 grupos**. Los 17 grupos devolvieron revisión; hubo un intento de IA interrumpido y reanudado.
- Se conservaron cuatro reconocimientos iniciales, cinco controles posteriores de cobertura y un control final independiente sin nuevas áreas aceptadas.
- Registro: **27 unidades cubiertas, 5 con hipótesis y 1 limitación de raíz del proyecto**. No quedan unidades planificadas o en ejecución.
- El flujo de publicación de GitHub está fuera de la raíz principal auditada. Se leyó aparte y se registró en `release-pipeline-supplement.json`; no se observaron los permisos efectivos del proveedor.
- Se verificó una copia de **796 archivos sin cambios**, identificada por `filesystem-sha256:d29998668cfe4affbc70ef74bc408d5afc1938d68b598d52abaa00735256a953`. Las dependencias consultadas para Excel se registraron aparte.
- No había un registro previo compatible de esta skill. Los informes anteriores de ZAP se conservaron como contexto y no se convirtieron en confirmaciones de esta revisión.
- Ejecución del objetivo: ninguna. Los contenedores se usaron únicamente para los validadores de formato de Cloudflare, sin red y con montajes de lectura.

**Cierre parcial del flujo exhaustivo de la skill:** las cinco hipótesis tienen contraste de fuente independiente conservado. Excel completó además la segunda verificación de su registro; las otras cuatro no completaron ese segundo pase antes de cerrar este entregable defensivo. Por eso `findings.json` conserva solo Excel como `needs_validation`, sin severidad. Las otras cuatro son observaciones preliminares, no hallazgos finales. Ninguna tiene reproducción funcional.

El cierre del informe no equivale a completar las pruebas funcionales pendientes ni a certificar que Convi carezca de vulnerabilidades. Los motivos pendientes son de evidencia y alcance técnico, no de propiedad o autorización.

## Entregables

- `REPORT.md`: este informe de mejoras, sin instrucciones de ataque.
- `NEEDS-VALIDATION.md`: estado y límites de las observaciones.
- `FINDINGS-DETAIL.md`: constancia de que no hay vulnerabilidades demostradas.
- `findings.json`: único registro con segunda verificación completada; no es una vulnerabilidad confirmada.
- `findings-phase3-draft.json`: contraste preliminar conservado para no repetir el trabajo; no es una lista de hallazgos finales.
- `coverage-ledger.json`, `source-manifest.json` y `run-metadata.json`: trazabilidad técnica.
