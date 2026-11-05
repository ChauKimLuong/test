param([switch]$NoBuild, [switch]$DatabaseOnly)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCommand) { $dockerCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
if (!(Test-Path -LiteralPath $dockerExe)) { throw 'Please install Docker Desktop and enable Linux containers.' }
function Test-DockerReady {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $dockerExe info --format '{{.ServerVersion}}' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally { $ErrorActionPreference = $previousPreference }
}
if (!(Test-DockerReady)) {
    & $dockerExe desktop start
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop could not start.' }
}
$dockerReady = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if (Test-DockerReady) { $dockerReady = $true; break }
    Start-Sleep -Seconds 2
}
if (!$dockerReady) { throw 'Docker Desktop is not ready after 120 seconds. Check Docker Desktop, then retry start.ps1.' }
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if ($DatabaseOnly) {
    & $dockerExe compose stop web api
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the Docker web/api services for local development.' }
    & $dockerExe compose up -d --wait db
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL startup failed. Inspect docker compose logs db.' }
    Write-Host 'PostgreSQL is ready. Docker web/api are stopped; database data is preserved.'
    Write-Host 'Backend terminal: cd backend; npm run dev'
    Write-Host 'Frontend terminal: cd frontend; npm run dev'
    exit 0
}
if ($NoBuild) { & $dockerExe compose up -d --wait } else { & $dockerExe compose up -d --build --wait }
if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Run docker compose logs to inspect the error.' }
Write-Host 'FlowPilot is ready. Default URL: http://localhost:3000'
Write-Host 'Demo accounts and instructions: README.md'
