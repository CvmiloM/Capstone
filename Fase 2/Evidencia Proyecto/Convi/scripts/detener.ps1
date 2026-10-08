$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    & docker compose stop
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible detener los servicios de CONVI.' }
    if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
        Write-Warning 'No se encontro Node/npx. Deten Supabase local cuando lo tengas disponible.'
    } else {
        # Sin --no-backup: conserva los datos locales.
        & npx.cmd --yes supabase@2.117.0 stop
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la detencion de Supabase.' }
    }
    Write-Host 'Servicios detenidos. Los datos locales de Supabase se conservan.'
} finally {
    Pop-Location
}
