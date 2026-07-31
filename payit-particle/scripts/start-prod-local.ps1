<#
Start-prod-local.ps1

Usage: run this from the `payit-particle/payit-particle` folder.
It will attempt to start a public tunnel using `npx localtunnel` and then
launch the server with `NODE_ENV=production` and TELEGRAM webhook configured.

Requirements: Node.js, npx, and internet access. If `localtunnel` isn't
installed, npx will fetch it.
#>

param(
  [string]$Subdomain = ''  # optional subdomain for localtunnel
)

function Start-Tunnel {
  Write-Host "Starting localtunnel on port 3000..."
  $args = @('--port', '3000')
  if ($Subdomain -ne '') { $args += @('--subdomain', $Subdomain) }
  $proc = Start-Process -FilePath 'npx' -ArgumentList @('localtunnel', $args) -NoNewWindow -PassThru -RedirectStandardOutput pipe -RedirectStandardError pipe
  Start-Sleep -Seconds 2
  return $proc
}

Write-Host "Ensure you are in the backend folder: $(Get-Location)"

# Load production env template into .env if not present
if (-not (Test-Path .env)) {
  if (Test-Path .env.production) {
    Copy-Item .env.production .env
    Write-Host "Copied .env.production -> .env (please edit .env to add real secrets)."
  } else {
    Write-Host "No .env or .env.production found. Please create a .env file from the template."
  }
}

Write-Host "You can optionally provide a subdomain: .\start-prod-local.ps1 -Subdomain mysub"

Write-Host "Opening tunnel (this will print the public URL). Press Ctrl+C to cancel."
$proc = Start-Tunnel -Subdomain $Subdomain

if ($proc -eq $null) {
  Write-Host "Failed to start localtunnel. Please run: npx localtunnel --port 3000"
  exit 1
}

Write-Host "Tunnel process started. Now launching server (production mode)."

# Ensure KEY_ENCRYPTION_SECRET exists
if (-not $env:KEY_ENCRYPTION_SECRET) { $env:KEY_ENCRYPTION_SECRET = Read-Host -Prompt 'Enter KEY_ENCRYPTION_SECRET (dev/test secret)'; }
$env:NODE_ENV = 'production'

node src/server.js
