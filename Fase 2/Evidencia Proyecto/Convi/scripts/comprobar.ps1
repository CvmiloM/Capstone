$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    & docker compose ps
    if ($LASTEXITCODE -ne 0) { throw 'docker compose ps fallo.' }
    foreach ($entry in @(
        @{ Name='Frontend'; Url='http://127.0.0.1:3000' },
        @{ Name='API'; Url='http://127.0.0.1:3001' },
        @{ Name='Supabase API'; Url='http://127.0.0.1:54321/auth/v1/health' },
        @{ Name='Studio'; Url='http://127.0.0.1:54323' }
    )) {
        try {
            $response = Invoke-WebRequest -Uri $entry.Url -UseBasicParsing -TimeoutSec 8
            Write-Host ("OK: {0} (HTTP {1})" -f $entry.Name, [int]$response.StatusCode)
        } catch {
            Write-Warning ("REVISAR: {0} ({1})" -f $entry.Name, $_.Exception.Message)
        }
    }
    Write-Host 'No compartas capturas de supabase status: pueden incluir claves locales.'
} finally {
    Pop-Location
}
