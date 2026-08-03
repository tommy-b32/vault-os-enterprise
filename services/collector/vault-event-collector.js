/**
 * Vault OS Collector
 * Sprint 010: Consent-aware Traffic Intelligence
 */

const VAULT_COLLECTOR_ENDPOINT =
  "https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/collect-event";

let vaultPrivacyStatus = init.customerPrivacy;
/*
 * Privacy-limited visit estimation deliberately lives only in this pixel
 * runtime's memory. It is never persisted and is never sent with tracked
 * events. A full navigation or reload can therefore start a new estimate.
 */
const vaultPrivacyVisitId = crypto.randomUUID();
const vaultSeenEventIds = new Set();

api.customerPrivacy.subscribe(
  "visitorConsentCollected",
  function (event) {
    vaultPrivacyStatus = event.customerPrivacy;
  }
);

function getPageType(pathname) {
  if (pathname === "/") return "home";
  if (pathname.indexOf("/products/") === 0) return "product";
  if (pathname.indexOf("/collections/") === 0) return "collection";
  if (pathname.indexOf("/cart") === 0) return "cart";
  if (pathname.indexOf("/checkouts/") === 0) return "checkout";

  return "page";
}

function sendVaultEvent(payload) {
  fetch(VAULT_COLLECTOR_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(function (error) {
    console.error("[Vault OS Collector]", error);
  });
}

analytics.subscribe("page_viewed", function (event) {
  if (vaultSeenEventIds.has(event.id)) return;

  vaultSeenEventIds.add(event.id);

  const analyticsAllowed =
    vaultPrivacyStatus &&
    vaultPrivacyStatus.analyticsProcessingAllowed === true;

  const location = event.context.document.location;
  const pathname = location.pathname || "/";
  const pageTitle = event.context.document.title || null;

  if (analyticsAllowed) {
    sendVaultEvent({
      event_name: "PAGE_VIEW",
      event_source: "storefront",
      analytics_allowed: true,
      session_id: event.clientId,
      shopify_event_id: event.id,
      page_path: pathname,
      page_type: getPageType(pathname),
      metadata: {
        shopify_event_name: event.name,
        shopify_event_id: event.id,
        occurred_at: event.timestamp,
        page_title: pageTitle,
        privacy_mode: "tracked"
      }
    });

    return;
  }

  sendVaultEvent({
    event_name: "PAGE_VIEW",
    event_source: "storefront",
    analytics_allowed: false,
    privacy_visit_id: vaultPrivacyVisitId,
    shopify_event_id: event.id,
    page_path: pathname,
    page_type: getPageType(pathname),
    metadata: {
      shopify_event_name: event.name,
      shopify_event_id: event.id,
      occurred_at: event.timestamp,
      page_title: pageTitle,
      privacy_mode: "privacy_limited"
    }
  });
});
