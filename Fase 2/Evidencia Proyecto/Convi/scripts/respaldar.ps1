param(
    [ValidateSet('Local', 'Cloud')][string]$Entorno = 'Local',
    [string]$Destino = (Join-Path $env:USERPROFILE 'CONVI-respaldos'),
    [ValidateRange(0, 365)][int]$Conservar = 14
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'

# PB-133 (HU-114): respaldo de la base y de los archivos de CONVI, con una
# pérdida máxima de 24 horas si se corre una vez al día.
#
#   .\scripts\respaldar.ps1                  respalda Supabase local
#   .\scripts\respaldar.ps1 -Entorno Cloud   respalda Supabase cloud con .env.cloud
#
# La base se respalda con pg_dump desde un contenedor con la misma imagen de
# Postgres de Supabase, conectado como postgres, y los archivos se bajan del
# bucket con la API de Storage y se comprueban con el sha256 de convi.archivos.
# Solo lee: no cambia la base ni el bucket. Las claves no se muestran.
#
# El respaldo tiene datos personales: guárdalo solo en un disco cifrado, nunca
# en Git ni en carpetas compartidas. PB-134 lo comprueba con
# scripts/ensayar-restauracion.ps1.

$ImagenPorDefecto = 'public.ecr.aws/supabase/postgres:17.6.1.167'
$Esquemas = @('convi', 'auth', 'storage', 'supabase_migrations', 'public')
$Extensiones = @('vector', 'pgcrypto', 'uuid-ossp')

function Leer-Variables([string]$Ruta) {
    $valores = @{}
    if (-not (Test-Path -LiteralPath $Ruta)) { return $valores }
    foreach ($linea in [System.IO.File]::ReadAllLines($Ruta)) {
        if ($linea -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
            $valores[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    return $valores
}

function Primer-Valor($Tabla, [string[]]$Nombres) {
    foreach ($n in $Nombres) { if ($Tabla.ContainsKey($n) -and $Tabla[$n]) { return $Tabla[$n] } }
    return $null
}

$raiz = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Falta Docker Desktop o docker no esta en PATH.' }
& docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no tiene el motor iniciado, abrelo e intentalo de nuevo.' }

if ($Entorno -eq 'Cloud') {
    $vars = Leer-Variables (Join-Path $raiz '.env.cloud')
    $urlBase = Primer-Valor $vars @('SUPABASE_DB_URL')
    $urlStorage = Primer-Valor $vars @('SUPABASE_URL')
    if (-not $urlBase -or -not $urlStorage) { throw 'Faltan SUPABASE_DB_URL o SUPABASE_URL en .env.cloud, sus valores no se muestran.' }
    if ($urlBase -notmatch '(?:[?&])sslmode=verify-full(?:&|$)') { throw 'La conexion cloud debe usar sslmode=verify-full, revisa SUPABASE-CLOUD.md.' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} else {
    $vars = Leer-Variables (Join-Path $raiz '.env')
    $urlBase = Primer-Valor $vars @('SUPABASE_DB_URL')
    if (-not $urlBase) { $urlBase = 'postgresql://postgres:postgres@host.docker.internal:54322/postgres' }
    if ($urlBase -match '\.supabase\.(co|com)') { throw '.env apunta a cloud, usa -Entorno Cloud con .env.cloud.' }
    # Storage se llama desde Windows, no desde Docker.
    $urlStorage = 'http://127.0.0.1:54321'
}
$clave = Primer-Valor $vars @('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
if (-not $clave) { throw 'Falta SUPABASE_SECRET_KEY para leer los archivos del bucket, su valor no se muestra.' }

# Misma imagen de Postgres que Supabase local, para usar su pg_dump.
$imagen = & docker inspect supabase_db_convi-local --format '{{.Config.Image}}' 2>$null
if ($LASTEXITCODE -ne 0 -or -not $imagen) { $imagen = $ImagenPorDefecto }

$inicio = Get-Date
$nombre = 'convi-' + $Entorno.ToLower() + '-' + $inicio.ToString('yyyyMMdd-HHmmss')
$carpeta = Join-Path $Destino $nombre
New-Item -ItemType Directory -Path (Join-Path $carpeta 'archivos') -Force | Out-Null
Write-Host "Respaldo de CONVI ($Entorno) en $carpeta"

$cronometro = [System.Diagnostics.Stopwatch]::StartNew()
Write-Host '[1/3] Base de datos: huella, roles, pg_dump y lista de archivos...'
$filtros = (($Esquemas | ForEach-Object { "-n $_" }) + ($Extensiones | ForEach-Object { "-e $_" })) -join ' '
# Los comandos van en un archivo: PowerShell 5.1 rompe las comillas de los
# argumentos que recibe docker.
$comandos = @(
    'set -e',
    'h() { psql "$CONVI_DB_URL" -X -q -At -v ON_ERROR_STOP=1 "$@"; }',
    'h -f /convi/respaldo-huella.sql -o /respaldo/huella-antes.txt',
    'pg_dumpall -d "$CONVI_DB_URL" --roles-only --no-role-passwords -f /respaldo/roles.sql 2> /respaldo/roles.log',
    "pg_dump `"`$CONVI_DB_URL`" -Fc $filtros -f /respaldo/base.dump 2> /respaldo/base.log",
    'h -f /convi/respaldo-huella.sql -o /respaldo/huella-despues.txt',
    'h -c "\copy (SELECT id, bucket_id, clave_almacenamiento, sha256, tamano_bytes FROM convi.archivos ORDER BY subido_en, id) TO ''/respaldo/archivos.csv'' WITH (FORMAT csv, HEADER)"'
) -join "`n"
[System.IO.File]::WriteAllText((Join-Path $carpeta 'respaldo.sh'), $comandos + "`n", [System.Text.UTF8Encoding]::new($false))
$env:CONVI_DB_URL = $urlBase
try {
    $argumentos = @('run', '--rm', '-e', 'CONVI_DB_URL',
        '-v', ($carpeta + ':/respaldo'),
        '-v', ((Join-Path $raiz 'scripts') + ':/convi:ro'))
    if ($Entorno -eq 'Cloud') {
        $argumentos += @('-e', 'PGSSLROOTCERT=/certs/prod-ca-2021.crt', '-v', ((Join-Path $raiz 'supabase\certs') + ':/certs:ro'))
    }
    $argumentos += @('--entrypoint', 'sh', $imagen, '/respaldo/respaldo.sh')
    & docker @argumentos
    if ($LASTEXITCODE -ne 0) { throw "Fallo el respaldo de la base, revisa base.log y roles.log en $carpeta." }
} finally {
    Remove-Item Env:\CONVI_DB_URL -ErrorAction SilentlyContinue
}
$segundosBase = [math]::Round($cronometro.Elapsed.TotalSeconds, 1)
$dump = Join-Path $carpeta 'base.dump'
$shaDump = (Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLower()

Write-Host '[2/3] Archivos del bucket con su sha256...'
$cronometro.Restart()
$encabezados = @{ apikey = $clave; Authorization = "Bearer $clave" }
$lista = @(Import-Csv -LiteralPath (Join-Path $carpeta 'archivos.csv'))
$bytes = [long]0
$fallas = New-Object System.Collections.Generic.List[string]
foreach ($a in $lista) {
    if ($a.clave_almacenamiento -notmatch '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' -or $a.clave_almacenamiento -match '(^|/)\.\.?(/|$)' -or $a.bucket_id -notmatch '^[A-Za-z0-9._-]+$') {
        $fallas.Add("$($a.id): clave no valida")
        continue
    }
    $ruta = Join-Path (Join-Path (Join-Path $carpeta 'archivos') $a.bucket_id) ($a.clave_almacenamiento -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $ruta) -Force | Out-Null
    $url = $urlStorage.TrimEnd('/') + '/storage/v1/object/authenticated/' + $a.bucket_id + '/' + (($a.clave_almacenamiento -split '/' | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/')
    $listo = $false
    for ($intento = 1; $intento -le 2 -and -not $listo; $intento++) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $url -Headers $encabezados -OutFile $ruta -TimeoutSec 120 | Out-Null
            $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $ruta).Hash.ToLower()
            $largo = (Get-Item -LiteralPath $ruta).Length
            if ($sha -eq $a.sha256 -and $largo -eq [long]$a.tamano_bytes) {
                $listo = $true
                $bytes += $largo
            } elseif ($intento -eq 2) {
                $fallas.Add("$($a.id): el sha256 o el tamano no coinciden")
            }
        } catch {
            if ($intento -eq 2) { $fallas.Add("$($a.id): no se pudo bajar") }
        }
    }
}
$segundosArchivos = [math]::Round($cronometro.Elapsed.TotalSeconds, 1)

Write-Host '[3/3] Manifiesto...'
$cambio = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $carpeta 'huella-antes.txt')).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $carpeta 'huella-despues.txt')).Hash
$manifiesto = [ordered]@{
    version = 1
    entorno = $Entorno
    inicio = $inicio.ToString('o')
    fin = (Get-Date).ToString('o')
    imagen_postgres = $imagen
    esquemas = $Esquemas
    extensiones = $Extensiones
    base = [ordered]@{ archivo = 'base.dump'; sha256 = $shaDump; bytes = (Get-Item -LiteralPath $dump).Length; segundos = $segundosBase }
    archivos = [ordered]@{ esperados = $lista.Count; respaldados = $lista.Count - $fallas.Count; bytes = $bytes; segundos = $segundosArchivos; fallas = @($fallas) }
    base_cambio_durante_el_respaldo = $cambio
}
[System.IO.File]::WriteAllText((Join-Path $carpeta 'respaldo.json'), ($manifiesto | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

if ($fallas.Count -gt 0) {
    $fallas | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
    throw "Respaldo incompleto: fallaron $($fallas.Count) de $($lista.Count) archivos, el respaldo no sirve para restaurar."
}

# Conserva los ultimos respaldos completos de este entorno y borra los mas antiguos.
if ($Conservar -gt 0) {
    $patron = '^convi-' + $Entorno.ToLower() + '-\d{8}-\d{6}$'
    $completos = @(Get-ChildItem -LiteralPath $Destino -Directory | Where-Object {
        $_.Name -match $patron -and (Test-Path -LiteralPath (Join-Path $_.FullName 'respaldo.json'))
    } | Sort-Object Name -Descending)
    foreach ($viejo in ($completos | Select-Object -Skip $Conservar)) {
        Remove-Item -LiteralPath $viejo.FullName -Recurse -Force
        Write-Host "  Borrado respaldo antiguo $($viejo.Name)"
    }
}

$mb = [math]::Round(((Get-Item -LiteralPath $dump).Length + $bytes) / 1MB, 1)
Write-Host ''
Write-Host "Respaldo listo: base en $segundosBase s, $($lista.Count) archivos en $segundosArchivos s, $mb MB en total."
if ($cambio) { Write-Host 'Aviso: la base cambio mientras se respaldaba, el ensayo de restauracion lo va a indicar.' }
Write-Host "Comprueba que se puede restaurar con: .\scripts\ensayar-restauracion.ps1 -Respaldo `"$carpeta`""
