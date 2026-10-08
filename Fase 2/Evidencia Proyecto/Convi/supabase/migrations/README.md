# Migraciones CONVI

Esta carpeta versiona los cambios del esquema de base de datos.
Al iniciar esta entrega esta vacia deliberadamente: el equipo debe aprobar
primero el modelo y las politicas RLS.

Ejemplo para crear una migracion (desde el directorio Convi):

```powershell
npx.cmd --yes supabase@2.117.0 migration new esquema_inicial
```

Editar el SQL generado y probarlo con cuidado. `db reset` BORRA los datos
locales y reconstruye las tablas a partir de las migraciones y seed.sql.
