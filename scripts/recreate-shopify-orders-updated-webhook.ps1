[CmdletBinding()]
param(
  [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"
$apiVersion = "2026-07"
$topic = "ORDERS_UPDATED"
$callbackUri = "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-webhook"

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

$accessToken = $null
$clientSecret = $null
$tokenResponse = $null

try {
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
  $allWebhookSubscriptions = @(
    Get-WebhookSubscriptions `
      -StoreDomain $storeDomain `
      -AccessToken $accessToken
  )
  $topicSubscriptions = @(
    $allWebhookSubscriptions | Where-Object { $_.topic -eq $topic }
  )
  $exactMatches = @(
    $topicSubscriptions | Where-Object { $_.uri -eq $callbackUri }
  )
  $topicCount = @($topicSubscriptions).Count
  $exactCount = @($exactMatches).Count

  Write-Host "Found $topicCount $topic subscription(s) and $exactCount exact callback match(es)."

  if ($topicCount -ne 1 -or $exactCount -ne 1) {
    throw "Expected exactly one ORDERS_UPDATED subscription at the production callback; found $topicCount topic subscription(s) and $exactCount exact match(es). No changes were made."
  }

  $existingSubscription = $exactMatches[0]
  Write-Host "Existing ORDERS_UPDATED subscription:"
  Write-Host "  ID: $($existingSubscription.id)"
  Write-Host "  URI: $($existingSubscription.uri)"
  $confirmation = Read-Host "Type RECREATE to delete and recreate only this subscription"

  if ($confirmation -cne "RECREATE") {
    Write-Host "Confirmation not received. No changes were made."
    return
  }

  $deleteMutation = @'
mutation VaultDeleteOrdersUpdatedWebhook($id: ID!) {
  webhookSubscriptionDelete(id: $id) {
    deletedWebhookSubscriptionId
    userErrors { field message }
  }
}
'@
  $deleteData = Invoke-ShopifyGraphQL `
    -Query $deleteMutation `
    -Variables @{ id = $existingSubscription.id } `
    -StoreDomain $storeDomain `
    -AccessToken $accessToken
  $deleteResult = $deleteData.webhookSubscriptionDelete

  if (@($deleteResult.userErrors).Count -gt 0) {
    $deleteResult.userErrors | Select-Object field, message | Format-Table -AutoSize
    throw "Shopify rejected the ORDERS_UPDATED subscription deletion."
  }

  if ($deleteResult.deletedWebhookSubscriptionId -ne $existingSubscription.id) {
    throw "Shopify did not confirm deletion of the audited ORDERS_UPDATED subscription."
  }

  Write-Host "Deleted ORDERS_UPDATED subscription $($existingSubscription.id)."

  $createMutation = @'
mutation VaultCreateOrdersUpdatedWebhook($subscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(
    topic: ORDERS_UPDATED
    webhookSubscription: $subscription
  ) {
    webhookSubscription { id topic uri }
    userErrors { field message }
  }
}
'@
  $createData = Invoke-ShopifyGraphQL `
    -Query $createMutation `
    -Variables @{
      subscription = @{
        uri = $callbackUri
        format = "JSON"
      }
    } `
    -StoreDomain $storeDomain `
    -AccessToken $accessToken
  $createResult = $createData.webhookSubscriptionCreate

  if (@($createResult.userErrors).Count -gt 0) {
    $createResult.userErrors | Select-Object field, message | Format-Table -AutoSize
    throw "Shopify rejected the replacement ORDERS_UPDATED subscription."
  }

  if (-not $createResult.webhookSubscription) {
    throw "Shopify returned no replacement ORDERS_UPDATED subscription."
  }

  $verifiedAllSubscriptions = @(
    Get-WebhookSubscriptions `
      -StoreDomain $storeDomain `
      -AccessToken $accessToken
  )
  $verifiedTopicSubscriptions = @(
    $verifiedAllSubscriptions | Where-Object { $_.topic -eq $topic }
  )
  $verifiedExactMatches = @(
    $verifiedTopicSubscriptions | Where-Object { $_.uri -eq $callbackUri }
  )
  $verifiedTopicCount = @($verifiedTopicSubscriptions).Count
  $verifiedExactCount = @($verifiedExactMatches).Count

  Write-Host "Post-recreation verification found $verifiedTopicCount $topic subscription(s) and $verifiedExactCount exact callback match(es)."

  if ($verifiedTopicCount -ne 1 -or $verifiedExactCount -ne 1) {
    throw "Replacement verification failed: found $verifiedTopicCount $topic subscription(s) and $verifiedExactCount exact callback match(es)."
  }

  Write-Host "Replacement verified:"
  $verifiedExactMatches | Select-Object id, topic, uri | Format-Table -AutoSize
} finally {
  $accessToken = $null
  $clientSecret = $null
  $tokenResponse = $null
  Remove-Variable accessToken, clientSecret, tokenResponse -ErrorAction SilentlyContinue
}
