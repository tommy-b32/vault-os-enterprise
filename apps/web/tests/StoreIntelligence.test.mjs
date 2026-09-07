import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildProductMomentum } from "../lib/intelligence/ProductMomentumEngine.ts";

const now = new Date("2026-09-01T12:00:00Z");

function momentum(rows) {
  const orders = new Map(rows.map((row, index) => [`order-${index}`, {
    id: `order-${index}`,
    shopify_created_at: row.current ? "2026-08-25T12:00:00Z" : "2026-08-10T12:00:00Z",
    net_revenue: 0, gross_total: 0, refunds: 0, cancelled_at: null, metadata: { test: false },
  }]));
  return buildProductMomentum(rows.map((row, index) => ({
    order_id: `order-${index}`, title: row.title, quantity: row.units,
    refunded_quantity: row.refunded ?? 0, net_line_revenue: row.revenue ?? row.units * 10,
  })), orders, now);
}

test("classifies strong high-volume acceleration with high confidence", () => {
  const [product] = momentum([{ title: "Core Tee", units: 20, current: true }, { title: "Core Tee", units: 10 }]);
  assert.equal(product.status, "accelerating");
  assert.equal(product.confidence, "high");
  assert.match(product.recommendedAction, /Protect stock/);
  assert.match(product.recommendedAction, /Meta spend remains locked/);
});

test("does not promote a huge percentage increase from a tiny base", () => {
  const [product] = momentum([{ title: "Tiny Base", units: 7, current: true }, { title: "Tiny Base", units: 1 }]);
  assert.equal(product.status, "insufficient_data");
  assert.equal(product.confidence, "low");
});

test("labels demand with no prior units as emerging rather than infinite growth", () => {
  const [product] = momentum([{ title: "New Drop", units: 5, current: true }]);
  assert.equal(product.status, "emerging");
  assert.equal(product.unitChange, null);
  assert.match(product.recommendedAction, /Monitor another 7–14 days/);
});

test("classifies stable and cooling products from net-unit movement", () => {
  const products = momentum([
    { title: "Stable", units: 8, current: true }, { title: "Stable", units: 7 },
    { title: "Cooling", units: 4, current: true }, { title: "Cooling", units: 12 },
  ]);
  assert.equal(products.find((product) => product.title === "Stable")?.status, "stable");
  const cooling = products.find((product) => product.title === "Cooling");
  assert.equal(cooling?.status, "cooling");
  assert.match(cooling?.recommendedAction ?? "", /Review declining demand/);
});

test("uses refunded quantities and excludes VaultCare from merchandise actions", () => {
  const products = momentum([
    { title: "Refunded Tee", units: 10, refunded: 8, current: true }, { title: "Refunded Tee", units: 8 },
    { title: "VaultCare Return Protection", units: 20, current: true }, { title: "VaultCare Return Protection", units: 10 },
  ]);
  const refunded = products.find((product) => product.title === "Refunded Tee");
  assert.equal(refunded?.currentUnits, 2);
  assert.ok(!products.some((product) => /vaultcare|return protection/i.test(product.title)));
});

test("keeps Meta recommendations explicitly locked and preserves the analytics boundary", async () => {
  const [engine, page] = await Promise.all([
    readFile(new URL("../lib/intelligence/StoreIntelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/intelligence/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(engine, /2026-05-04T00:00:00\+01:00/);
  assert.match(engine, /metaStatus: "pending"/);
  assert.match(page, /Budget recommendations locked/);
});
