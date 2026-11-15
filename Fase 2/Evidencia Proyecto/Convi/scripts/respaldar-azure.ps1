$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$ProgressPreference = 'SilentlyContinue'

$destino = Join-Path ([IO.Path]::GetTempPath()) ('convi-' + [guid]::NewGuid().ToString('N'))
& "$PSScriptRoot/respaldar.ps1" -Entorno Cloud -Destino $destino -Conservar 0 -ClientePostgresLocal
$copia = Get-ChildItem -LiteralPath $destino -Directory | Select-Object -First 1
$manifiesto = Get-Content -LiteralPath (Join-Path $copia.FullName 'respaldo.json') -Raw | ConvertFrom-Json
if ($manifiesto.base_cambio_durante_el_respaldo) { throw 'La base cambió durante la copia. Se requiere otro intento.' }

$archivo = Join-Path $destino ($copia.Name + '.tar.gz')
& tar -czf $archivo -C $destino $copia.Name
if ($LASTEXITCODE -ne 0) { throw 'No se pudo empaquetar el respaldo.' }

try {
    $identidad = Invoke-RestMethod -TimeoutSec 30 -Headers @{
        'X-IDENTITY-HEADER' = $env:IDENTITY_HEADER
    } -Uri ("${env:IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=https%3A%2F%2Fstorage.azure.com%2F&client_id=${env:AZURE_CLIENT_ID}")
    $headers = @{
        Authorization = 'Bearer ' + $identidad.access_token
        'x-ms-version' = '2023-11-03'
        'x-ms-blob-type' = 'BlockBlob'
        'If-None-Match' = '*'
        'Content-MD5' = [Convert]::ToBase64String([Convert]::FromHexString((Get-FileHash -LiteralPath $archivo -Algorithm MD5).Hash))
    }
    $url = "https://${env:CONVI_STORAGE_ACCOUNT}.blob.core.windows.net/respaldos/$([IO.Path]::GetFileName($archivo))"
    $respuesta = Invoke-WebRequest -Uri $url -Method Put -InFile $archivo -Headers $headers -ContentType 'application/gzip' -TimeoutSec 600
    if ($respuesta.StatusCode -ne 201) { throw 'Respuesta inesperada al guardar el respaldo.' }
} catch {
    $estado = if ($_.Exception -is [Microsoft.PowerShell.Commands.HttpResponseException]) { [int]$_.Exception.Response.StatusCode } else { 'sin respuesta HTTP' }
    throw "Falló el guardado en Azure Storage ($estado)."
}
Write-Host "Respaldo guardado en Azure Storage. Archivos verificados: $($manifiesto.archivos.respaldados)."
