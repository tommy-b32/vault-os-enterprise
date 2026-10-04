import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("app/inventory/page.tsx", root), "utf8");

function sectionAfter(marker) {
  const start = page.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  return page.slice(start);
}

test("inventory retains exactly four operational summary metrics", () => {
  const metrics = sectionAfter('<section className="inventory-metrics">')
    .split('<section className="vault-panel inventory-risk-panel">')[0];
  const metricInstances = metrics.match(/<InventoryMetric\b/g) ?? [];

  assert.equal(metricInstances.length, 4);
  for (const label of [
    "Monitored products",
    "Units on hand",
    "Low or unavailable",
    "Data freshness",
  ]) {
    assert.match(metrics, new RegExp(`label="${label}"`));
  }
  assert.doesNotMatch(metrics, /Health Score|Incoming|Committed/);
});

test("inventory leads visually with exceptions before the four-metric summary", () => {
  assert.match(page, /Critical exceptions/);
  assert.match(page, /Stock needing attention/);
  assert.match(page, /\.inventory-risk-panel\s*\{[\s\S]*?order:\s*1;/);
  assert.match(page, /\.inventory-metrics\s*\{[\s\S]*?order:\s*2;/);
  assert.doesNotMatch(page, /Health Score/);
  assert.doesNotMatch(page, /Inventory Risk Radar/);
});

test("stock workspace retains all operational stock headers", () => {
  const workspace = sectionAfter('<section className="vault-panel inventory-table-panel">')
    .split('<details className="inventory-data-status">')[0];

  for (const header of [
    "Product",
    "Status",
    "On hand",
    "Committed",
    "Available",
    "Incoming",
    "Last sync",
  ]) {
    assert.match(workspace, new RegExp(`<th>${header}</th>`));
  }
});

test("exceptions exclude healthy inventory, prioritise risk, and retain a compact no-risk state", () => {
  const riskHelper = sectionAfter('function isInventoryRisk(')
    .split('function isMonitoredInventory(')[0];
  assert.match(riskHelper, /status === "negative"/);
  assert.match(riskHelper, /status === "out"/);
  assert.match(riskHelper, /status === "low"/);
  assert.doesNotMatch(riskHelper, /status === "healthy"/);

  const riskPresentation = sectionAfter('const inventoryRisks =')
    .split('const latestSync =')[0];
  assert.match(riskPresentation, /\.filter\(isInventoryRisk\)/);
  assert.match(riskPresentation, /\.sort\([\s\S]*?getAvailableStock\(a\)\s*-\s*getAvailableStock\(b\)/);
  assert.match(page, /No immediate stock risks/);
  assert.match(page, /\.inventory-empty\s*\{[\s\S]*?padding:\s*48px 24px;/);
});

test("freshness warning remains visible before operational content while diagnostics stay collapsed", () => {
  const warning = page.indexOf('className="inventory-data-warning"');
  const exceptions = page.indexOf('className="vault-panel inventory-risk-panel"');
  const metrics = page.indexOf('className="inventory-metrics"');
  const workspace = page.indexOf('className="vault-panel inventory-table-panel"');
  const diagnostics = page.indexOf('<details className="inventory-data-status">');

  assert.ok(warning >= 0);
  assert.ok(warning < exceptions);
  assert.ok(warning < metrics);
  assert.ok(exceptions < workspace);
  assert.ok(metrics < workspace);
  assert.ok(workspace < diagnostics);
  assert.match(page, /<section className="inventory-data-warning" role="alert">/);
  assert.match(page, /<details className="inventory-data-status">/);
  assert.doesNotMatch(page, /<details className="inventory-data-status"\s+open/);
  assert.match(page, /Shopify sync and reconciliation details/);
  assert.match(page, /<InventorySyncPanel freshness=\{inventoryFreshness\} \/>/);
});

test("the stock workspace remains primary detail and diagnostics stay secondary", () => {
  const workspace = page.indexOf("Stock workspace");
  const diagnostics = page.indexOf("Shopify sync and reconciliation details");
  assert.ok(workspace >= 0);
  assert.ok(diagnostics > workspace);
  assert.match(page, /<details className="inventory-data-status">/);
  assert.match(page, /<InventorySyncPanel freshness=\{inventoryFreshness\} \/>/);
  assert.match(page, /Stock data needs attention/);
});

test("inventory does not duplicate purchasing recommendation content or change stock rules", () => {
  assert.doesNotMatch(page, /purchase-intelligence/);
  assert.match(page, /if \(availableStock <= 5\)/);
  assert.match(page, /stockOnHand < 0 \|\| availableStock < 0/);
  assert.match(page, /normaliseNumber\(record\.stock_on_hand\) -/);
});
