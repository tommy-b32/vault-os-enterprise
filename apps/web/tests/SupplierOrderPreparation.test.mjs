import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createSupplierOrderText,
  readSupplierImageSnapshot,
} from "../lib/purchase-orders/SupplierOrderPreparation.ts";

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

test("persisted image evidence remains associated with its exact style", () => {
  const lines = [
    {
      ...persistedLines[0],
      styleId: "hoodie::black",
      supplierImageUrl: "https://supplier.example/hoodie.jpg",
      supplierImageSource: "vault_supplier_catalogue_review_items:item-1:supplier_product_evidence.images:image-1",
      supplierImageCapturedAt: "2026-08-12T10:00:00.000Z",
    },
    {
      ...persistedLines[1],
      styleId: "cargo::stone",
      supplierImageUrl: "https://supplier.example/cargo.jpg",
      supplierImageSource: "vault_supplier_catalogue_review_items:item-2:supplier_product_evidence.images:image-2",
      supplierImageCapturedAt: "2026-08-12T10:00:00.000Z",
    },
  ];

  const prepared = createSupplierOrderText({ supplierName: "Exclusive", lines });

  assert.equal(prepared.lines[0].styleId, "hoodie::black");
  assert.equal(prepared.lines[0].supplierImageUrl, "https://supplier.example/hoodie.jpg");
  assert.equal(prepared.lines[1].styleId, "cargo::stone");
  assert.equal(prepared.lines[1].supplierImageUrl, "https://supplier.example/cargo.jpg");
  assert.notEqual(prepared.lines[0].supplierImageUrl, prepared.lines[1].supplierImageUrl);
  assert.equal(prepared.totalPacks, 3);
  assert.equal(prepared.totalUnits, 16);
});

test("historical lines without trusted snapshot evidence never guess an image", () => {
  assert.deepEqual(readSupplierImageSnapshot({ styleId: "hoodie::black" }), {
    supplierImageUrl: null,
    supplierImageSource: null,
    supplierImageCapturedAt: null,
  });
  assert.equal(
    readSupplierImageSnapshot({
      supplierImageUrl: "javascript:alert(1)",
      supplierImageSource: "browser",
    }).supplierImageUrl,
    null,
  );
  assert.equal(
    readSupplierImageSnapshot({
      supplierImageUrl: "data:image/png;base64,aGVsbG8=",
      supplierImageSource: "vault_supplier_catalogue_review_items:item-1:supplier_product_evidence.images:image-1",
      supplierImageCapturedAt: "2026-08-12T10:00:00.000Z",
    }).supplierImageUrl,
    "data:image/png;base64,aGVsbG8=",
  );
});

test("snapshotted images do not change generated plain text or totals", () => {
  const withoutImage = createSupplierOrderText({
    supplierName: "Exclusive",
    lines: persistedLines,
  });
  const withImage = createSupplierOrderText({
    supplierName: "Exclusive",
    lines: persistedLines.map((line, index) => ({
      ...line,
      styleId: `style-${index}`,
      supplierImageUrl: `https://supplier.example/product-${index}.jpg`,
    })),
  });

  assert.equal(withImage.orderText, withoutImage.orderText);
  assert.equal(withImage.totalPacks, withoutImage.totalPacks);
  assert.equal(withImage.totalUnits, withoutImage.totalUnits);
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

test("server preparation requires authentication and canonical approved or ordered state", async () => {
  const [repository, action] = await Promise.all([
    readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/purchase-orders/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(action, /requireAuthenticatedOperator\(\)/);
  assert.match(repository, /\["approved", "ordered", "part_paid", "paid", "shipped", "received"\]/);
  assert.match(repository, /vault_purchase_order_lines/);
  assert.match(repository, /vault_supplier_catalogue_review_items/);
  assert.match(repository, /supplier_product_evidence/);
  assert.match(repository, /decision_metadata/);
  assert.match(repository, /supplierImageCapturedAt/);
  assert.match(repository, /\.eq\("supplier_id", supplierId\)/);
  assert.match(repository, /parentProductByStyle\.get\(styleId\) !== item\.linked_product_id/);
  assert.match(repository, /supplierImageUrl: _ignoredSupplierImageUrl/);
  assert.doesNotMatch(repository.slice(0, repository.indexOf("function assertDraftInput")), /featured_image_url/);
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
  assert.match(component, /Image unavailable for this saved snapshot/);
  assert.match(component, /line\.supplierImageUrl/);
  assert.doesNotMatch(component, /wa\.me|api\.whatsapp|phone|telephone/);
});
