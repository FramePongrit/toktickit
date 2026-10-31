param(
  [int]$ApiPort = 3001,
  [int]$ClientPort = 5174,
  [string]$ScreenshotRoot
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$serverRoot = Join-Path $repoRoot "server"
$runId = [guid]::NewGuid().ToString("N")
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "test-results\lab-04\run-$runId"))
$uploadRoot = Join-Path $taskRoot "uploads"
$evidenceRoot = Join-Path $repoRoot "artifacts\lab-04\verification\issue91"
$evidenceRunRoot = Join-Path $evidenceRoot "run-$runId"
$containerName = "toktickit-lab4-issue85-test"
$ownedSchemas = [System.Collections.Generic.List[string]]::new()
$results = [System.Collections.Generic.List[object]]::new()
$script:lastStepStdout = ""
$fatalMessage = $null
$portsConfirmedFree = $false
$uploadCleanupStatus = "not verified"

$environmentNames = @(
  "DATABASE_URL", "UPLOAD_DIR", "PW_API_URL", "PW_CLIENT_URL", "PW_CLIENT_PORT",
  "PW_SCREENSHOT_ROOT", "PW_OUTPUT_DIR", "PW_HTML_REPORT_DIR", "PW_RUN_ISSUE90_E2E",
  "PW_REUSE_SERVER", "LAB4_PG_CONTAINER"
)
$originalEnvironment = @{}
foreach ($name in $environmentNames) {
  $originalEnvironment[$name] = [System.Environment]::GetEnvironmentVariable($name, "Process")
}

function Get-BaseDatabaseUrl([string]$Value) {
  try { $url = [System.UriBuilder]$Value } catch { throw "An explicit PostgreSQL DATABASE_URL is required." }
  if ($url.Scheme -notin @("postgresql", "postgres") -or $url.Host -ne "127.0.0.1" -or $url.Port -ne 55434 -or $url.Path.TrimStart("/") -ne "lab4test" -or
    $url.UserName -ne "lab4test" -or $url.Password -ne "lab4test") {
    throw "Issue 91 accepts only the dedicated 127.0.0.1:55434/lab4test database. No other database was contacted."
  }
  $query = @($url.Query.TrimStart("?").Split("&") | Where-Object { $_ -and ($_ -notmatch '^schema=') })
  $url.Query = ($query -join "&")
  return $url.Uri.AbsoluteUri.TrimEnd("?")
}

function New-SchemaDatabaseUrl([string]$BaseUrl, [string]$Schema) {
  if ($Schema -notmatch '^(issue91_verify_[a-f0-9]{24}|lab4_issue91_perf_[a-f0-9]{12})$') {
    throw "Refusing a non-task-owned schema name."
  }
  $url = [System.UriBuilder]$BaseUrl
  $query = @($url.Query.TrimStart("?").Split("&") | Where-Object { $_ -and ($_ -notmatch '^schema=') })
  $url.Query = (($query + "schema=$Schema") -join "&")
  return $url.Uri.AbsoluteUri
}

function Assert-PortAvailable([int]$Port) {
  if ($Port -lt 1 -or $Port -gt 65535) { throw "Requested port must be between 1 and 65535; received $Port." }
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try { $listener.Start() } catch { throw "Requested localhost port $Port is already owned; refusing to reuse or stop another process." }
  finally { $listener.Stop() }
}

function Resolve-ScreenshotRoot([string]$RequestedRoot) {
  if (-not $RequestedRoot) {
    return Join-Path $taskRoot "screenshots"
  }
  $candidate = if ([System.IO.Path]::IsPathRooted($RequestedRoot)) { $RequestedRoot } else { Join-Path $repoRoot $RequestedRoot }
  $resolved = [System.IO.Path]::GetFullPath($candidate)
  $curated = [System.IO.Path]::GetFullPath((Join-Path $repoRoot "artifacts\lab-04\screenshots"))
  if (-not $resolved.Equals($curated, [System.StringComparison]::OrdinalIgnoreCase) -and
      -not $resolved.StartsWith($curated + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "ScreenshotRoot must be inside artifacts/lab-04/screenshots; the default remains ignored under test-results."
  }
  return $resolved
}

function Stop-TaskProcessTree([int]$ProcessId) {
  if ($ProcessId -gt 0) { & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null }
}

function Sanitize-Log([string]$Text) {
  return $Text
    -replace 'postgres(?:ql)?://[^\s@]+@', 'postgresql://[redacted]@'
    -replace '(?i)(password|csrf.?token|session.?cookie|authorization|set-cookie)\s*[=:]\s*[^\s,;]+', '$1=[redacted]'
}

function Invoke-VerificationStep(
  [string]$Name,
  [string]$CommandText,
  [string]$CommandBody,
  [string]$WorkingDirectory,
  [int]$TimeoutSeconds = 300
) {
  Write-Host "`n=== $Name ==="
  $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $wrapperPath = Join-Path ([System.IO.Path]::GetTempPath()) ("issue91-step-" + [guid]::NewGuid().ToString("N") + ".ps1")
  $escapedDirectory = $WorkingDirectory.Replace("'", "''")
  $wrapper = @"
`$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath '$escapedDirectory'
try {
$CommandBody
  `$childExitCode = if (`$null -eq `$LASTEXITCODE) { 0 } else { [int]`$LASTEXITCODE }
} catch {
  Write-Error `$_.Exception.Message
  `$childExitCode = 1
}
Write-Output "__ISSUE91_EXIT_CODE__=`$childExitCode"
exit `$childExitCode
"@
  Set-Content -LiteralPath $wrapperPath -Value $wrapper -Encoding UTF8
  $process = $null
  $processStarted = $false
  $stdoutTask = $null
  $stderrTask = $null
  $exitCode = 1
  $stdout = ""
  $stderr = ""
  $timedOut = $false
  try {
    $arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$wrapperPath`""
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = "powershell.exe"
    $startInfo.Arguments = $arguments
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw "Could not start the bounded verification child process." }
    $processStarted = $true
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      $timedOut = $true
      Stop-TaskProcessTree $process.Id
      if (-not $process.WaitForExit(5000)) {
        Stop-TaskProcessTree $process.Id
        $process.WaitForExit(5000) | Out-Null
      }
    }
    if ($timedOut) {
      $exitCode = 124
      if ($stdoutTask.Wait(2000)) { $stdout = $stdoutTask.GetAwaiter().GetResult() }
      else { $stdout = "[partial output unavailable: child process did not close stdout after termination]" }
      if ($stderrTask.Wait(2000)) { $stderr = $stderrTask.GetAwaiter().GetResult() }
      else { $stderr = "[partial error output unavailable: child process did not close stderr after termination]" }
      $stderr += "`nTimed out after ${TimeoutSeconds}s; stopped only this verification step and its descendants."
    } else {
      $process.WaitForExit()
      if (-not $stdoutTask.Wait(5000) -or -not $stderrTask.Wait(5000)) {
        throw "The bounded verification child exited but its output pipes remained open."
      }
      $stdout = $stdoutTask.GetAwaiter().GetResult()
      $stderr = $stderrTask.GetAwaiter().GetResult()
      $exitCode = $process.ExitCode
      $marker = [regex]::Match($stdout, '__ISSUE91_EXIT_CODE__=(-?\d+)')
      if ($marker.Success) { $exitCode = [int]$marker.Groups[1].Value }
      else { $exitCode = 1; $stderr += "`nThe bounded child did not report its exit code." }
    }
  } catch {
    $stderr += "`n$($_.Exception.Message)"
    $exitCode = 1
  } finally {
    if ($process) {
      if ($processStarted) {
      if (-not $process.HasExited) {
        Stop-TaskProcessTree $process.Id
        $process.Refresh()
        $process.WaitForExit(5000) | Out-Null
      }
      }
      $process.Dispose()
    }
    $stopwatch.Stop()
  }

  $stdout = $stdout -replace '__ISSUE91_EXIT_CODE__=-?\d+\s*', ''
  $safeStdout = Sanitize-Log $stdout
  $safeStderr = Sanitize-Log $stderr
  if ($safeStdout) { Write-Host $safeStdout.TrimEnd() }
  if ($safeStderr) { Write-Host $safeStderr.TrimEnd() }
  $logPath = Join-Path $evidenceRunRoot (($Name -replace '[^A-Za-z0-9.-]+', '-') + ".txt")
  $gitSha = (& git.exe -C $repoRoot rev-parse HEAD 2>$null | Select-Object -First 1)
  $dirtyCount = @(& git.exe -C $repoRoot status --porcelain 2>$null).Count
  $logText = @(
    "Command: $CommandText",
    "Local time: $([DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))",
    "Source HEAD: $gitSha; worktree dirty entries: $dirtyCount",
  "Target: disposable localhost PostgreSQL 16 lab4test; schema labels are recorded per step; no connection URL/password is recorded.",
    "Elapsed seconds: $([math]::Round($stopwatch.Elapsed.TotalSeconds, 2))",
    "Exit code: $exitCode",
    "",
    "--- stdout ---",
    $safeStdout,
    "--- stderr ---",
    $safeStderr
  ) -join "`n"
  Set-Content -LiteralPath $logPath -Value $logText -Encoding UTF8
  if (Test-Path -LiteralPath $wrapperPath) { Remove-Item -LiteralPath $wrapperPath -Force }
  $results.Add([pscustomobject]@{ Name = $Name; ExitCode = $exitCode; Seconds = [math]::Round($stopwatch.Elapsed.TotalSeconds, 2); Log = $logPath })
  $script:lastStepStdout = $stdout
  if ($exitCode -ne 0) { throw "$Name failed with exit code $exitCode. See $logPath." }
}

function Get-SchemaFromLastOutput([string]$Pattern) {
  $found = @($script:lastStepStdout -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match $Pattern } | Select-Object -Last 1)
  if ($found.Count -ne 1) { throw "Isolated schema creation did not return exactly one owned schema name." }
  return $found[0]
}

try {
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $evidenceRunRoot | Out-Null
  if (Test-Path -LiteralPath $taskRoot) { throw "Task run path unexpectedly exists; refusing reuse: $taskRoot" }
  New-Item -ItemType Directory -Path $taskRoot | Out-Null
  New-Item -ItemType Directory -Path $uploadRoot | Out-Null
  $baseDatabaseUrl = Get-BaseDatabaseUrl $env:DATABASE_URL
  if ($env:LAB4_PG_CONTAINER -ne $containerName) { throw "LAB4_PG_CONTAINER must name the already-running dedicated $containerName container." }
  Assert-PortAvailable $ApiPort
  Assert-PortAvailable $ClientPort
  if ($ApiPort -eq $ClientPort) { throw "API and client ports must differ." }
  $portsConfirmedFree = $true
  $resolvedScreenshotRoot = Resolve-ScreenshotRoot $ScreenshotRoot
  New-Item -ItemType Directory -Path $resolvedScreenshotRoot -Force | Out-Null
  $env:UPLOAD_DIR = $uploadRoot

  $env:DATABASE_URL = $baseDatabaseUrl
  Invoke-VerificationStep "postgres-readiness" "docker exec $containerName pg_isready --username lab4test --dbname lab4test" "docker.exe exec $containerName pg_isready --username lab4test --dbname lab4test" $repoRoot 30

  Invoke-VerificationStep "server-schema-create" "node --import tsx/esm tests/support/issue91-isolated-schema.ts create" "node.exe --import tsx/esm tests/support/issue91-isolated-schema.ts create" $serverRoot 30
  $serverSchema = Get-SchemaFromLastOutput '^issue91_verify_[a-f0-9]{24}$'
  $ownedSchemas.Add($serverSchema)
  $serverDatabaseUrl = New-SchemaDatabaseUrl $baseDatabaseUrl $serverSchema
  $env:DATABASE_URL = $serverDatabaseUrl
  Invoke-VerificationStep "prisma-validate" "npm exec prisma -- validate --schema prisma/schema.prisma" "npm.cmd exec prisma -- validate --schema prisma/schema.prisma" $serverRoot 120
  Invoke-VerificationStep "prisma-generate" "npm exec prisma -- generate --schema prisma/schema.prisma" "npm.cmd exec prisma -- generate --schema prisma/schema.prisma" $serverRoot 120
  Invoke-VerificationStep "server-migrate-deploy" "npm exec prisma -- migrate deploy --schema prisma/schema.prisma (schema $serverSchema)" "npm.cmd exec prisma -- migrate deploy --schema prisma/schema.prisma" $serverRoot 180
  Invoke-VerificationStep "server-tests" "npm --prefix server test (schema $serverSchema)" "npm.cmd --prefix server test" $repoRoot 1200
  Invoke-VerificationStep "server-security" "npm --prefix server run test:security (schema $serverSchema)" "npm.cmd --prefix server run test:security" $repoRoot 600
  Invoke-VerificationStep "server-build" "npm --prefix server run build" "npm.cmd --prefix server run build" $repoRoot 300

  $env:DATABASE_URL = $baseDatabaseUrl
  Invoke-VerificationStep "server-migrations-recovery" "npm --prefix server run test:migration (isolated schemas/databases in lab4test)" "npm.cmd --prefix server run test:migration" $repoRoot 900

  Invoke-VerificationStep "windows-runbook-tests" "npm --prefix server run test:runbook" "npm.cmd --prefix server run test:runbook" $repoRoot 300
  Invoke-VerificationStep "client-tests" "npm --prefix client test" "npm.cmd --prefix client test" $repoRoot 900
  Invoke-VerificationStep "client-build" "npm --prefix client run build" "npm.cmd --prefix client run build" $repoRoot 600

  Invoke-VerificationStep "performance-schema-create" "node --import tsx/esm tests/support/issue91-isolated-schema.ts create-perf" "node.exe --import tsx/esm tests/support/issue91-isolated-schema.ts create-perf" $serverRoot 30
  $performanceSchema = Get-SchemaFromLastOutput '^lab4_issue91_perf_[a-f0-9]{12}$'
  $ownedSchemas.Add($performanceSchema)
  $performanceUrl = New-SchemaDatabaseUrl $baseDatabaseUrl $performanceSchema
  $env:DATABASE_URL = $performanceUrl
  Invoke-VerificationStep "performance-migrate-deploy" "npm exec prisma -- migrate deploy --schema prisma/schema.prisma (schema $performanceSchema)" "npm.cmd exec prisma -- migrate deploy --schema prisma/schema.prisma" $serverRoot 180
  Invoke-VerificationStep "performance-perf01" "npm --prefix server run test:performance (schema $performanceSchema; exact1000Tickets/5000Actions)" "npm.cmd --prefix server run test:performance" $repoRoot 900

  Invoke-VerificationStep "e2e-schema-create" "node --import tsx/esm tests/support/issue91-isolated-schema.ts create" "node.exe --import tsx/esm tests/support/issue91-isolated-schema.ts create" $serverRoot 30
  $e2eSchema = Get-SchemaFromLastOutput '^issue91_verify_[a-f0-9]{24}$'
  $ownedSchemas.Add($e2eSchema)
  $e2eDatabaseUrl = New-SchemaDatabaseUrl $baseDatabaseUrl $e2eSchema
  $env:DATABASE_URL = $e2eDatabaseUrl
  $env:UPLOAD_DIR = $uploadRoot
  $env:PW_API_URL = "http://127.0.0.1:$ApiPort"
  $env:PW_CLIENT_URL = "http://127.0.0.1:$ClientPort"
  $env:PW_CLIENT_PORT = [string]$ClientPort
  $env:PW_SCREENSHOT_ROOT = $resolvedScreenshotRoot
  $env:PW_OUTPUT_DIR = Join-Path $taskRoot "playwright-results"
  $env:PW_HTML_REPORT_DIR = Join-Path $taskRoot "playwright-report"
  $env:PW_RUN_ISSUE90_E2E = "true"
  $env:PW_REUSE_SERVER = "false"
  Invoke-VerificationStep "e2e-migrate-deploy" "npm exec prisma -- migrate deploy --schema prisma/schema.prisma (schema $e2eSchema)" "npm.cmd exec prisma -- migrate deploy --schema prisma/schema.prisma" $serverRoot 180
  Invoke-VerificationStep "e2e-reference-data" "node --import tsx/esm tests/support/issue61-e2e-reference.ts (categories/systems only; schema $e2eSchema)" "node.exe --import tsx/esm tests/support/issue61-e2e-reference.ts" $serverRoot 60
  Invoke-VerificationStep "e2e-regression" "npm run e2e -- --project=e2e (API $ApiPort; client $ClientPort; schema $e2eSchema)" "npm.cmd run e2e -- --project=e2e" $repoRoot 1800
  Invoke-VerificationStep "e2e-reference-seed-for-screenshots" "npm --prefix server run prisma:seed (schema $e2eSchema; after lifecycle/admin E2E)" "npm.cmd --prefix server run prisma:seed" $repoRoot 180
  Invoke-VerificationStep "e2e-dashboard-captures" "npm run e2e -- --project=dashboard-screenshots (schema $e2eSchema)" "npm.cmd run e2e -- --project=dashboard-screenshots" $repoRoot 900
  Invoke-VerificationStep "e2e-all-screenshots" "npm run screenshots (schema $e2eSchema)" "npm.cmd run screenshots" $repoRoot 1200
} catch {
  $fatalMessage = $_.Exception.Message
  Write-Host "ISSUE91 RUN FAILED: $fatalMessage"
} finally {
  $env:DATABASE_URL = $baseDatabaseUrl
  try {
    $cleanupSchemas = $ownedSchemas.ToArray()
    [Array]::Reverse($cleanupSchemas)
    foreach ($schema in $cleanupSchemas) {
      try {
        Invoke-VerificationStep "cleanup-$schema" "node --import tsx/esm tests/support/issue91-isolated-schema.ts drop $schema" "node.exe --import tsx/esm tests/support/issue91-isolated-schema.ts drop $schema" $serverRoot 60
      } catch {
        $fatalMessage = if ($fatalMessage) { "${fatalMessage}; cleanup failed for ${schema}: $($_.Exception.Message)" } else { "Cleanup failed for ${schema}: $($_.Exception.Message)" }
      }
    }
    if (Test-Path -LiteralPath $uploadRoot) {
      $resolvedRun = [System.IO.Path]::GetFullPath($taskRoot)
      $resolvedUpload = [System.IO.Path]::GetFullPath($uploadRoot)
      if ($resolvedUpload.StartsWith($resolvedRun + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolvedUpload -Recurse -Force
        $uploadCleanupStatus = "removed"
      }
    } else { $uploadCleanupStatus = "not present" }
  } catch {
    $fatalMessage = if ($fatalMessage) { "${fatalMessage}; teardown failed: $($_.Exception.Message)" } else { "Teardown failed: $($_.Exception.Message)" }
  } finally {
    foreach ($name in $environmentNames) {
      $previous = $originalEnvironment[$name]
      try {
        if ($null -eq $previous) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { Set-Item "Env:$name" $previous }
      } catch {
        $fatalMessage = if ($fatalMessage) { "${fatalMessage}; failed to restore environment variable ${name}" } else { "Failed to restore environment variable ${name}" }
      }
    }
  }
}

$summaryPath = Join-Path $evidenceRunRoot "run-summary.txt"
$summary = @(
  "Issue91 bounded verification summary",
  "Local time: $([DateTimeOffset]::Now.ToString('yyyy-MM-dd HH:mm:ss zzz'))",
  "Target: dedicated localhost PostgreSQL 16 container $containerName, database lab4test; no application database used.",
  "Source HEAD: $(& git.exe -C $repoRoot rev-parse HEAD 2>$null); worktree dirty entries: $(@(& git.exe -C $repoRoot status --porcelain 2>$null).Count)",
  "API port: $ApiPort; client port: $ClientPort; ports confirmed free at preflight: $portsConfirmedFree.",
  "Screenshot root: $resolvedScreenshotRoot",
  "Task-owned schema names created by this run: $($ownedSchemas -join ', ')",
  "Upload path: $uploadRoot; cleanup outcome: $uploadCleanupStatus.",
  "",
  ($results | Format-Table -AutoSize | Out-String).TrimEnd(),
  "",
  "Final status: $(if ($fatalMessage) { "FAILED: $fatalMessage" } else { "PASSED" })"
) -join "`n"
Set-Content -LiteralPath $summaryPath -Value (Sanitize-Log $summary) -Encoding UTF8
Write-Host $summary
if ($fatalMessage) { exit 1 }
exit 0
