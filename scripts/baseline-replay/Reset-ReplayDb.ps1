[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })]
  [string]$ReplayRoot
)

$ErrorActionPreference = 'Stop'
$sourceContainer = 'supabase_db_vault-os-baseline-replay-supabase'
$wrapperContainer = 'vault-os-baseline-replay-db-replay'
$replayVolume = 'supabase_db_vault-os-baseline-replay-supabase'

foreach ($container in @($wrapperContainer, $sourceContainer)) {
  & cmd.exe /c "docker container inspect $container >nul 2>&1"
  if ($LASTEXITCODE -eq 0) {
    & docker rm --force $container | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not remove isolated replay container: $container" }
  }
}
& cmd.exe /c "docker volume inspect $replayVolume >nul 2>&1"
if ($LASTEXITCODE -eq 0) {
  & docker volume rm $replayVolume | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not remove isolated replay volume: $replayVolume" }
}

& (Join-Path $PSScriptRoot 'Start-ReplayDb.ps1') -ReplayRoot $ReplayRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not recreate the replay wrapper database.' }
Write-Output 'Wrapper database recreated. Verify cron.launch_active_jobs is off before applying migrations.'
