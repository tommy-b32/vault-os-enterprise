[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Container })]
  [string]$ReplayRoot
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fixtureRoot = Join-Path $repositoryRoot 'apps\web\tests\fixtures\replay-compat'
$stagedMigrationRoot = Join-Path $ReplayRoot 'supabase\migrations'

if (-not (Test-Path -LiteralPath $stagedMigrationRoot -PathType Container)) {
  throw "Replay migration directory does not exist: $stagedMigrationRoot"
}

$fixtures = @(
  '20260722000000_historical_catalogue_intelligence_foundation.sql',
  '20260722010000_compatibility_recovered_style_catalogue.sql'
)

foreach ($fixture in $fixtures) {
  $source = Join-Path $fixtureRoot $fixture
  $destination = Join-Path $stagedMigrationRoot $fixture
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Replay-only fixture is missing: $source"
  }
  if (Test-Path -LiteralPath $destination -PathType Leaf) {
    throw "Replay-only fixture is already staged: $destination"
  }
  Copy-Item -LiteralPath $source -Destination $destination
  if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash) {
    throw "Replay-only fixture hash mismatch after staging: $fixture"
  }
  Write-Output "Staged replay-only foundation: $fixture"
}
