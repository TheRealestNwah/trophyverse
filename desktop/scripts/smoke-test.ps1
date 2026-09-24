# Installs the built installer silently into a scratch folder, launches the
# installed app in smoke-test mode (boot, embedded database, dashboard, quit),
# then uninstalls it and checks nothing is left running or behind.
param(
    [Parameter(Mandatory = $true)][string]$Installer
)

$ErrorActionPreference = 'Stop'
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("trophyverse-smoke-" + [guid]::NewGuid())
$installDir = Join-Path $work 'app'
$dataDir = Join-Path $work 'data'

function Get-BundledPostgres {
    @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'postgres.exe' -and $_.ExecutablePath -like "$installDir\*" })
}

function Fail([string]$message) {
    Write-Host "SMOKE TEST FAILED: $message"
    $log = Join-Path $dataDir 'logs\main.log'
    if (Test-Path $log) { Get-Content $log | Select-Object -Last 40 }
    exit 1
}

$install = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$installDir") -PassThru -Wait
if ($install.ExitCode -ne 0) { Fail "installer exited with $($install.ExitCode)" }
$exe = Join-Path $installDir 'Trophyverse.exe'
if (-not (Test-Path $exe)) { Fail "installer didn't produce $exe" }
Write-Host "Installed to $installDir"

$env:TROPHYVERSE_DATA_DIR = $dataDir
$env:TROPHYVERSE_SMOKE_TEST = '1'
$app = Start-Process -FilePath $exe -PassThru
if (-not $app.WaitForExit(180000)) { $app.Kill(); Fail 'app did not finish within 3 minutes' }
if ($app.ExitCode -ne 0) { Fail "app exited with $($app.ExitCode)" }
$passed = Get-Content (Join-Path $dataDir 'logs\main.log') | Select-String 'Smoke test passed'
if (-not $passed) { Fail 'log has no "Smoke test passed" line' }
Write-Host $passed.Line
if ((Get-BundledPostgres).Count -ne 0) { Fail 'bundled PostgreSQL still running after the app quit' }

$uninstall = Start-Process -FilePath (Join-Path $installDir 'Uninstall Trophyverse.exe') -ArgumentList '/S' -PassThru -Wait
if ($uninstall.ExitCode -ne 0) { Fail "uninstaller exited with $($uninstall.ExitCode)" }
# The uninstaller hands off to a copy of itself, so give it a moment to finish.
$deadline = (Get-Date).AddSeconds(60)
while ((Test-Path $exe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Test-Path $exe) { Fail 'uninstaller left the app behind' }
if (-not (Test-Path (Join-Path $dataDir 'secrets.json'))) { Fail 'uninstall removed user data' }

Remove-Item -Recurse -Force $work
Write-Host 'Smoke test passed: install, launch, quit, uninstall'
