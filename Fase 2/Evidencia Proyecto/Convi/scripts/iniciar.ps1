param(
    [switch]$Build,
    [ValidateSet('Local', 'Cloud')][string]$Entorno = 'Local'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Reconstruir la imagen no actualiza node_modules en los volúmenes existentes.
# Sincronizar siempre el lockfile, con ambas aplicaciones detenidas para que
# no lean dependencias mientras pnpm las reemplaza. No se borran volúmenes.
function Iniciar-Aplicaciones {
    param([string[]]$ComposeArguments = @())
    if ($Build) {
        & docker compose @ComposeArguments build
        if ($LASTEXITCODE -ne 0) { throw 'Fallo la construccion de las imagenes de CONVI.' }
    }
    & docker compose @ComposeArguments stop api web
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron detener las aplicaciones para sincronizar sus dependencias.' }
    & docker compose @ComposeArguments run --rm --no-deps -T -e CI=true api corepack pnpm install --frozen-lockfile --store-dir /root/.local/share/pnpm/store
    if ($LASTEXITCODE -ne 0) { throw 'Fallo la instalacion de dependencias del lockfile. Revisa la conexion y vuelve a ejecutar el arranque.' }
    & docker compose @ComposeArguments up -d --force-recreate
    if ($LASTEXITCODE -ne 0) { throw 'Fallo el inicio de las aplicaciones de CONVI.' }
}

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
    if ($Entorno -eq 'Cloud') {
        # Las claves cloud se guardan aparte: no iniciar Supabase local ni reemplazarlas.
        $cloudPath = Join-Path $projectRoot '.env.cloud'
        if (-not (Test-Path -LiteralPath $cloudPath)) {
            throw 'Falta .env.cloud. Completa la configuracion privada siguiendo SUPABASE-CLOUD.md.'
        }
        $cloud = @{}
        foreach ($line in [System.IO.File]::ReadAllLines($cloudPath)) {
            if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
                $cloud[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
            }
        }
        if (-not $cloud['SUPABASE_URL'] -or -not $cloud['NEXT_PUBLIC_SUPABASE_URL'] -or -not $cloud['SUPABASE_DB_URL'] -or -not ($cloud['SUPABASE_PUBLISHABLE_KEY'] -or $cloud['SUPABASE_ANON_KEY'])) {
            throw 'Faltan URL, clave publicable o conexion de base en .env.cloud. No se muestran sus valores.'
        }
        # El modulo de cuentas necesita esta clave privada para enviar invitaciones.
        if (-not ($cloud['SUPABASE_SECRET_KEY'] -or $cloud['SUPABASE_SERVICE_ROLE_KEY'])) {
            throw 'Falta SUPABASE_SECRET_KEY en .env.cloud para la API de cuentas. Obtenla del mismo proyecto Supabase; nunca uses NEXT_PUBLIC para una clave privada.'
        }
        try {
            $authUrl = [uri]$cloud['SUPABASE_URL']
            $dbUrl = [uri]$cloud['SUPABASE_DB_URL']
        } catch {
            throw 'Una URL de .env.cloud no es valida. Revisa la guia sin compartir credenciales.'
        }
        if ($authUrl.Scheme -ne 'https' -or -not $authUrl.Host.EndsWith('.supabase.co') -or $cloud['SUPABASE_URL'].TrimEnd('/') -ne $cloud['NEXT_PUBLIC_SUPABASE_URL'].TrimEnd('/')) {
            throw 'Cloud exige la misma URL HTTPS de Supabase para web y API.'
        }
        if ($dbUrl.Scheme -notin @('postgres', 'postgresql') -or $dbUrl.Host -notmatch '\.supabase\.(co|com)$' -or $dbUrl.Query -notmatch '(?:[?&])sslmode=verify-full(?:&|$)') {
            throw 'La conexion cloud debe apuntar a Supabase y usar sslmode=verify-full.'
        }
        Iniciar-Aplicaciones -ComposeArguments @('--env-file', '.env.cloud')
        Write-Host 'CONVI con Supabase cloud iniciado. Las claves y los datos locales se conservan.'
        return
    }
    # Evitar reemplazar claves cloud si alguien las puso en el archivo local por error.
    $localPath = Join-Path $projectRoot '.env'
    if (Test-Path -LiteralPath $localPath) {
        foreach ($line in [System.IO.File]::ReadAllLines($localPath)) {
            if ($line -match '^\s*(SUPABASE_URL|NEXT_PUBLIC_SUPABASE_URL|SUPABASE_DB_URL)=.*\.supabase\.(co|com)') {
                throw '.env apunta a cloud. Usa .env.cloud para cloud y restaura .env local antes de continuar.'
            }
        }
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
    Iniciar-Aplicaciones
    Write-Host ''
    Write-Host 'CONVI: http://localhost:3000 | API: http://localhost:3001 | Studio: http://localhost:54323'
    Write-Host 'Para revisar los contenedores: docker compose ps'
} finally {
    Pop-Location
}
