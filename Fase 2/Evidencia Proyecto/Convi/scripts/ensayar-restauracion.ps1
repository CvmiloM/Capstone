param(
    [string]$Respaldo,
    [string]$Carpeta = (Join-Path $env:USERPROFILE 'CONVI-respaldos'),
    [ValidateRange(1, 48)][int]$MetaHoras = 4,
    [ValidateRange(1, 168)][int]$PerdidaHoras = 24
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# PB-134 (HU-114): ensayo de restauración de un respaldo de scripts/respaldar.ps1.
#
#   .\scripts\ensayar-restauracion.ps1                    usa el respaldo más reciente
#   .\scripts\ensayar-restauracion.ps1 -Respaldo <ruta>   usa ese respaldo
#
# Levanta un Postgres temporal con la misma imagen de Supabase, sin puertos
# publicados, restaura ahí la base y la compara tabla por tabla con la huella
# tomada al respaldar: filas, contenido, políticas, triggers, funciones y
# llaves foráneas (relaciones e historial). Después comprueba cada archivo de
# convi.archivos de la base restaurada contra su sha256. Mide el tiempo de
# recuperación (meta 4 horas) y la antigüedad del respaldo (meta 24 horas).
# No toca la base ni el bucket de CONVI, y al terminar borra el contenedor.

function Leer-Huella([string]$Ruta) {
    $h = @{}
    foreach ($linea in [System.IO.File]::ReadAllLines($Ruta)) {
        $partes = $linea.Split('|')
        if ($partes.Count -ge 3) { $h[$partes[0] + '|' + $partes[1]] = ($partes[2..($partes.Count - 1)] -join '|') }
    }
    return $h
}

function Horas([TimeSpan]$t) { return [math]::Round($t.TotalHours, 2) }

if (-not $Respaldo) {
    $ultimo = Get-ChildItem -LiteralPath $Carpeta -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^convi-(local|cloud)-\d{8}-\d{6}$' -and (Test-Path -LiteralPath (Join-Path $_.FullName 'respaldo.json')) } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $ultimo) { throw "No hay respaldos completos en $Carpeta, corre antes .\scripts\respaldar.ps1." }
    $Respaldo = $ultimo.FullName
}
$Respaldo = (Resolve-Path -LiteralPath $Respaldo).Path
$manifiesto = Get-Content -LiteralPath (Join-Path $Respaldo 'respaldo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$raiz = Split-Path -Parent $PSScriptRoot
& docker info --format '{{.ServerVersion}}' 1>$null 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop no tiene el motor iniciado, abrelo e intentalo de nuevo.' }

$inicio = Get-Date
$total = [System.Diagnostics.Stopwatch]::StartNew()
$ensayo = Join-Path $Respaldo ('ensayo-' + $inicio.ToString('yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $ensayo -Force | Out-Null
$errores = New-Object System.Collections.Generic.List[string]
$avisos = New-Object System.Collections.Generic.List[string]
Write-Host "Ensayo de restauracion de $Respaldo"

Write-Host '[1/5] Integridad del respaldo...'
$sha = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Respaldo $manifiesto.base.archivo)).Hash.ToLower()
if ($sha -ne $manifiesto.base.sha256) { throw 'El archivo de la base no coincide con el sha256 del manifiesto, el respaldo esta danado.' }
if (@($manifiesto.archivos.fallas).Count -gt 0) { throw 'El respaldo quedo incompleto al hacerse, no sirve para restaurar.' }

$contenedor = 'convi-ensayo-' + $inicio.ToString('yyyyMMddHHmmss')
$clave = -join ((1..24) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
try {
    Write-Host '[2/5] Postgres temporal con la misma imagen...'
    & docker run -d --name $contenedor -e "POSTGRES_PASSWORD=$clave" -v ($Respaldo + ':/respaldo:ro') -v ($ensayo + ':/ensayo') -v ((Join-Path $raiz 'scripts') + ':/convi:ro') $manifiesto.imagen_postgres 1>$null
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el Postgres temporal.' }
    $listo = $false
    for ($i = 0; $i -lt 90 -and -not $listo; $i++) {
        Start-Sleep -Seconds 2
        & docker exec $contenedor pg_isready -q -U postgres -h localhost 1>$null 2>$null
        $listo = ($LASTEXITCODE -eq 0)
    }
    if (-not $listo) { throw 'El Postgres temporal no respondio en 3 minutos.' }

    Write-Host '[3/5] Restaurando la base...'
    $restauracion = [System.Diagnostics.Stopwatch]::StartNew()
    $comandos = @(
        'set -e',
        'psql -U supabase_admin -d postgres -X -q -f /respaldo/roles.sql > /ensayo/roles.log 2>&1 || true',
        'psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE convi_restaurada"',
        'psql -U supabase_admin -d convi_restaurada -X -q -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE" -c "CREATE SCHEMA IF NOT EXISTS extensions"',
        'pg_restore -U supabase_admin -d convi_restaurada --exit-on-error /respaldo/base.dump > /ensayo/restauracion.log 2>&1',
        'h() { psql -U supabase_admin -d convi_restaurada -X -q -At -v ON_ERROR_STOP=1 "$@"; }',
        'h -f /convi/respaldo-huella.sql -o /ensayo/huella-restaurada.txt',
        'h -c "\copy (SELECT id, bucket_id, clave_almacenamiento, sha256, tamano_bytes FROM convi.archivos ORDER BY subido_en, id) TO ''/ensayo/archivos.csv'' WITH (FORMAT csv, HEADER)"'
    ) -join "`n"
    [System.IO.File]::WriteAllText((Join-Path $ensayo 'restaurar.sh'), $comandos + "`n", [System.Text.UTF8Encoding]::new($false))
    & docker exec $contenedor sh /ensayo/restaurar.sh
    if ($LASTEXITCODE -ne 0) { throw "Fallo la restauracion de la base, revisa restauracion.log en $ensayo." }
    $restauracion.Stop()

    Write-Host '[4/5] Comparando con la huella del respaldo...'
    $antes = Leer-Huella (Join-Path $Respaldo 'huella-antes.txt')
    $despues = Leer-Huella (Join-Path $Respaldo 'huella-despues.txt')
    $restaurada = Leer-Huella (Join-Path $ensayo 'huella-restaurada.txt')
    $tablas = 0
    foreach ($k in (@($antes.Keys) + @($restaurada.Keys) | Sort-Object -Unique)) {
        if ($k.StartsWith('tabla|')) { $tablas++ }
        $r = $restaurada[$k]
        if ($r -eq $antes[$k] -or $r -eq $despues[$k]) { continue }
        $nombre = $k.Substring($k.IndexOf('|') + 1)
        if ($antes[$k] -ne $despues[$k]) {
            $avisos.Add("$nombre cambio mientras se respaldaba")
        } elseif ($null -eq $r) {
            $errores.Add("$nombre no esta en la base restaurada")
        } elseif ($null -eq $antes[$k]) {
            $errores.Add("$nombre aparece en la base restaurada y no en el respaldo")
        } else {
            $errores.Add("$nombre no coincide: respaldo $($antes[$k]), restaurada $r")
        }
    }

    Write-Host '[5/5] Archivos contra su sha256...'
    $verificacion = [System.Diagnostics.Stopwatch]::StartNew()
    $lista = @(Import-Csv -LiteralPath (Join-Path $ensayo 'archivos.csv'))
    $bytes = [long]0
    foreach ($a in $lista) {
        $ruta = Join-Path (Join-Path (Join-Path $Respaldo 'archivos') $a.bucket_id) ($a.clave_almacenamiento -replace '/', '\')
        if (-not (Test-Path -LiteralPath $ruta)) { $errores.Add("archivo $($a.id) no esta en el respaldo"); continue }
        $largo = (Get-Item -LiteralPath $ruta).Length
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ruta).Hash.ToLower()
        if ($hash -ne $a.sha256 -or $largo -ne [long]$a.tamano_bytes) { $errores.Add("archivo $($a.id) no coincide con su sha256"); continue }
        $bytes += $largo
    }
    $verificacion.Stop()
} finally {
    & docker rm -f $contenedor 1>$null 2>$null
}
$total.Stop()

$antiguedad = $inicio - [datetime]$manifiesto.inicio
$previo = Get-ChildItem -LiteralPath (Split-Path -Parent $Respaldo) -Directory |
    Where-Object { $_.Name -match ('^convi-' + $manifiesto.entorno.ToLower() + '-\d{8}-\d{6}$') -and $_.Name -lt (Split-Path -Leaf $Respaldo) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'respaldo.json')) } |
    Sort-Object Name -Descending | Select-Object -First 1
$intervalo = $null
if ($previo) {
    $mPrevio = Get-Content -LiteralPath (Join-Path $previo.FullName 'respaldo.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $intervalo = [datetime]$manifiesto.inicio - [datetime]$mPrevio.inicio
}
if ($total.Elapsed.TotalHours -gt $MetaHoras) { $errores.Add("la recuperacion tomo mas de $MetaHoras horas") }
if ($intervalo -and $intervalo.TotalHours -gt $PerdidaHoras) { $avisos.Add("entre este respaldo y el anterior pasaron mas de $PerdidaHoras horas") }
if ($antiguedad.TotalHours -gt $PerdidaHoras) { $avisos.Add("el respaldo tiene mas de $PerdidaHoras horas, hoy se perderia mas que la meta") }

$resultado = [ordered]@{
    respaldo = Split-Path -Leaf $Respaldo
    entorno = $manifiesto.entorno
    ensayo_inicio = $inicio.ToString('o')
    resultado = $(if ($errores.Count -eq 0) { 'APROBADO' } else { 'RECHAZADO' })
    recuperacion = [ordered]@{
        total_segundos = [math]::Round($total.Elapsed.TotalSeconds, 1)
        base_segundos = [math]::Round($restauracion.Elapsed.TotalSeconds, 1)
        archivos_segundos = [math]::Round($verificacion.Elapsed.TotalSeconds, 1)
        meta_horas = $MetaHoras
    }
    perdida = [ordered]@{
        antiguedad_del_respaldo_horas = Horas $antiguedad
        horas_desde_el_respaldo_anterior = $(if ($intervalo) { Horas $intervalo } else { $null })
        meta_horas = $PerdidaHoras
    }
    tablas_comparadas = $tablas
    archivos_comprobados = $lista.Count
    archivos_bytes = $bytes
    errores = @($errores)
    avisos = @($avisos)
}
[System.IO.File]::WriteAllText((Join-Path $ensayo 'resultado.json'), ($resultado | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host "Resultado: $($resultado.resultado)"
Write-Host "Recuperacion: $($resultado.recuperacion.total_segundos) s en total (base $($resultado.recuperacion.base_segundos) s, archivos $($resultado.recuperacion.archivos_segundos) s), meta $MetaHoras h"
Write-Host "Perdida: el respaldo tiene $($resultado.perdida.antiguedad_del_respaldo_horas) h, meta $PerdidaHoras h"
Write-Host "Comparadas $tablas tablas con sus politicas, triggers, funciones y llaves foraneas, comprobados $($lista.Count) archivos"
foreach ($e in $errores) { Write-Host "  Error: $e" }
foreach ($a in $avisos) { Write-Host "  Aviso: $a" }
Write-Host "Detalle en $ensayo"
if ($errores.Count -gt 0) { exit 1 }
