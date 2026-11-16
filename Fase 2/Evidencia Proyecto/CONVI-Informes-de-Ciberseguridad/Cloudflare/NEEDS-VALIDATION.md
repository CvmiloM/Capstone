# Convi — observaciones pendientes

Las observaciones no son vulnerabilidades confirmadas y no tienen severidad asignada. Este documento omite cargas, comandos y secuencias de ataque por el alcance solicitado para el entregable.

## Excel: registro con segunda revisión completada

Huella: `importaciones/xlsx-load-before-expansion-budget`.

**Evidencia de fuente:** la carga administrativa valida el tamaño de transferencia, luego `lector.ts:34` decide dónde procesar el archivo. `lector.ts:108` carga el libro antes de validar sus filas y columnas. ExcelJS 4.4.0 y JSZip 3.10.2 acumulan entradas descomprimidas en los recorridos consultados; no se encontró un presupuesto de expansión en esa integración. El despliegue fuente declara una réplica de API con memoria limitada, pero su estado efectivo no se observó.

**Frontera afectada:** consumo de recursos de la API por una importación autorizada. No se demostró una caída, lentitud de otras solicitudes ni afectación entre colegios.

**Qué falta:** una regresión acotada con datos sintéticos que mida expansión, tiempo, memoria y comportamiento de una tarea independiente; además, confirmar la compartición y recuperación efectivas del proceso. Debe utilizar un entorno aislado, sin datos reales ni pruebas de disponibilidad contra un servicio compartido.

**Límite técnico:** no se estableció el conjunto completo de aislamiento y conservación segura de evidencia requerido por la skill para ejecutar el objetivo. La autorización del propietario es suficiente y no está pendiente.

## Cuatro observaciones sin segundo pase final

Estas observaciones tienen contraste independiente de fuente conservado, pero no completaron la verificación final del registro. Permanecen en el registro de cobertura y en el borrador preliminar, no en `findings.json`.

| Observación | Ubicación principal | Incertidumbre decisiva | Objetivo de validación defensiva |
|---|---|---|---|
| Protocolo activo duplicado | `apps/api/src/modules/situaciones/casos.service.ts:543`; `protocolo-caso.ts:229` | No se observó el resultado de transacciones concurrentes a través de todos los controles actuales. | La operación debe conservar una sola aplicación activa del protocolo y un solo conjunto de obligaciones. |
| Revisión de borrador sustituido | `apps/api/src/modules/orientacion/borradores.service.ts:276` y `:341` | No se observó si la revisión rechaza siempre una edición sustituida durante una operación concurrente. | Solo la edición vigente debe poder recibir una nueva revisión. El borrador no equivale a una publicación ni a un envío. |
| Antecedente de revisión desactualizado | `apps/api/src/modules/situaciones/convivencia.service.ts:615` y `:676`; `revision-normativa.ts:321` | No se observó el resultado concurrente con las restricciones y disparadores completos. | La decisión debe vincular la revisión vigente y conservar un linaje consistente. |
| Sustitución de identidad al confirmar correo | `apps/web/src/app/(publico)/confirmar-correo/route.ts:5`; `apps/web/src/lib/supabase/servidor.ts:19` | Faltan tanto el comportamiento efectivo del proveedor/navegador como una consecuencia concreta más allá del funcionamiento normal de un enlace. | La identidad de una acción posterior debe ser la que la persona entendió y aceptó. No se estableció acceso a la cuenta original ni salto de MFA. |

No se requieren contraseñas, semillas MFA, datos personales ni sistemas de terceros para diseñar estas regresiones. Los próximos pasos son de validación; este informe no afirma que sus resultados ya se hayan observado.
