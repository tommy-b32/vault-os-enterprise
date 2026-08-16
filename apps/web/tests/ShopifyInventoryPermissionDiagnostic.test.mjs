import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const helper = await readFile(new URL("../../supabase/functions/_shared/shopify/inventory-scope-diagnostic.ts", root), "utf8");
const edge = await readFile(new URL("../../supabase/functions/shopify-inventory-scope-diagnostic/index.ts", root), "utf8");
const route = await readFile(new URL("app/api/inventory/permissions/route.ts", root), "utf8");
const panel = await readFile(new URL("components/inventory/InventorySyncPanel.tsx", root), "utf8");
const auth = await readFile(new URL("../../supabase/functions/_shared/shopify/auth.ts", root), "utf8");
const graphql = await readFile(new URL("../../supabase/functions/_shared/shopify/graphql.ts", root), "utf8");

test("diagnostic reuses canonical Shopify authentication and GraphQL helper", () => {
  assert.match(helper, /import \{ shopifyGraphQL \} from "\.\/graphql\.ts"/);
  assert.match(graphql, /getShopifyAccessToken/);
  assert.match(auth, /SHOPIFY_API_VERSION = "2026-07"/);
  assert.match(helper, /currentAppInstallation/);
  assert.match(helper, /accessScopes \{ handle \}/);
});

test("diagnostic reports each required granted or missing inventory scope", () => {
  assert.match(helper, /"write_inventory"/);
  assert.match(helper, /"read_inventory"/);
  assert.match(helper, /"read_locations"/);
  assert.match(helper, /missingScopes: REQUIRED_INVENTORY_SCOPES\.filter/);
  assert.match(panel, /Missing:.*missingScopes\.join/);
  assert.match(panel, /Granted:.*grantedScopes\.join/);
});

test("diagnostic is operator protected, live, read-only, and non-persistent", () => {
  assert.match(route, /authorizeApiRequest\(\["owner", "operator"\]\)/);
  assert.match(route, /Cache-Control": "no-store"/);
  assert.match(edge, /authenticated Vault server endpoint/);
  assert.doesNotMatch(helper + edge + route, /inventoryAdjustQuantities|inventorySetQuantities/);
  assert.doesNotMatch(helper + edge + route, /\.from\(|\.rpc\(|insert|update|upsert|delete/i);
  assert.match(panel, /Read-only diagnostic; no inventory was changed/);
});

test("server invocation accepts the deployed server-only API key without requiring a forbidden bearer copy", () => {
  assert.match(edge, /request\.headers\.get\("apikey"\)/);
  assert.match(edge, /if \(apiKey\.startsWith\("sb_secret_"\)\) return true/);
  assert.match(edge, /getLegacyJwtRole\(apiKey\) === "service_role"/);
  assert.doesNotMatch(edge, /Authorization.*SERVICE_ROLE_KEY|Bearer \$\{serviceKey\}/s);
});

test("publishable keys and user bearer tokens cannot bypass the protected server route", () => {
  assert.match(edge, /authorization === `Bearer \$\{apiKey\}`/);
  assert.doesNotMatch(edge, /sb_publishable_/);
  assert.match(route, /authorizeApiRequest\(\["owner", "operator"\]\)/);
});

test("the Next endpoint returns only the bounded diagnostic contract", () => {
  assert.match(route, /requiredScopes: data\.requiredScopes/);
  assert.match(route, /grantedScopes: data\.grantedScopes/);
  assert.match(route, /missingScopes: data\.missingScopes/);
  assert.match(route, /checkedAt: data\.checkedAt/);
  assert.doesNotMatch(route, /accessToken|SHOPIFY_CLIENT_SECRET/);
});
