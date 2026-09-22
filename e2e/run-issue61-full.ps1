param(
  [switch]$ReuseExistingApi,
  [switch]$AdminLastActiveOnly,
  [int]$ApiPort = 3000,
  [int]$ClientPort = 5173
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $repoRoot "server"
$schema = $null
$e2eSchema = $null
$originalDatabaseUrl = $env:DATABASE_URL
$baseDatabaseUrl = $originalDatabaseUrl
$serverEnvPath = Join-Path $serverRoot ".env"
$results = [System.Collections.Generic.List[object]]::new()
$lastStepStdout = ""

function Stop-HarnessProcessTree([int]$ProcessId) {
  if ($ProcessId -gt 0) {
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
  }
}

function Write-SanitizedOutput([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  $output = Get-Content $Path -Raw -ErrorAction SilentlyContinue
  if (-not $output) { return }
  $output = $output -replace 'postgres(?:ql)?://[^\s@]+@', 'postgresql://[redacted]@'
  $output = $output -replace '(?i)(password\s*[=:]\s*)\S+', '$1[redacted]'
  Write-Host $output.TrimEnd()
}

function Invoke-VerificationStep(
  [string]$Name,
  [string]$FilePath,
  [string[]]$ArgumentList,
  [string]$WorkingDirectory,
  [int]$TimeoutSeconds = 300
) {
  Write-Host "`n=== $Name ==="
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $exitCode = 0
  $stdoutPath = $null
  $stderrPath = $null
  $process = $null
  $wrapperPath = $null
  $script:lastStepStdout = ""
  try {
    $stdoutPath = (New-TemporaryFile).FullName
    $stderrPath = (New-TemporaryFile).FullName
    $wrapperPath = Join-Path ([System.IO.Path]::GetTempPath()) ("issue61-wrapper-" + [guid]::NewGuid().ToString("N") + ".ps1")
    $escapedFilePath = $FilePath.Replace("'", "''")
    $argumentExpression = "@(" + (($ArgumentList | ForEach-Object { "'" + $_.Replace("'", "''") + "'" }) -join ",") + ")"
    $wrapper = @"
`$ErrorActionPreference = "Continue"
& '$escapedFilePath' $argumentExpression
`$childExitCode = if (`$null -eq `$LASTEXITCODE) { 0 } else { [int]`$LASTEXITCODE }
Write-Output "__ISSUE61_EXIT_CODE__=`$childExitCode"
exit `$childExitCode
"@
    Set-Content -LiteralPath $wrapperPath -Value $wrapper -Encoding UTF8
    $wrapperArgumentList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $wrapperPath + '"'))
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $wrapperArgumentList -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      Write-Host "TIMEOUT: $Name exceeded ${TimeoutSeconds}s; stopping only PID $($process.Id) and its descendants."
      Stop-HarnessProcessTree $process.Id
      $exitCode = 124
    } else {
      $process.Refresh()
      $process.WaitForExit()
      if (-not $process.HasExited) { throw "Process state was not exited after WaitForExit for $Name." }
      $script:lastStepStdout = Get-Content $stdoutPath -Raw -ErrorAction SilentlyContinue
      $exitMarker = [regex]::Match($script:lastStepStdout, "__ISSUE61_EXIT_CODE__=(-?\d+)")
      if (-not $exitMarker.Success) { throw "Bounded process did not report an exit code for $Name." }
      $exitCode = [int]$exitMarker.Groups[1].Value
    }
    if (-not $script:lastStepStdout) { $script:lastStepStdout = Get-Content $stdoutPath -Raw -ErrorAction SilentlyContinue }
    Write-SanitizedOutput $stdoutPath
    Write-SanitizedOutput $stderrPath
  } catch {
    Write-Host $_.Exception.Message
    $exitCode = 1
  } finally {
    if ($process -and -not $process.HasExited) { Stop-HarnessProcessTree $process.Id }
    if ($stdoutPath) { Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue }
    if ($stderrPath) { Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue }
    if ($wrapperPath) { Remove-Item -LiteralPath $wrapperPath -Force -ErrorAction SilentlyContinue }
    $stopwatch.Stop()
  }
  $results.Add([pscustomobject]@{ Name = $Name; ExitCode = $exitCode; Seconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 1) })
  if ($exitCode -ne 0) { Write-Host "FAILED: $Name (exit $exitCode)" } else { Write-Host "PASSED: $Name" }
}

try {
  if (-not $baseDatabaseUrl -and (Test-Path $serverEnvPath)) {
    $databaseLine = Get-Content $serverEnvPath | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
    if ($databaseLine) { $baseDatabaseUrl = ($databaseLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'") }
  }
  if (-not $baseDatabaseUrl) { throw "DATABASE_URL is required for isolated verification." }
  if ($ReuseExistingApi) { throw "Full Issue #61 verification requires an API started against its isolated E2E schema; do not use -ReuseExistingApi." }

  $tsxCommand = Join-Path $serverRoot "node_modules\.bin\tsx.cmd"
  $prismaCommand = Join-Path $serverRoot "node_modules\.bin\prisma.cmd"
  $npmCommand = "npm.cmd"
  $powershellCommand = "powershell.exe"

  Invoke-VerificationStep "Create task-owned isolated schema" $tsxCommand @("tests/support/issue61-isolated-schema.ts", "create") $serverRoot 30
  $schema = ($script:lastStepStdout -split "`r?`n" | Where-Object { $_ -match '^issue61_verify_[a-f0-9]{24}$' } | Select-Object -Last 1)
  if (-not $schema) { throw "Schema creation did not return an isolated schema name." }

  $isolatedUrl = [System.UriBuilder]$baseDatabaseUrl
  $queryParts = @($isolatedUrl.Query.TrimStart("?").Split("&") | Where-Object { $_ -and ($_ -notmatch '^schema=') })
  $isolatedUrl.Query = (($queryParts + "schema=$schema") -join "&")
  $isolatedDatabaseUrl = $isolatedUrl.Uri.AbsoluteUri

  $env:DATABASE_URL = $isolatedDatabaseUrl
  Invoke-VerificationStep "Deploy migrations to isolated schema" $prismaCommand @("migrate", "deploy", "--schema", "prisma/schema.prisma") $serverRoot 120
  Invoke-VerificationStep "Seed isolated Lab 3 schema" $npmCommand @("run", "prisma:seed") $serverRoot 120
  if (-not $AdminLastActiveOnly) {
    Invoke-VerificationStep "Server suite on isolated schema" $npmCommand @("test") $serverRoot 600
    Invoke-VerificationStep "Client suite" $npmCommand @("test") (Join-Path $repoRoot "client") 300
    $env:DATABASE_URL = $baseDatabaseUrl
    Invoke-VerificationStep "Fresh/upgraded Lab 2 migration regression" $npmCommand @("run", "test:migration") $serverRoot 300
  }

  Invoke-VerificationStep "Create task-owned isolated E2E schema" $tsxCommand @("tests/support/issue61-isolated-schema.ts", "create") $serverRoot 30
  $e2eSchema = ($script:lastStepStdout -split "`r?`n" | Where-Object { $_ -match '^issue61_verify_[a-f0-9]{24}$' } | Select-Object -Last 1)
  if (-not $e2eSchema) { throw "E2E schema creation did not return an isolated schema name." }
  $e2eUrl = [System.UriBuilder]$baseDatabaseUrl
  $e2eQueryParts = @($e2eUrl.Query.TrimStart("?").Split("&") | Where-Object { $_ -and ($_ -notmatch '^schema=') })
  $e2eUrl.Query = (($e2eQueryParts + "schema=$e2eSchema") -join "&")
  $e2eDatabaseUrl = $e2eUrl.Uri.AbsoluteUri
  $env:DATABASE_URL = $e2eDatabaseUrl
  Invoke-VerificationStep "Deploy migrations to isolated E2E schema" $prismaCommand @("migrate", "deploy", "--schema", "prisma/schema.prisma") $serverRoot 120
  Invoke-VerificationStep "Prepare isolated E2E reference data" $tsxCommand @("tests/support/issue61-e2e-reference.ts") $serverRoot 30

  # The browser suites create and clean task-owned fixtures. Point their API
  # and direct Prisma fixture helper at the same disposable schema so the
  # user's public schema is never used by E2E.
  $runner = Join-Path $repoRoot "e2e/run-issue61.ps1"
  $e2eBaseArgs = @("-ExecutionPolicy", "Bypass", "-File", ('"' + $runner + '"'), "-ApiPort", [string]$ApiPort, "-ClientPort", [string]$ClientPort)
  if ($ReuseExistingApi) { $e2eBaseArgs += "-ReuseExistingApi" }
  if ($AdminLastActiveOnly) {
    Invoke-VerificationStep "Targeted isolated Admin last-active browser E2E" $powershellCommand ($e2eBaseArgs + "-AdminLastActiveOnly") $repoRoot 180
  } else {
    Invoke-VerificationStep "Expanded Lab 3 authenticated E2E" $powershellCommand $e2eBaseArgs $repoRoot 180
    Invoke-VerificationStep "Legacy authenticated E2E regression" $powershellCommand ($e2eBaseArgs + "-Legacy") $repoRoot 120
    Invoke-VerificationStep "Lab 3 screenshot evidence" $powershellCommand ($e2eBaseArgs + "-Screenshots") $repoRoot 180
  }
} finally {
  if ($e2eSchema) {
    $env:DATABASE_URL = $baseDatabaseUrl
    Invoke-VerificationStep "Cleanup task-owned isolated E2E schema" $tsxCommand @("tests/support/issue61-isolated-schema.ts", "drop", $e2eSchema) $serverRoot 30
  }
  if ($schema) {
    $env:DATABASE_URL = $baseDatabaseUrl
    Invoke-VerificationStep "Cleanup task-owned isolated schema" $tsxCommand @("tests/support/issue61-isolated-schema.ts", "drop", $schema) $serverRoot 30
  }
  if ($null -eq $originalDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $originalDatabaseUrl }
}

Write-Host "`n=== Issue #61 bounded verification summary ==="
$results | Format-Table -AutoSize
$failed = @($results | Where-Object { $_.ExitCode -ne 0 }).Count
if ($failed -gt 0) { exit 1 }
exit 0
