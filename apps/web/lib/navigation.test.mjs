import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";

import {
  getVaultSubNavigation,
  isVaultNavigationItemActive,
  isVaultSubNavigationItemActive,
  VAULT_NAVIGATION,
} from "./navigation.ts";

const webRoot = new URL("../", import.meta.url);

test("primary area active states cover every retained nested route family", () => {
  const activeLabel = (pathname) => VAULT_NAVIGATION.find((item) =>
    isVaultNavigationItemActive(pathname, item.href),
  )?.label;

  assert.equal(activeLabel("/purchase-intelligence"), "Purchasing");
  assert.equal(activeLabel("/purchase-orders/po-123"), "Purchasing");
  assert.equal(activeLabel("/supplier-catalogue/archive-123/review"), "Suppliers");
  assert.equal(activeLabel("/financial-intelligence"), "Finance");
  assert.equal(activeLabel("/intelligence/products/product-123"), "Finance");
  assert.equal(activeLabel("/missions"), "Vault Brain");
  assert.equal(activeLabel("/catalogue/pack-profiles"), "Catalogue");
  assert.equal(activeLabel("/orders/order-123"), "Orders");
});

test("contextual navigation activates only the most specific matching item", () => {
  const activeLabels = (pathname) => getVaultSubNavigation(pathname)
    .filter((item) => isVaultSubNavigationItemActive(pathname, item.href))
    .map((item) => item.label);

  for (const [pathname, activeLabel] of [
    ["/catalogue", "Products"],
    ["/catalogue/import", "Import"],
    ["/catalogue/pack-profiles", "Pack Profiles"],
  ]) {
    assert.equal(isVaultNavigationItemActive(pathname, "/catalogue"), true);
    assert.deepEqual(activeLabels(pathname), [activeLabel]);
  }
});

test("legacy operational page routes remain present", async () => {
  await Promise.all([
    "app/advisor/page.tsx",
    "app/commercial/page.tsx",
    "app/financial-intelligence/page.tsx",
    "app/intelligence/page.tsx",
    "app/purchase-intelligence/page.tsx",
    "app/purchase-orders/page.tsx",
    "app/supplier-catalogue/page.tsx",
    "app/supplier-catalogue/review/page.tsx",
  ].map((path) => access(new URL(path, webRoot))));
});
