# Respaldo y restauración de CONVI (PB-133 y PB-134)

Metas propuestas para el piloto (HU-114): perder como máximo 24 horas de datos y recuperar la base, las relaciones, el historial y los archivos en 4 horas o menos, midiendo ambos tiempos.

## Qué se respalda

- **Base de datos:** `pg_dump` de los esquemas `convi`, `auth`, `storage`, `supabase_migrations` y `public`, con las extensiones `vector`, `pgcrypto` y `uuid-ossp`, más los roles de CONVI sin contraseñas.
- **Archivos:** cada archivo de `convi.archivos` se baja del bucket con la API de Storage y se comprueba con su sha256 y su tamaño, si uno falla el respaldo queda marcado como incompleto y no sirve para restaurar.
- **Huella:** antes y después del `pg_dump` se guarda, por tabla, la cantidad de filas y un md5 del contenido, además de las políticas, triggers, funciones y llaves foráneas, así el ensayo puede comprobar que la restauración quedó igual.

Los dos scripts solo leen: no cambian la base ni el bucket, y no muestran claves.

## Respaldar

Desde la carpeta `Convi`, con Docker Desktop abierto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldar.ps1
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\respaldar.ps1 -Entorno Cloud
```

- Local usa `.env` y Supabase local, Cloud usa `.env.cloud` con `sslmode=verify-full` y el certificado de `supabase/certs`.
- Cada respaldo queda en `%USERPROFILE%\CONVI-respaldos\convi-<entorno>-<fecha>` con `base.dump`, `roles.sql`, `archivos\`, las huellas y `respaldo.json` con los tiempos y el sha256 de la base.
- `-Destino <carpeta>` cambia dónde se guarda y `-Conservar <n>` cuántos respaldos completos del mismo entorno se mantienen (14 por defecto, 0 no borra ninguno).

**El respaldo tiene datos personales de estudiantes:** guárdalo solo en un disco cifrado con BitLocker, nunca en Git, en carpetas compartidas ni en el chat.

## Una vez al día

Para cumplir las 24 horas el respaldo tiene que correr todos los días, mientras no exista un trabajo programado en Azure se puede dejar en Windows (Docker Desktop tiene que estar abierto a esa hora):

```powershell
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\ruta\a\Convi\scripts\respaldar.ps1" -Entorno Cloud'
```

```powershell
Register-ScheduledTask -TaskName 'CONVI respaldo diario' -Action $accion -Trigger (New-ScheduledTaskTrigger -Daily -At 2am)
```

## Ensayo de restauración

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\ensayar-restauracion.ps1
```

- Sin parámetros usa el respaldo más reciente, con `-Respaldo <carpeta>` uno en particular.
- Levanta un Postgres temporal con la misma imagen de Supabase, sin puertos publicados, crea los roles, restaura la base y la compara con la huella del respaldo, después comprueba cada archivo de la base restaurada contra su sha256 y al final borra el contenedor.
- Mide el tiempo total de recuperación (meta 4 horas, `-MetaHoras`) y la antigüedad del respaldo y el tiempo desde el anterior (meta 24 horas, `-PerdidaHoras`).
- Deja `ensayo-<fecha>\resultado.json` dentro del respaldo con APROBADO o RECHAZADO, los tiempos, los errores y los avisos, y termina con código 1 si se rechaza.

Resultado con la base local del 2026-11-06 (10.009 situaciones, 2.300 casos y 42 archivos): base de 7,3 MB respaldada en 5,2 s, restauración y comprobación en 11,1 s, 86 tablas idénticas y 42 archivos correctos, y al alterar una tabla y un archivo el ensayo los detectó y quedó RECHAZADO.

## Pendiente para la nube

- `-Entorno Cloud` usa el mismo camino que Local pero todavía no se probó contra Supabase cloud, la primera vez conviene correr el respaldo y el ensayo y revisar `base.log` y `roles.log`.
- Programar el respaldo diario en Azure (por ejemplo un Container Apps Job) con un almacenamiento cifrado y privado, es de Sebastián junto con el resto de la infraestructura.
- Restaurar de verdad en un proyecto nuevo es el mismo procedimiento del ensayo contra la base nueva, y después subir los archivos de `archivos\` al bucket con la misma clave.
