import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSupplierOrderText } from "../lib/purchase-orders/SupplierOrderPreparation.ts";

const persistedLines = [
  {
    productName: "Black Essential Hoodie",
    recommendedPacks: 2,
    recommendedUnits: 10,
    unitsPerPack: 5,
  },
  {
    productName: "Stone Cargo Trouser",
    recommendedPacks: 1,
    recommendedUnits: 6,
    unitsPerPack: 6,
  },
];

test("approved PO data generates concise deterministic supplier text", () => {
  const first = createSupplierOrderText({ supplierName: "Exclusive", lines: persistedLines });
  const second = createSupplierOrderText({ supplierName: "Exclusive", lines: persistedLines });

  assert.deepEqual(first, second);
  assert.match(first.orderText, /Purchase Order\nSupplier: Exclusive/);
  assert.match(first.orderText, /1\. Black Essential Hoodie\n   2 packs \/ 10 units \(5 per pack\)/);
  assert.equal(first.totalPacks, 3);
  assert.equal(first.totalUnits, 16);
});

test("supplier text contains persisted lines and excludes internal intelligence", () => {
  const changedLiveIntelligence = {
    demandScore: 99,
    urgency: "critical",
    suggestedPacks: 500,
  };
  const prepared = createSupplierOrderText({ supplierName: "Exclusive", lines: persistedLines });
  const preparedAfterLiveChange = createSupplierOrderText({
    supplierName: "Exclusive",
    lines: persistedLines,
  });

  assert.match(prepared.orderText, /Black Essential Hoodie/);
  assert.deepEqual(preparedAfterLiveChange, prepared);
  assert.equal(changedLiveIntelligence.suggestedPacks, 500);
  assert.doesNotMatch(
    prepared.orderText,
    /demand|urgency|wallet|reserve|confidence|source snapshot|reasoning/i,
  );
});

test("missing persisted unit evidence is reported rather than guessed", () => {
  const prepared = createSupplierOrderText({
    supplierName: "Exclusive",
    lines: [{ ...persistedLines[0], recommendedUnits: null }],
  });

  assert.equal(prepared.totalUnits, null);
  assert.match(prepared.orderText, /Total units: Unavailable/);
});

test("server preparation requires authentication and canonical approved state", async () => {
  const [repository, action] = await Promise.all([
    readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-orders/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(repository, /order\.data\.status !== "approved"/);
  assert.match(repository, /vault_purchase_order_lines/);
  assert.doesNotMatch(action, /PurchaseIntelligence|wallet|inventory|WhatsApp|fetch\(/);
  const preparation = repository.slice(
    repository.indexOf("export async function prepareApprovedPurchaseOrder"),
  );
  assert.doesNotMatch(preparation, /\.update\(|\.insert\(|\.upsert\(|\.delete\(/);
});

test("UI supports review and copy only, with no guessed supplier contact or send", async () => {
  const component = await readFile(
    new URL("../components/purchase-orders/SupplierOrderPreparation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /Nothing has been sent automatically/);
  assert.match(component, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(component, /wa\.me|api\.whatsapp|phone|telephone/);
});
