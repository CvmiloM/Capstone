param([switch]$Build)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Falta Docker Desktop o docker no esta en PATH.'
    }
    & docker info --format '{{.ServerVersion}}' 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Desktop no tiene el motor iniciado. Abre Docker Desktop e intentalo nuevamente.'
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
        throw 'Para Supabase CLI local instala Node.js 20 o superior (incluye npx) en Windows.'
    }
    $nodeMajor = [int]((& node --version).Trim() -replace '^v(\d+).*$', '$1')
    if ($nodeMajor -lt 20) {
        throw 'Se necesita Node.js 20 o superior para Supabase CLI.'
    }

    Write-Host '[1/4] Iniciando Supabase local (la primera vez descarga imagenes)...'
    # Guardamos stdout: 'supabase start' puede imprimir claves incluso en desarrollo.
    $startOutput = @(& npx.cmd --yes supabase@2.117.0 start)
    if ($LASTEXITCODE -ne 0) { throw 'No fue posible iniciar Supabase. Ejecuta el comando manual solo en una terminal privada para revisar errores.' }

    Write-Host '[2/4] Obteniendo las claves LOCALES (no se imprimiran)...'
    $statusLines = @(& npx.cmd --yes supabase@2.117.0 status -o env)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de Supabase.' }
    $values = @{}
    foreach ($line in $statusLines) {
        if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)\s*$') {
            $values[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if (-not $values.ContainsKey('ANON_KEY') -and -not $values.ContainsKey('PUBLISHABLE_KEY')) {
        throw 'Supabase no entrego ninguna clave publica. Revisa el estado de Supabase CLI.'
    }
    if (-not $values.ContainsKey('SERVICE_ROLE_KEY') -and -not $values.ContainsKey('SECRET_KEY')) {
        throw 'Supabase no entrego ninguna clave de servidor. Revisa el estado de Supabase CLI.'
    }

    Write-Host '[3/4] Preparando .env local ignorado por Git...'
    $envPath = Join-Path $projectRoot '.env'
    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $projectRoot '.env.example') $envPath
    }
    $envLines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) { $envLines.Add($line) }
    $mapping = @{
        'PUBLISHABLE_KEY' = 'SUPABASE_PUBLISHABLE_KEY'
        'SECRET_KEY' = 'SUPABASE_SECRET_KEY'
        'ANON_KEY' = 'SUPABASE_ANON_KEY'
        'SERVICE_ROLE_KEY' = 'SUPABASE_SERVICE_ROLE_KEY'
    }
    foreach ($sourceName in $mapping.Keys) {
        if (-not $values.ContainsKey($sourceName)) { continue }
        $targetName = $mapping[$sourceName]
        $newLine = $targetName + '=' + $values[$sourceName]
        $found = $false
        for ($i = 0; $i -lt $envLines.Count; $i++) {
            if ($envLines[$i].StartsWith($targetName + '=')) {
                $envLines[$i] = $newLine
                $found = $true
                break
            }
        }
        if (-not $found) { $envLines.Add($newLine) }
    }
    [System.IO.File]::WriteAllText($envPath, ($envLines -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))

    Write-Host '[4/4] Iniciando frontend y API...'
    if ($Build) {
        & docker compose up --build -d
    } else {
        & docker compose up -d
    }
    if ($LASTEXITCODE -ne 0) { throw 'Fallo Docker Compose. Revisa la salida anterior.' }
    Write-Host ''
    Write-Host 'CONVI: http://localhost:3000 | API: http://localhost:3001 | Studio: http://localhost:54323'
    Write-Host 'Para revisar los contenedores: docker compose ps'
} finally {
    Pop-Location
}
