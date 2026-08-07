import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const engineUrl = new URL("../lib/brain/PurchaseIntelligenceEngine.ts", import.meta.url);
const pageUrl = new URL("../app/purchase-intelligence/page.tsx", import.meta.url);

test("purchase intelligence uses only canonical decision contracts", async () => {
  const source = await readFile(engineUrl, "utf8");
  assert.match(source, /BuyingRecommendationEngine\.buildRecommendation/);
  assert.match(source, /CapitalEngine\.reviewPosition/);
  assert.match(source, /SupplierMinimumContract\.create/);
  assert.doesNotMatch(source, /Math\.random|Date\.now|fetch\(/);
});

test("blocked catalogue and trust states cannot become recommendations", async () => {
  const source = await readFile(engineUrl, "utf8");
  assert.match(source, /inventory_strategy !== "stocked"/);
  assert.match(source, /!product\.configuration_trusted/);
  assert.match(source, /!replenishment\.trusted/);
  assert.match(source, /product\.reorder_approval\?\.approval_state !== "approved"/);
  assert.match(source, /!supplier\?\.active/);
});

test("supplier recommendations require minima, capital and trusted confidence", async () => {
  const source = await readFile(engineUrl, "utf8");
  assert.match(source, /if \(!minimumSatisfied\) continue/);
  assert.match(source, /!capital\.affordable/);
  assert.match(source, /!capital\.reserveProtected/);
  assert.match(source, /recommendation\.confidence !== 100/);
  assert.match(source, /confidence: "trusted"/);
});

test("Purchase Intelligence is read-only and checks live inventory freshness", async () => {
  const source = await readFile(pageUrl, "utf8");
  assert.match(source, /InventorySyncRepository\.getFreshness/);
  assert.match(source, /freshness\.syncStatus === "current"/);
  assert.match(source, /No purchase orders are created and no purchases are approved/);
  assert.doesNotMatch(source, /insert\(|update\(|delete\(|PurchaseOrderDraftWorkspace/);
});
