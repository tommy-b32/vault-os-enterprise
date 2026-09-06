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

function analyticsAllowed() {
  return vaultPrivacyStatus &&
    vaultPrivacyStatus.analyticsProcessingAllowed === true;
}

function canonicalEventPayload(event, eventName) {
  return {
    event_name: eventName,
    event_source: "storefront",
    analytics_allowed: true,
    session_id: event.clientId,
    shopify_event_id: event.id,
    occurred_at: event.timestamp,
    metadata: {
      shopify_event_name: event.name,
      shopify_event_id: event.id,
      occurred_at: event.timestamp,
      sequence: event.seq,
      privacy_mode: "tracked"
    }
  };
}

function sendTrackedEvent(event, eventName, details) {
  if (vaultSeenEventIds.has(event.id) || !analyticsAllowed()) return;

  vaultSeenEventIds.add(event.id);
  const payload = canonicalEventPayload(event, eventName);
  const eventPayload = Object.assign({}, payload, details);
  eventPayload.metadata = Object.assign(
    {},
    payload.metadata,
    details.metadata || {}
  );
  sendVaultEvent(eventPayload);
}

analytics.subscribe("page_viewed", function (event) {
  if (vaultSeenEventIds.has(event.id)) return;

  vaultSeenEventIds.add(event.id);

  const location = event.context.document.location;
  const pathname = location.pathname || "/";
  const pageTitle = event.context.document.title || null;

  if (analyticsAllowed()) {
    sendVaultEvent({
      event_name: "PAGE_VIEW",
      event_source: "storefront",
      analytics_allowed: true,
      session_id: event.clientId,
      shopify_event_id: event.id,
      occurred_at: event.timestamp,
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

analytics.subscribe("product_added_to_cart", function (event) {
  const cartLine = event.data.cartLine;
  const merchandise = cartLine && cartLine.merchandise;
  const product = merchandise && merchandise.product;
  const productUrl = product && product.url;
  let productHandle = null;
  let lineTotal = null;
  let lineCurrency = null;

  if (cartLine && cartLine.cost && cartLine.cost.totalAmount) {
    lineTotal = cartLine.cost.totalAmount.amount;
    lineCurrency = cartLine.cost.totalAmount.currencyCode;
  }

  if (typeof productUrl === "string") {
    const productMarker = "/products/";
    const productStart = productUrl.indexOf(productMarker);

    if (productStart >= 0) {
      productHandle = productUrl.slice(productStart + productMarker.length);
      const queryStart = productHandle.indexOf("?");
      const hashStart = productHandle.indexOf("#");
      let productEnd = productHandle.length;

      if (queryStart >= 0 && queryStart < productEnd) productEnd = queryStart;
      if (hashStart >= 0 && hashStart < productEnd) productEnd = hashStart;
      productHandle = productHandle.slice(0, productEnd) || null;
    }
  }

  sendTrackedEvent(event, "PRODUCT_ADDED_TO_CART", {
    product_id: product && product.id,
    product_handle: productHandle,
    product_title: product && product.title,
    variant_id: merchandise && merchandise.id,
    variant_title: merchandise && merchandise.title,
    customer_item_count: cartLine ? cartLine.quantity : 0,
    metadata: {
      quantity: cartLine ? cartLine.quantity : null,
      sku: merchandise && merchandise.sku,
      product_url: typeof productUrl === "string" ? productUrl : null,
      line_total: lineTotal,
      currency: lineCurrency
    }
  });
});

function sendCheckoutEvent(event, eventName) {
  const checkout = event.data.checkout;
  const order = checkout && checkout.order;
  let lineItems = [];
  let checkoutTotal = null;

  if (checkout && Array.isArray(checkout.lineItems)) {
    lineItems = checkout.lineItems;
  }

  if (checkout && checkout.totalPrice) {
    checkoutTotal = checkout.totalPrice.amount;
  }

  sendTrackedEvent(event, eventName, {
    shopify_checkout_token: checkout && checkout.token,
    customer_item_count: lineItems.reduce(function (total, line) {
      return total + (line ? Number(line.quantity) || 0 : 0);
    }, 0),
    metadata: {
      checkout_token_present: Boolean(checkout && checkout.token),
      currency: checkout && checkout.currencyCode,
      line_item_count: lineItems.length,
      total: checkoutTotal,
      order_id: order && order.id ? order.id : null
    }
  });
}

analytics.subscribe("checkout_started", function (event) {
  sendCheckoutEvent(event, "CHECKOUT_STARTED");
});

analytics.subscribe("checkout_completed", function (event) {
  sendCheckoutEvent(event, "CHECKOUT_COMPLETED");
});
