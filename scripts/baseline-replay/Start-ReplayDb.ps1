[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })]
  [string]$ReplayRoot
)

$ErrorActionPreference = 'Stop'
# Permanent replay wrapper. Its state remains only in the explicit isolated replay tree.
$sourceContainer = 'supabase_db_vault-os-baseline-replay-supabase'
$wrapperContainer = 'vault-os-baseline-replay-db-replay'
$templatePath = Join-Path $ReplayRoot '.replay-db-container-template.json'
$expectedImage = 'public.ecr.aws/supabase/postgres:17.6.1.143'
$expectedNetwork = 'supabase_network_vault-os-baseline-replay-supabase'
$expectedVolume = 'supabase_db_vault-os-baseline-replay-supabase'

function Get-DockerJson([string[]] $Arguments) {
  $json = & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments -join ' ') failed" }
  return $json | ConvertFrom-Json
}

if (-not (Test-Path -LiteralPath $templatePath)) {
  $source = Get-DockerJson @('inspect', $sourceContainer)
  if ($source.Count -ne 1) { throw "Expected exactly one source container: $sourceContainer" }
  $source = $source[0]
  if ($source.Config.Image -ne $expectedImage) { throw "Unexpected source image: $($source.Config.Image)" }
  if ($source.HostConfig.NetworkMode -ne $expectedNetwork) { throw "Unexpected source network: $($source.HostConfig.NetworkMode)" }
  if (($source.Mounts | Where-Object { $_.Type -eq 'volume' -and $_.Name -eq $expectedVolume -and $_.Destination -eq '/var/lib/postgresql/data' }).Count -ne 1) { throw 'The isolated replay data-volume mount is not the expected one.' }
  $source | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $templatePath -Encoding UTF8
}

$template = Get-Content -LiteralPath $templatePath -Raw | ConvertFrom-Json
if ($template.Config.Image -ne $expectedImage) { throw "Unexpected template image: $($template.Config.Image)" }
if ($template.HostConfig.NetworkMode -ne $expectedNetwork) { throw "Unexpected template network: $($template.HostConfig.NetworkMode)" }
& cmd.exe /c "docker container inspect $wrapperContainer >nul 2>&1"
if ($LASTEXITCODE -eq 0) { throw "Wrapper container already exists: $wrapperContainer" }

$entrypoint = @($template.Config.Entrypoint)
if ($entrypoint.Count -ne 3 -or $entrypoint[0] -ne 'sh' -or $entrypoint[1] -ne '-c' -or $null -ne $template.Config.Cmd) { throw 'The saved Supabase CLI entrypoint/Cmd shape is not expected.' }
$postgresInvocation = 'docker-entrypoint.sh postgres -D /etc/postgresql'
if ([regex]::Matches($entrypoint[2], [regex]::Escape($postgresInvocation)).Count -ne 1) { throw 'The saved Supabase CLI bootstrap script does not contain exactly one expected Postgres invocation.' }
$entrypointScript = $entrypoint[2].Replace($postgresInvocation, 'docker-entrypoint.sh postgres -D /etc/postgresql -c cron.launch_active_jobs=off')

& cmd.exe /c "docker container inspect $sourceContainer >nul 2>&1"
if ($LASTEXITCODE -eq 0) {
  & docker stop $sourceContainer | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not stop the isolated CLI DB container: $sourceContainer" }
  & docker rm $sourceContainer | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not remove the isolated CLI DB container: $sourceContainer" }
}

$args = @('create', '--name', $wrapperContainer)
foreach ($label in $template.Config.Labels.psobject.Properties) { $args += @('--label', "$($label.Name)=$($label.Value)") }
foreach ($environment in $template.Config.Env) { $args += @('--env', $environment) }
$args += @('--restart', $template.HostConfig.RestartPolicy.Name, '--shm-size', [string]$template.HostConfig.ShmSize)
foreach ($mount in $template.Mounts) {
  if ($mount.Type -ne 'volume' -or $mount.Destination -ne '/var/lib/postgresql/data') { throw "Unsupported inspected mount: $($mount.Destination)" }
  $args += @('--mount', "type=volume,src=$($mount.Name),dst=$($mount.Destination)")
}
foreach ($port in $template.HostConfig.PortBindings.psobject.Properties) { foreach ($binding in $port.Value) { $args += @('--publish', "$($binding.HostPort):$($port.Name.Split('/')[0])") } }
$args += @('--network', $template.HostConfig.NetworkMode)
foreach ($alias in @('db', 'db.supabase.internal', 'supabase_db_vault-os-baseline-replay-supabase')) { $args += @('--network-alias', $alias) }
$health = $template.Config.Healthcheck
if ($health.Test[0] -ne 'CMD') { throw 'Unsupported inspected healthcheck form.' }
$args += @('--health-cmd', ($health.Test[1..($health.Test.Count - 1)] -join ' '), '--health-interval', "$($health.Interval)ns", '--health-timeout', "$($health.Timeout)ns", '--health-retries', [string]$health.Retries)
$args += @('--entrypoint', 'sh', $template.Config.Image, '-c', $entrypointScript)

& docker @args | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not create the replay wrapper container.' }
& docker start $wrapperContainer | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not start the replay wrapper container.' }
Write-Output "Started $wrapperContainer with cron.launch_active_jobs=off."
