-- PB-013 (HU-011): una escuela tiene como máximo un año académico Activo.
-- Decisión del PO (Camilo): la API lo revisa antes de activar un año y este
-- índice lo asegura en la base, aunque dos administradores activen años a la vez.
-- Si una base local ya tiene dos años Activos en la misma escuela, cerrar uno
-- antes de aplicar esta migración.
CREATE UNIQUE INDEX anios_academicos_un_activo
  ON convi.anios_academicos (establecimiento_id)
  WHERE estado = 'ACTIVO';