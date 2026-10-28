<#
  Deja activa la IA de CONVI en el PC de Camilo: Ollama, convi-ia con token y Tailscale Funnel,
  que publica convi-ia en una dirección fija https://<pc>.<red>.ts.net para Azure.
  Uso, desde la carpeta Convi o con el acceso directo del escritorio:
    .\scripts\iniciar-ia.ps1            levanta lo que falte y muestra la dirección
    .\scripts\iniciar-ia.ps1 -Detener   cierra el acceso desde internet y apaga convi-ia (Ollama sigue)
  El token se lee de IA_EMBEDDINGS_TOKEN en .env y nunca se muestra.
#>
param(
    [switch]$Detener,
    [switch]$SinPausa,
    [string]$Carpeta = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$convi = $Carpeta
$datos = Join-Path $env:LOCALAPPDATA 'convi-ia'
$ultimaDireccion = Join-Path $datos 'ultima-direccion.txt'
$puerto = 8000
New-Item -ItemType Directory -Force -Path $datos | Out-Null

function Escribir([string]$texto, [string]$color = 'Gray') { Write-Host $texto -ForegroundColor $color }

function Terminar([int]$codigo) {
    if (-not $SinPausa) { Read-Host 'Presiona Enter para cerrar esta ventana' | Out-Null }
    exit $codigo
}

function Estado([string]$url, [string]$metodo = 'GET') {
    try {
        return (Invoke-WebRequest -UseBasicParsing -Uri $url -Method $metodo -TimeoutSec 8).StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

function Esperar([scriptblock]$condicion, [int]$segundos) {
    $limite = (Get-Date).AddSeconds($segundos)
    while ((Get-Date) -lt $limite) {
        if (& $condicion) { return $true }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Detener-ConviIa {
    Get-Process convi-ia -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-NetTCPConnection -LocalPort $puerto -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}

$tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
if (-not (Test-Path $tailscale)) { $tailscale = (Get-Command tailscale -ErrorAction SilentlyContinue).Source }

if ($Detener) {
    if ($tailscale) { & $tailscale funnel reset 2>$null | Out-Null }
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
    Detener-ConviIa
    Escribir 'convi-ia quedó apagado y ya no se puede llegar a él desde internet.' 'Green'
    Terminar 0
}

Escribir 'Iniciando la IA de CONVI...' 'Cyan'

# 1) Token desde .env, sin mostrarlo.
$archivoEnv = Join-Path $convi '.env'
$token = $null
if (Test-Path $archivoEnv) {
    $linea = Get-Content $archivoEnv | Where-Object { $_ -match '^\s*IA_EMBEDDINGS_TOKEN\s*=' } | Select-Object -Last 1
    if ($linea) { $token = ($linea -split '=', 2)[1].Trim().Trim('"') }
}
if (-not $token -or $token.Length -lt 32) {
    Escribir 'Falta IA_EMBEDDINGS_TOKEN en .env (32 caracteres o más). Sin token no se publica en internet.' 'Red'
    Terminar 1
}

# 2) Ollama.
if ((Estado 'http://127.0.0.1:11434/api/version') -ne 200) {
    Escribir 'Abriendo Ollama...'
    Start-Process (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe')
    if (-not (Esperar { (Estado 'http://127.0.0.1:11434/api/version') -eq 200 } 40)) {
        Escribir 'Ollama no respondió en 40 segundos.' 'Red'
        Terminar 1
    }
}
Escribir '[ok] Ollama' 'Green'

# 3) convi-ia. Si ya corre con token (rechaza sin token con 401) se deja como está.
$corriendo = (Estado "http://127.0.0.1:$puerto/salud") -eq 200
if ($corriendo -and (Estado "http://127.0.0.1:$puerto/api/embed" 'POST') -ne 401) {
    Escribir 'convi-ia corría sin token, lo reinicio con token...' 'Yellow'
    $corriendo = $false
}
if (-not $corriendo) {
    Detener-ConviIa
    $env:IA_EMBEDDINGS_TOKEN = $token
    Start-Process powershell.exe -WorkingDirectory $convi -WindowStyle Minimized -ArgumentList @(
        '-NoExit', '-NoProfile', '-Command',
        "`$host.UI.RawUI.WindowTitle = 'convi-ia (no cerrar)'; uv run --directory apps/ia convi-ia"
    )
    Remove-Item Env:\IA_EMBEDDINGS_TOKEN
    if (-not (Esperar { (Estado "http://127.0.0.1:$puerto/salud") -eq 200 } 90)) {
        Escribir 'convi-ia no respondió en 90 segundos, revisa la ventana minimizada "convi-ia".' 'Red'
        Terminar 1
    }
}
$salud = (Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$puerto/salud" -TimeoutSec 5).Content | ConvertFrom-Json
if (-not $salud.instalado -or -not $salud.generacion.instalado) {
    Escribir 'convi-ia corre, pero falta un modelo en Ollama (bge-m3:567m-fp16 o qwen3.5:9b).' 'Yellow'
}
Escribir '[ok] convi-ia con token en el puerto 8000' 'Green'

# 4) Tailscale Funnel: dirección fija https://<pc>.<red>.ts.net hacia convi-ia.
if (-not $tailscale) {
    Escribir 'No encontré Tailscale, instálalo con: winget install --id Tailscale.Tailscale' 'Red'
    Terminar 1
}
# El túnel rápido de Cloudflare ya no se usa.
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
$estadoTs = & $tailscale status --json 2>$null | Out-String | ConvertFrom-Json
if (-not $estadoTs -or $estadoTs.BackendState -ne 'Running') {
    Escribir 'Tailscale no tiene la sesión iniciada: ábrelo desde el menú Inicio, inicia sesión y vuelve a apretar el botón.' 'Red'
    Terminar 1
}
$direccion = 'https://' + $estadoTs.Self.DNSName.TrimEnd('.')
& $tailscale funnel --bg $puerto 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Escribir 'Tailscale no pudo activar Funnel. Corre "tailscale funnel --bg 8000" en una ventana para ver el enlace que lo habilita.' 'Red'
    Terminar 1
}
if (-not (Esperar { (Estado "$direccion/salud") -eq 200 } 60)) {
    Escribir 'Funnel quedó activo, pero todavía no responde desde internet, prueba de nuevo en un minuto.' 'Yellow'
}
Escribir '[ok] Tailscale Funnel' 'Green'

# 5) Resumen.
$anterior = if (Test-Path $ultimaDireccion) { (Get-Content $ultimaDireccion -Raw).Trim() } else { '' }
Set-Content -Path $ultimaDireccion -Value $direccion -Encoding ASCII
Set-Clipboard -Value $direccion
Escribir ''
Escribir 'La IA de CONVI está activa.' 'Cyan'
Escribir "Dirección fija (ya copiada): $direccion"
Escribir "  IA_EMBEDDINGS_URL=$direccion/api/embed"
Escribir "  IA_GENERACION_URL=$direccion/api/chat"
if ($anterior -and $anterior -ne $direccion) {
    Escribir 'La dirección es distinta a la última vez: pásasela a Sebastián para que actualice Azure.' 'Yellow'
}
Escribir 'Deja el PC prendido: si se apaga o duerme, la IA deja de responder en Azure.'
Terminar 0
