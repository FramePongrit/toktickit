param(
  [switch]$Screenshots,
  [switch]$Legacy,
  [switch]$AdminLastActiveOnly,
  [switch]$ReuseExistingApi,
  [string]$ScreenshotRoot,
  [int]$ApiPort = 3000,
  [int]$ClientPort = 5173
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $repoRoot "server"
$clientRoot = Join-Path $repoRoot "client"
$serverProcess = $null
$clientProcess = $null
$exitCode = 1
$originalScreenshotRoot = $env:PW_SCREENSHOT_ROOT

function Assert-PortFree([int]$Port) {
  $listener = netstat -ano | Select-String (":$Port\s+.*LISTENING")
  if ($listener) {
    throw "Port $Port is already in use; refusing to stop an unrelated process."
  }
}

function Wait-ForUrl([string]$Url) {
  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return }
    } catch { }
    Start-Sleep -Milliseconds 250
  }
  throw "Timed out waiting for $Url"
}

try {
  if (-not $ReuseExistingApi) {
    Assert-PortFree $ApiPort
  }
  Assert-PortFree $ClientPort

  $env:NODE_ENV = "local"
  $env:PORT = [string]$ApiPort
  $env:JWT_SECRET = "local-e2e-only-jwt-secret-change-me-32chars"
  $env:CLIENT_ORIGIN = "http://localhost:$ClientPort"
  $env:PW_API_URL = "http://localhost:$ApiPort"
  $env:PW_CLIENT_URL = "http://localhost:$ClientPort"
  $env:VITE_API_URL = "http://localhost:$ApiPort"
  $env:COOKIE_SECURE = "false"
  $env:PW_REUSE_SERVER = "true"

  if ($Screenshots) {
    if (-not $ScreenshotRoot) {
      $ScreenshotRoot = Join-Path $repoRoot ("test-results\issue61-screenshots-" + [guid]::NewGuid().ToString("N"))
    }
    New-Item -ItemType Directory -Path $ScreenshotRoot -Force | Out-Null
    $env:PW_SCREENSHOT_ROOT = $ScreenshotRoot
    Write-Host "Screenshot output: $ScreenshotRoot"
  }

  if (-not $ReuseExistingApi) {
    $serverProcess = Start-Process node -ArgumentList @("--import", "tsx/esm", "src/index.ts") -WorkingDirectory $serverRoot -WindowStyle Hidden -PassThru
  }
  $clientProcess = Start-Process node -ArgumentList @("node_modules/vite/bin/vite.js", "--host", "localhost", "--port", [string]$ClientPort) -WorkingDirectory $clientRoot -WindowStyle Hidden -PassThru
  Wait-ForUrl "http://localhost:$ApiPort/api/health"
  Wait-ForUrl "http://localhost:$ClientPort/"

  if ($Screenshots) {
    & npx playwright test e2e/lab-03/capture.screens.ts --project=screenshots
  } elseif ($Legacy) {
    & npx playwright test e2e/lab-03/legacy-regression.spec.ts --project=e2e
  } elseif ($AdminLastActiveOnly) {
    & npx playwright test e2e/lab-03/user-administration.spec.ts --project=e2e --grep "LAST_ACTIVE_ADMINISTRATOR"
  } else {
    & npx playwright test e2e/lab-03/authentication.spec.ts e2e/lab-03/staff-ticket-flow.spec.ts e2e/lab-03/user-administration.spec.ts --project=e2e
  }
  $exitCode = $LASTEXITCODE
} finally {
  if ($clientProcess -and -not $clientProcess.HasExited) { Stop-Process -Id $clientProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($serverProcess -and -not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
  if ($null -eq $originalScreenshotRoot) { Remove-Item Env:PW_SCREENSHOT_ROOT -ErrorAction SilentlyContinue } else { $env:PW_SCREENSHOT_ROOT = $originalScreenshotRoot }
}

exit $exitCode
