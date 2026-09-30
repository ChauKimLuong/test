param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCommand) { $dockerCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
if (!(Test-Path -LiteralPath $dockerExe)) { throw 'Please install Docker Desktop and enable Linux containers.' }
& $dockerExe info --format '{{.ServerVersion}}' 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    & $dockerExe desktop start
    if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop could not start.' }
}
if (!(Test-Path -LiteralPath '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
if ($NoBuild) { & $dockerExe compose up -d --wait } else { & $dockerExe compose up -d --build --wait }
if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Run docker compose logs to inspect the error.' }
Write-Host 'FlowPilot is ready. Default URL: http://localhost:3000'
Write-Host 'Demo accounts and instructions: README.md'
