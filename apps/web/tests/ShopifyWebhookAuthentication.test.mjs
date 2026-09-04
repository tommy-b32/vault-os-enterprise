import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { cleanShopDomain, constantTimeEqual, SUPPORTED_ORDER_WEBHOOK_TOPICS, verifyShopifyWebhookHmac } from "../../../supabase/functions/_shared/shopify/webhook-verification.ts";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

async function signature(body, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return Buffer.from(bytes).toString("base64");
}

test("valid raw-body HMAC succeeds and any body modification fails", async () => {
  const secret = "test-only-secret";
  const body = new TextEncoder().encode('{"id":1}');
  const hmac = await signature('{"id":1}', secret);
  assert.equal(await verifyShopifyWebhookHmac(body, hmac, secret), true);
  assert.equal(await verifyShopifyWebhookHmac(new TextEncoder().encode('{"id":2}'), hmac, secret), false);
});

test("missing, malformed and invalid signatures are rejected in constant time", async () => {
  const body = new TextEncoder().encode("{}");
  assert.equal(await verifyShopifyWebhookHmac(body, "", "secret"), false);
  assert.equal(await verifyShopifyWebhookHmac(body, "not-base64!", "secret"), false);
  assert.equal(await verifyShopifyWebhookHmac(body, await signature("{}", "other"), "secret"), false);
  assert.equal(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2])), false);
});

test("only the configured shop and supported order topics are accepted", () => {
  assert.equal(cleanShopDomain("https://Example.myshopify.com/"), "example.myshopify.com");
  assert.notEqual(cleanShopDomain("other.myshopify.com"), cleanShopDomain("example.myshopify.com"));
  assert.equal(SUPPORTED_ORDER_WEBHOOK_TOPICS.has("orders/create"), true);
  assert.equal(SUPPORTED_ORDER_WEBHOOK_TOPICS.has("orders/updated"), true);
  assert.equal(SUPPORTED_ORDER_WEBHOOK_TOPICS.has("products/create"), false);
});

test("handler verifies raw bytes before parsing, claims retries atomically, and acknowledges quickly", async () => {
  const handler = await read("supabase/functions/shopify-order-webhook/index.ts");
  assert.ok(handler.indexOf("verifyShopifyWebhookHmac(rawBody") < handler.indexOf("JSON.parse"));
  assert.match(handler, /\.insert\([\s\S]*shopify_webhook_id/);
  assert.match(handler, /deliveryError\?\.code === "23505"[\s\S]*duplicate: true/);
  assert.match(handler, /EdgeRuntime\.waitUntil\(processing\)[\s\S]*accepted: true \}, 202/);
  assert.doesNotMatch(handler, /console\.(?:log|error)\([^\n]*(?:payload|rawBody|providedHmac|webhookSecret)/);
});

test("only the webhook disables gateway JWT and scheduled reconciliation is unchanged", async () => {
  const [config, schedule] = await Promise.all([
    read("supabase/config.toml"),
    read("supabase/migrations/20260804000000_shopify_order_reconciliation_schedule.sql"),
  ]);
  assert.match(config, /\[functions\.shopify-order-webhook\]\s*verify_jwt = false/);
  assert.match(config, /\[functions\.shopify-order-sync\]\s*verify_jwt = true/);
  assert.match(schedule, /vault-shopify-order-reconciliation/);
  assert.match(schedule, /'\*\/10 \* \* \* \*'/);
});
