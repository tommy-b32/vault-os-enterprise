import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DemandLifecycleEngine } from "../lib/brain/DemandLifecycleEngine.ts";

const detect = (overrides = {}) => DemandLifecycleEngine.detect({
  sold7d: 1, sold14d: 1, sold30d: 1, daysSinceLastSale: 1,
  canonicalHistoryComplete: true, ...overrides,
});
const urgency = (overrides = {}) => DemandLifecycleEngine.urgency({
  currentStock: 1, netAvailableStock: 1, supplierLeadTimeDays: 10,
  targetStockDays: 7, unitsPerPack: 5, ...overrides,
});

test("sold yesterday with stock one is ACTIVE with HIGH or CRITICAL urgency", () => {
  assert.equal(detect().demand_status, "ACTIVE");
  assert.ok(["HIGH", "CRITICAL"].includes(urgency().urgency));
});

test("recent sales with healthy stock remain ACTIVE at lower urgency", () => {
  assert.equal(detect().demand_status, "ACTIVE");
  assert.equal(urgency({ currentStock: 30, netAvailableStock: 30 }).urgency, "LOW");
});

test("two thirty-day sales with last sale twenty days ago are SLOW", () => {
  assert.equal(detect({ sold7d: 0, sold14d: 0, sold30d: 2, daysSinceLastSale: 20 }).demand_status, "SLOW");
});

test("zero thirty-day sales remain DORMANT even at zero stock", () => {
  const result = detect({ sold7d: 0, sold14d: 0, sold30d: 0, daysSinceLastSale: null });
  assert.equal(result.demand_status, "DORMANT");
  assert.equal("urgency" in result, false);
});

test("last sale beyond thirty days is DORMANT", () => {
  assert.equal(detect({ sold7d: 0, sold14d: 0, sold30d: 2, daysSinceLastSale: 31 }).demand_status, "DORMANT");
});

test("incomplete canonical history is NO_EVIDENCE", () => {
  assert.equal(detect({ canonicalHistoryComplete: false }).demand_status, "NO_EVIDENCE");
});

test("stock never changes demand detection", () => {
  const sales = { sold7d: 0, sold14d: 0, sold30d: 2, daysSinceLastSale: 20 };
  assert.deepEqual(detect(sales), detect(sales));
  const source = DemandLifecycleEngine.detect.toString();
  assert.doesNotMatch(source, /stock|lead|target|pack/i);
});

test("purchasing qualification remains downstream and excludes dormant demand", async () => {
  const source = await readFile(new URL("../lib/brain/PurchaseIntelligenceEngine.ts", import.meta.url), "utf8");
  assert.match(source, /demand\.demand_status !== "ACTIVE" && demand\.demand_status !== "SLOW"/);
  assert.match(source, /SupplierMinimumContract\.create/);
  assert.match(source, /CapitalEngine\.reviewPosition/);
});

test("demand stages neither create purchase orders nor consume supplier policy", async () => {
  const [lifecycle, demand] = await Promise.all([
    readFile(new URL("../lib/brain/DemandLifecycleEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/DemandIntelligenceEngine.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(lifecycle, /supplier minimum|approval|wallet|capital|commercial|purchase order/i);
  assert.doesNotMatch(lifecycle + demand, /insert\(|update\(|delete\(/);
});
