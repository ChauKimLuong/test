$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCommand) { $dockerCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe' }
if (!(Test-Path -LiteralPath $dockerExe)) { throw 'Docker Desktop CLI not found.' }
& $dockerExe compose stop
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the application.' }
Write-Host 'FlowPilot stopped. PostgreSQL data is preserved.'
