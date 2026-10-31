<#
  Vigila que Azure pueda llegar a la IA de CONVI en el PC de Camilo y la repara sola.
  Cada vez que corre:
    1) si convi-ia u Ollama no responden en el PC, corre iniciar-ia.ps1 para levantarlos
    2) prueba la dirección pública desde afuera, como lo hace Azure: pide la IP a un DNS
       externo (desde el PC la dirección .ts.net se resuelve por dentro de Tailscale y
       siempre parece funcionar) y entra por esa IP
    3) si desde afuera no responde, reinicia Tailscale Funnel y vuelve a probar
  Deja un registro en %LOCALAPPDATA%\convi-ia\vigilante.log con cada falla y su arreglo.
  Uso, desde la carpeta Convi:
    .\scripts\vigilar-ia.ps1 -Probar      solo revisa y muestra el resultado, no cambia nada
    .\scripts\vigilar-ia.ps1 -Registrar   crea la tarea de Windows que lo corre cada 5 minutos
    .\scripts\vigilar-ia.ps1 -Quitar      borra esa tarea
    .\scripts\vigilar-ia.ps1 -Registro    muestra las últimas líneas del registro
    .\scripts\vigilar-ia.ps1 -Apagar      apaga la IA y pausa el vigilante, libera la tarjeta de video
    .\scripts\vigilar-ia.ps1 -Encender    vuelve a levantar la IA y reanuda el vigilante
  Después de -Apagar la IA queda apagada aunque reinicies el PC, hasta que uses -Encender.
#>
param(
    [switch]$Probar,
    [switch]$Registrar,
    [switch]$Quitar,
    [switch]$Registro,
    [switch]$Apagar,
    [switch]$Encender
)

$ErrorActionPreference = 'Stop'
$tarea = 'CONVI vigilante IA'
$puerto = 8000
$datos = Join-Path $env:LOCALAPPDATA 'convi-ia'
$archivoLog = Join-Path $datos 'vigilante.log'
$archivoEstado = Join-Path $datos 'vigilante-estado.txt'
New-Item -ItemType Directory -Force -Path $datos | Out-Null

function Anotar([string]$texto) {
    $linea = '{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto
    if ($Probar) { Write-Host $linea; return }
    Add-Content -Path $archivoLog -Value $linea -Encoding UTF8
    # El registro guarda solo las últimas 1000 líneas.
    $lineas = @(Get-Content $archivoLog -Encoding UTF8)
    if ($lineas.Count -gt 1000) {
        $lineas[-1000..-1] | Set-Content -Path $archivoLog -Encoding UTF8
    }
}

if ($Registro) {
    if (Test-Path $archivoLog) { Get-Content $archivoLog -Encoding UTF8 -Tail 30 }
    else { Write-Host 'Todavía no hay registro: el vigilante no ha encontrado fallas.' }
    exit 0
}

if ($Quitar) {
    Unregister-ScheduledTask -TaskName $tarea -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host 'La tarea del vigilante quedó borrada.' -ForegroundColor Green
    exit 0
}

$iniciar = Join-Path $PSScriptRoot 'iniciar-ia.ps1'

if ($Apagar) {
    # Primero se pausa el vigilante, si no la volvería a levantar en 5 minutos.
    Disable-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue | Out-Null
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $iniciar -Detener -SinPausa | Out-Null
    # Ollama también se cierra, así la tarjeta de video queda libre.
    Get-Process 'ollama app', 'ollama' -ErrorAction SilentlyContinue | Stop-Process -Force
    Anotar 'IA apagada a mano con -Apagar, vigilante en pausa'
    Write-Host 'La IA quedó apagada y el vigilante en pausa: convi.tech mostrará que la IA no está disponible.' -ForegroundColor Green
    Write-Host 'Para volver a levantarla: .\scripts\vigilar-ia.ps1 -Encender'
    exit 0
}

if ($Encender) {
    Enable-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue | Out-Null
    Anotar 'IA encendida a mano con -Encender, vigilante activo'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $iniciar -SinPausa
    if (-not (Get-ScheduledTask -TaskName $tarea -ErrorAction SilentlyContinue)) {
        Write-Host 'Ojo: la tarea del vigilante no existe, créala con .\scripts\vigilar-ia.ps1 -Registrar' -ForegroundColor Yellow
    }
    exit $LASTEXITCODE
}

if ($Registrar) {
    $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
        '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath)
    $cada5 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $alEntrar = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $ajustes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
    Register-ScheduledTask -TaskName $tarea -Action $accion -Trigger @($cada5, $alEntrar) `
        -Settings $ajustes -Description 'Revisa cada 5 minutos que Azure llegue a la IA de CONVI y la repara' -Force | Out-Null
    Write-Host "Listo: la tarea «$tarea» revisa la IA cada 5 minutos y al iniciar sesión." -ForegroundColor Green
    Write-Host 'Para ver qué ha pasado: .\scripts\vigilar-ia.ps1 -Registro'
    exit 0
}

function Estado([string]$url, [string]$metodo = 'GET') {
    try {
        return (Invoke-WebRequest -UseBasicParsing -Uri $url -Method $metodo -TimeoutSec 8).StatusCode
    } catch {
        if ($_.Exception.Response) { return [int]$_.Exception.Response.StatusCode }
        return 0
    }
}

$tailscale = 'C:\Program Files\Tailscale\tailscale.exe'
if (-not (Test-Path $tailscale)) { $tailscale = (Get-Command tailscale -ErrorAction SilentlyContinue).Source }
$curl = Join-Path $env:SystemRoot 'System32\curl.exe'

# Prueba desde afuera: IP pública por DNS externo y conexión segura con el nombre real.
function Probar-Publico([string]$nombre) {
    $respuesta = & $curl -s --max-time 10 "https://dns.google/resolve?name=$nombre&type=A" 2>$null
    if (-not $respuesta) { return 'sin-internet' }
    $ip = (($respuesta | Out-String | ConvertFrom-Json).Answer |
        Where-Object { $_.type -eq 1 } | Select-Object -First 1).data
    if (-not $ip) { return 'sin-dns' }
    $codigo = & $curl -s -o NUL -w '%{http_code}' --max-time 20 --resolve "${nombre}:443:$ip" "https://$nombre/salud" 2>$null
    return "$codigo"
}

function Guardar-Estado([string]$estado) {
    $anterior = if (Test-Path $archivoEstado) { (Get-Content $archivoEstado -Raw).Trim() } else { '' }
    if (-not $Probar) { Set-Content -Path $archivoEstado -Value $estado -Encoding ASCII }
    return $anterior
}

# 1) convi-ia y Ollama en el PC.
$local = (Estado "http://127.0.0.1:$puerto/salud") -eq 200 -and
    (Estado "http://127.0.0.1:$puerto/api/embed" 'POST') -eq 401
if (-not $local) {
    if ($Probar) { Anotar 'convi-ia no responde en el PC (o corre sin token): sin -Probar lo levantaría con iniciar-ia.ps1'; exit 1 }
    Anotar 'convi-ia no respondía en el PC, lo levanto con iniciar-ia.ps1'
    $proceso = Start-Process powershell.exe -Wait -PassThru -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$iniciar`"", '-SinPausa')
    if ($proceso.ExitCode -ne 0) {
        Anotar "iniciar-ia.ps1 terminó con error $($proceso.ExitCode), revisa Ollama, el token en .env y Tailscale"
        Guardar-Estado 'falla' | Out-Null
        exit 1
    }
    Anotar 'convi-ia quedó levantado'
}

# 2) Tailscale con sesión y nombre público.
if (-not $tailscale) { Anotar 'No encontré Tailscale'; exit 1 }
$estadoTs = & $tailscale status --json 2>$null | Out-String | ConvertFrom-Json
if (-not $estadoTs -or $estadoTs.BackendState -ne 'Running') {
    Anotar 'Tailscale no tiene la sesión iniciada: ábrelo e inicia sesión, el vigilante no puede hacerlo'
    Guardar-Estado 'falla' | Out-Null
    exit 1
}
$nombre = $estadoTs.Self.DNSName.TrimEnd('.')

# 3) Prueba desde afuera y arreglo.
$resultado = Probar-Publico $nombre
if ($resultado -eq 'sin-internet') {
    # Sin internet no hay nada que arreglar en el túnel.
    if ((Guardar-Estado 'sin-internet') -ne 'sin-internet') { Anotar 'El PC no tiene internet, Azure no puede llegar a la IA' }
    exit 1
}
if ($resultado -eq '200') {
    $anterior = Guardar-Estado 'ok'
    if ($Probar) { Anotar "Todo bien: https://$nombre responde desde internet (200)" }
    elseif ($anterior -and $anterior -ne 'ok') { Anotar 'Volvió a responder desde internet' }
    exit 0
}

if ($Probar) { Anotar "Desde internet no responde (resultado: $resultado), sin -Probar reiniciaría Funnel"; exit 1 }
Anotar "Desde internet no responde (resultado: $resultado), reinicio Tailscale Funnel"
& $tailscale funnel reset 2>&1 | Out-Null
Start-Sleep -Seconds 2
& $tailscale funnel --bg $puerto 2>&1 | Out-Null
$limite = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 10
    $resultado = Probar-Publico $nombre
} while ($resultado -ne '200' -and (Get-Date) -lt $limite)
if ($resultado -eq '200') {
    Guardar-Estado 'ok' | Out-Null
    Anotar 'Arreglado: después de reiniciar Funnel responde desde internet (200)'
    exit 0
}
Guardar-Estado 'falla' | Out-Null
Anotar "Sigue sin responder después de reiniciar Funnel (resultado: $resultado), volveré a intentar en 5 minutos"
exit 1
