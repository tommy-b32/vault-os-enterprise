/**
 * Vault OS Collector
 * Sprint 009: Page-view heartbeat
 */

const VAULT_COLLECTOR_ENDPOINT =
  "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/collect-event";

let vaultPrivacyStatus = init.customerPrivacy;

/**
 * Keep the privacy status current if the visitor changes consent
 * without refreshing the page.
 */
customerPrivacy.subscribe("visitorConsentCollected", (event) => {
  vaultPrivacyStatus = event.customerPrivacy;
});

function getPageType(pathname) {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/products/")) return "product";
  if (pathname.startsWith("/collections/")) return "collection";
  if (pathname.startsWith("/cart")) return "cart";
  if (pathname.startsWith("/checkouts/")) return "checkout";

  return "page";
}

function sendVaultEvent(payload) {
  return fetch(VAULT_COLLECTOR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((error) => {
    console.error("[Vault OS Collector]", error);
  });
}

analytics.subscribe("page_viewed", (event) => {
  const analyticsAllowed =
    vaultPrivacyStatus?.analyticsProcessingAllowed === true;

  const location = event.context?.document?.location;
  const pathname = location?.pathname || "/";

  sendVaultEvent({
    event_name: "PAGE_VIEW",
    event_source: "storefront",
    analytics_allowed: analyticsAllowed,

    /*
     * Only attach Shopify's client identifier where analytics
     * permission exists. Privacy-limited traffic gets no identifier.
     */
    session_id: analyticsAllowed
      ? event.clientId
      : undefined,

    page_path: pathname,
    page_type: getPageType(pathname),

    metadata: {
      shopify_event_name: event.name,
      shopify_event_id: event.id,
      occurred_at: event.timestamp,
      page_title:
        event.context?.document?.title || null,
    },
  });
});