[CmdletBinding()]
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot "..\apps\web\.env.local")
)

$ErrorActionPreference = "Stop"

$callbackUri = "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-webhook"
$apiVersion = "2026-07"
$requiredTopics = @(
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "REFUNDS_CREATE"
)

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

function Get-WebhookSubscriptions {
  param(
    [Parameter(Mandatory = $true)][string]$StoreDomain,
    [Parameter(Mandatory = $true)][string]$AccessToken
  )

  $query = @'
query VaultWebhookSubscriptions($after: String) {
  webhookSubscriptions(first: 100, after: $after) {
    nodes { id topic uri }
    pageInfo { hasNextPage endCursor }
  }
}
'@
  $subscriptions = @()
  $cursor = $null

  do {
    $data = Invoke-ShopifyGraphQL `
      -Query $query `
      -Variables @{ after = $cursor } `
      -StoreDomain $StoreDomain `
      -AccessToken $AccessToken
    $connection = $data.webhookSubscriptions
    $subscriptions += @($connection.nodes)
    $cursor = if ($connection.pageInfo.hasNextPage) {
      $connection.pageInfo.endCursor
    } else {
      $null
    }
  } while ($cursor)

  return @($subscriptions)
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

$accessToken = [string]$tokenResponse.access_token
$existing = Get-WebhookSubscriptions -StoreDomain $storeDomain -AccessToken $accessToken

Write-Host "Existing Shopify webhook subscriptions:"
if ($existing.Count -eq 0) {
  Write-Host "  None"
} else {
  $existing | Select-Object id, topic, uri | Format-Table -AutoSize
}

$mutation = @'
mutation VaultCreateWebhook(
  $topic: WebhookSubscriptionTopic!
  $subscription: WebhookSubscriptionInput!
) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}
'@

foreach ($topic in $requiredTopics) {
  $topicMatches = @($existing | Where-Object { $_.topic -eq $topic })
  $exactMatches = @($topicMatches | Where-Object { $_.uri -eq $callbackUri })

  if ($exactMatches.Count -eq 1 -and $topicMatches.Count -eq 1) {
    Write-Host "$topic already registered as $($exactMatches[0].id)."
    continue
  }

  if ($topicMatches.Count -gt 0) {
    throw "$topic already has $($topicMatches.Count) subscription(s), but not one unique exact callback. Resolve these manually to avoid duplicates."
  }

  $data = Invoke-ShopifyGraphQL `
    -Query $mutation `
    -Variables @{
      topic = $topic
      subscription = @{
        uri = $callbackUri
        format = "JSON"
      }
    } `
    -StoreDomain $storeDomain `
    -AccessToken $accessToken
  $result = $data.webhookSubscriptionCreate

  if (@($result.userErrors).Count -gt 0) {
    $result.userErrors | Select-Object field, message | Format-Table -AutoSize
    throw "Shopify rejected the $topic webhook subscription."
  }

  Write-Host "Created $topic as $($result.webhookSubscription.id)."
  $existing += $result.webhookSubscription
}

$verified = Get-WebhookSubscriptions -StoreDomain $storeDomain -AccessToken $accessToken

foreach ($topic in $requiredTopics) {
  $matches = @(
    $verified | Where-Object {
      $_.topic -eq $topic -and $_.uri -eq $callbackUri
    }
  )

  if ($matches.Count -ne 1) {
    throw "Verification failed: expected exactly one $topic subscription at the production callback."
  }
}

Write-Host "All required Shopify order webhooks are registered exactly once:"
$verified |
  Where-Object { $requiredTopics -contains $_.topic } |
  Select-Object id, topic, uri |
  Format-Table -AutoSize
