[CmdletBinding()]
param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$apiVersion = "2026-07"
$orderWebhookCallback = "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-webhook"

if (-not $EnvFile) {
  $EnvFile = Join-Path $PSScriptRoot "..\apps\web\.env.local"
}

function Import-EnvironmentFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      continue
    }

    $name = $matches[1]
    if ([Environment]::GetEnvironmentVariable($name, "Process")) {
      continue
    }

    $value = $matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or
       ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Invoke-ShopifyGraphQL {
  param(
    [Parameter(Mandatory = $true)][string]$Query,
    [Parameter(Mandatory = $true)][hashtable]$Variables,
    [Parameter(Mandatory = $true)][string]$StoreDomain,
    [Parameter(Mandatory = $true)][string]$AccessToken
  )

  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "https://$StoreDomain/admin/api/$apiVersion/graphql.json" `
    -Headers @{ "X-Shopify-Access-Token" = $AccessToken } `
    -ContentType "application/json" `
    -Body (@{ query = $Query; variables = $Variables } | ConvertTo-Json -Depth 20)

  if ($response.errors) {
    $messages = @($response.errors | ForEach-Object { $_.message }) -join "; "
    throw "Shopify GraphQL failed: $messages"
  }

  return $response.data
}

Import-EnvironmentFile -Path $EnvFile

$storeDomain = [Environment]::GetEnvironmentVariable("SHOPIFY_STORE_DOMAIN", "Process")
$clientId = [Environment]::GetEnvironmentVariable("SHOPIFY_CLIENT_ID", "Process")
$clientSecret = [Environment]::GetEnvironmentVariable("SHOPIFY_CLIENT_SECRET", "Process")

if (-not $storeDomain -or -not $clientId -or -not $clientSecret) {
  throw "SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required."
}

$storeDomain = $storeDomain.Trim() -replace '^https?://', '' -replace '/+$', ''
$tokenResponse = Invoke-RestMethod `
  -Method Post `
  -Uri "https://$storeDomain/admin/oauth/access_token" `
  -ContentType "application/x-www-form-urlencoded" `
  -Body @{
    grant_type = "client_credentials"
    client_id = $clientId
    client_secret = $clientSecret
  }

if (-not $tokenResponse.access_token) {
  throw "Shopify did not return an Admin API access token."
}

$query = @'
query VaultShopifyInstallation($after: String) {
  shop { id name myshopifyDomain }
  currentAppInstallation {
    id
    app {
      id
      apiKey
      title
      developerName
      developerType
      shopifyDeveloped
      webhookApiVersion
    }
    accessScopes { handle }
  }
  webhookSubscriptions(first: 100, after: $after) {
    nodes { id topic uri }
    pageInfo { hasNextPage endCursor }
  }
}
'@

$subscriptions = @()
$cursor = $null
$identity = $null

do {
  $data = Invoke-ShopifyGraphQL `
    -Query $query `
    -Variables @{ after = $cursor } `
    -StoreDomain $storeDomain `
    -AccessToken ([string]$tokenResponse.access_token)

  if (-not $identity) {
    $identity = $data
  }

  $subscriptions += @($data.webhookSubscriptions.nodes)
  $cursor = if ($data.webhookSubscriptions.pageInfo.hasNextPage) {
    $data.webhookSubscriptions.pageInfo.endCursor
  } else {
    $null
  }
} while ($cursor)

$app = $identity.currentAppInstallation.app
$matchingOrderWebhooks = @(
  $subscriptions | Where-Object { $_.uri -eq $orderWebhookCallback }
)

[PSCustomObject]@{
  Shop = [PSCustomObject]@{
    Id = $identity.shop.id
    Name = $identity.shop.name
    MyShopifyDomain = $identity.shop.myshopifyDomain
  }
  AppInstallation = [PSCustomObject]@{
    InstallationId = $identity.currentAppInstallation.id
    AppId = $app.id
    AppName = $app.title
    DeveloperName = $app.developerName
    DeveloperType = $app.developerType
    ShopifyDeveloped = $app.shopifyDeveloped
    WebhookApiVersion = $app.webhookApiVersion
    ClientIdMatchesAppApiKey = ([string]$app.apiKey -ceq [string]$clientId)
    AccessScopes = @($identity.currentAppInstallation.accessScopes.handle | Sort-Object)
  }
  OrderSyncCredentialMatch = ([string]$app.apiKey -ceq [string]$clientId)
  CallbackUrl = $orderWebhookCallback
  WebhookSubscriptions = @(
    $subscriptions |
      Select-Object id, topic, uri
  )
  MatchingCallbackSubscriptions = @(
    $matchingOrderWebhooks |
      Select-Object id, topic, uri
  )
} | ConvertTo-Json -Depth 10
