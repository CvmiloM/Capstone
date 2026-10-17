param(
    [Parameter(Mandatory = $true)][string]$SubscriptionId,
    [ValidateSet('Base', 'Redis', 'Aplicaciones')][string]$Etapa = 'Base',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')][string]$Version = ('inicial-' + (Get-Date -Format 'yyyyMMddHHmmss'))
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# PB-145/PB-027: nunca invoca Git ni ejecuta migraciones. Redis solo guarda AZURE_REDIS_URL en .env.cloud.
$projectRoot = Split-Path -Parent $PSScriptRoot
$resourceGroup = 'rg-convi-pruebas'
function Invocar-Az {
    param([string[]]$Argumentos)
    $resultado = & az @Argumentos --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Azure no pudo completar la operacion, revisa el despliegue en el portal sin compartir credenciales.' }
    return $resultado
}
function Comprobar-Docker {
    if ($LASTEXITCODE -ne 0) { throw 'Fallo Docker, no se actualizaron las aplicaciones.' }
}

Push-Location $projectRoot
try {
    $null = Invocar-Az -Argumentos @('account', 'set', '--subscription', $SubscriptionId)
    $grupo = Invocar-Az -Argumentos @('group', 'show', '--name', $resourceGroup, '-o', 'json') | ConvertFrom-Json
    if ($grupo.name -ne $resourceGroup) { throw 'El grupo de pruebas no coincide, no se continua con otro grupo.' }

    if ($Etapa -eq 'Base') {
        foreach ($proveedor in @('Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.ManagedIdentity')) {
            $null = Invocar-Az -Argumentos @('provider', 'register', '--namespace', $proveedor, '--wait', '-o', 'none')
        }
        $null = Invocar-Az -Argumentos @('deployment', 'group', 'create', '-g', $resourceGroup, '-n', 'convi-base', '--template-file', 'infra/azure/base.bicep', '-o', 'none')
        $salida = Invocar-Az -Argumentos @('deployment', 'group', 'show', '-g', $resourceGroup, '-n', 'convi-base', '--query', 'properties.outputs', '-o', 'json') | ConvertFrom-Json
        # Solo identificadores publicos para las variables de GitHub, no claves de acceso.
        Write-Host ('AZURE_REGISTRY_NAME=' + $salida.registryName.value)
        Write-Host ('AZURE_CLIENT_ID=' + $salida.githubClientId.value)
        Write-Host ('AZURE_TENANT_ID=' + $salida.tenantId.value)
        Write-Host ('AZURE_SUBSCRIPTION_ID=' + $salida.subscriptionId.value)
        return
    }


    if ($Etapa -eq 'Redis') {
        $cloudPath = Join-Path $projectRoot '.env.cloud'
        if (-not (Test-Path -LiteralPath $cloudPath)) { throw 'Prepara primero el archivo privado .env.cloud.' }
        $lineas = @([System.IO.File]::ReadAllLines($cloudPath))
        if ($lineas -match '^\s*REDIS_URL=') { throw 'Quita REDIS_URL de .env.cloud: Docker local debe usar su propio Redis.' }
        $null = Invocar-Az -Argumentos @('provider', 'register', '--namespace', 'Microsoft.Cache', '--wait', '-o', 'none')
        $null = Invocar-Az -Argumentos @('deployment', 'group', 'create', '-g', $resourceGroup, '-n', 'convi-redis-piloto', '--template-file', 'infra/azure/redis.bicep', '-o', 'none')
        $redis = Invocar-Az -Argumentos @('deployment', 'group', 'show', '-g', $resourceGroup, '-n', 'convi-redis-piloto', '--query', 'properties.outputs', '-o', 'json') | ConvertFrom-Json
        $uriClaves = "https://management.azure.com/subscriptions/$SubscriptionId/resourceGroups/$resourceGroup/providers/Microsoft.Cache/redisEnterprise/$($redis.redisName.value)/databases/default/listKeys?api-version=2025-07-01"
        $claves = Invocar-Az -Argumentos @('rest', '--method', 'post', '--url', $uriClaves, '-o', 'json') | ConvertFrom-Json
        $urlRedis = 'rediss://:' + [uri]::EscapeDataString($claves.primaryKey) + '@' + $redis.redisHost.value + ':' + $redis.redisPort.value
        $conservadas = @($lineas | Where-Object { $_ -notmatch '^\s*AZURE_REDIS_URL=' })
        [System.IO.File]::WriteAllText($cloudPath, (($conservadas + ('AZURE_REDIS_URL=' + $urlRedis)) -join "`n") + "`n", [System.Text.UTF8Encoding]::new($false))
        Write-Host ('Redis piloto: ' + $redis.redisName.value + '. URL guardada en .env.cloud como AZURE_REDIS_URL, sin imprimir credenciales.')
        Write-Host 'La etapa Aplicaciones entrega ese secreto solo a la API de Azure. No lo copies a REDIS_URL local.'
        return
    }

    $cloud = @{}
    foreach ($linea in [System.IO.File]::ReadAllLines((Join-Path $projectRoot '.env.cloud'))) {
        if ($linea -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
            $cloud[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
    if ($cloud['SUPABASE_URL'] -ne 'https://cwgydufnbpapinzauzui.supabase.co' -or
        $cloud['SUPABASE_PUBLISHABLE_KEY'] -notmatch '^sb_publishable_' -or
        $cloud['SUPABASE_SECRET_KEY'] -notmatch '^sb_secret_' -or
        $cloud['SUPABASE_DB_URL'] -notmatch '^postgres(?:ql)?://.+\.supabase\.(?:co|com):\d+/postgres\?' -or
        $cloud['SUPABASE_DB_URL'] -notmatch '(?:[?&])sslmode=verify-full(?:&|$)') {
        throw 'Falta configuracion cloud HTTPS/verify-full o claves modernas del proyecto CONVI, no se muestran valores privados.'
    }

    try { $redisUrl = [uri]$cloud['AZURE_REDIS_URL'] } catch { throw 'AZURE_REDIS_URL no es una URL TLS valida; no se muestran credenciales.' }
    if (-not $redisUrl -or $redisUrl.Scheme -ne 'rediss' -or
        $redisUrl.Host -notmatch '^[a-z0-9-]+\.brazilsouth\.redis\.azure\.net$' -or
        $redisUrl.Port -ne 10000 -or $redisUrl.UserInfo -notmatch '^:.+' -or
        $redisUrl.Query -or $redisUrl.Fragment -or $redisUrl.AbsolutePath -notin @('', '/')) {
        throw 'Falta AZURE_REDIS_URL TLS del Redis piloto. Ejecuta primero la etapa Redis; no uses REDIS_URL local.'
    }

    $base = Invocar-Az -Argumentos @('deployment', 'group', 'show', '-g', $resourceGroup, '-n', 'convi-base', '--query', 'properties.outputs', '-o', 'json') | ConvertFrom-Json
    $registro = $base.registryServer.value
    $apiImage = "$registro/convi-api:$Version"
    $webImage = "$registro/convi-web:$Version"

    # Solo estas dos variables publicas pasan a la construccion, nunca SECRET ni DB_URL.
    $anteriorUrl = $env:NEXT_PUBLIC_SUPABASE_URL
    $anteriorClave = $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    try {
        $env:NEXT_PUBLIC_SUPABASE_URL = $cloud['SUPABASE_URL']
        $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $cloud['SUPABASE_PUBLISHABLE_KEY']
        & docker build -f Dockerfile.production --target api -t $apiImage .
        Comprobar-Docker
        & docker build -f Dockerfile.production --target web --build-arg NEXT_PUBLIC_SUPABASE_URL --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --build-arg "DEPLOYMENT_ID=$Version" -t $webImage .
        Comprobar-Docker
        $null = Invocar-Az -Argumentos @('acr', 'login', '--name', $base.registryName.value)
        & docker push $apiImage
        Comprobar-Docker
        & docker push $webImage
        Comprobar-Docker
    } finally {
        $env:NEXT_PUBLIC_SUPABASE_URL = $anteriorUrl
        $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $anteriorClave
    }

    # El certificado publico va en la imagen, el DSN privado se entrega como parametro seguro.
    $db = $cloud['SUPABASE_DB_URL']
    if ($db -match '(?:[?&])sslrootcert=') {
        $db = $db -replace '([?&])sslrootcert=[^&]*', '$1sslrootcert=%2Fapp%2Fcerts%2Fprod-ca-2021.crt'
    } else { $db += '&sslrootcert=%2Fapp%2Fcerts%2Fprod-ca-2021.crt' }
    # Solo consulta metadatos públicos; una segunda instalación no debe quitar el dominio.
    $dominiosJson = Invocar-Az -Argumentos @('containerapp', 'list', '-g', $resourceGroup, '--query', "[?name == 'ca-convi-web-estandar'].properties.configuration.ingress.customDomains | [0]", '-o', 'json')
    $dominios = if ($dominiosJson) { @($dominiosJson | ConvertFrom-Json | Where-Object { $null -ne $_ }) } else { @() }
    $valores = @{
        registryName = $base.registryName.value; apiImage = $apiImage; webImage = $webImage
        supabaseUrl = $cloud['SUPABASE_URL']; supabasePublishableKey = $cloud['SUPABASE_PUBLISHABLE_KEY']
        supabaseSecretKey = $cloud['SUPABASE_SECRET_KEY']; supabaseDbUrl = $db
        redisUrl = $cloud['AZURE_REDIS_URL']
        webCustomDomains = $dominios
    }
    $parametros = @{}
    foreach ($nombre in $valores.Keys) { $parametros[$nombre] = @{ value = $valores[$nombre] } }
    $temporal = New-TemporaryFile
    try {
        [System.IO.File]::WriteAllText($temporal.FullName, (@{ parameters = $parametros } | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
        $null = Invocar-Az -Argumentos @('deployment', 'group', 'create', '-g', $resourceGroup, '-n', 'convi-aplicaciones', '--template-file', 'infra/azure/aplicaciones.bicep', '--parameters', ('@' + $temporal.FullName), '-o', 'none')
    } finally {
        # Solo se elimina el archivo temporal creado por esta ejecucion, nunca carpetas.
        Remove-Item -LiteralPath $temporal.FullName -Force
    }
    $url = Invocar-Az -Argumentos @('deployment', 'group', 'show', '-g', $resourceGroup, '-n', 'convi-aplicaciones', '--query', 'properties.outputs.webUrl.value', '-o', 'tsv')
    Write-Host ('CONVI: ' + $url)
    Write-Host 'Falta verificar redirecciones de Supabase y probar login, MFA e invitaciones en esta direccion.'
} finally { Pop-Location }
