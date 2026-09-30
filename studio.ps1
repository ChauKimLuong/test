$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$config = @{}
if (Test-Path -LiteralPath '.env') {
    Get-Content -LiteralPath '.env' | ForEach-Object {
        if ($_ -match '^([A-Z_]+)=(.*)$') { $config[$matches[1]] = $matches[2] }
    }
}
$dbUser = if ($config.POSTGRES_USER) { $config.POSTGRES_USER } else { 'flowpilot' }
$dbPassword = if ($config.POSTGRES_PASSWORD) { $config.POSTGRES_PASSWORD } else { 'flowpilot_local_change_me' }
$dbName = if ($config.POSTGRES_DB) { $config.POSTGRES_DB } else { 'flowpilot' }
$dbPort = if ($config.DB_PORT) { $config.DB_PORT } else { '5433' }
$env:DATABASE_URL = 'postgres://' + [uri]::EscapeDataString($dbUser) + ':' + [uri]::EscapeDataString($dbPassword) + '@localhost:' + $dbPort + '/' + [uri]::EscapeDataString($dbName)
$env:NODE_OPTIONS = '--dns-result-order=ipv4first'
Set-Location -LiteralPath (Join-Path $PSScriptRoot 'backend')
npm run prisma:studio
