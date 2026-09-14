import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isFuturePurchasingProduct,
  requiresCommercialCostRemediation,
  requiresExplicitReorderApproval,
  requiresSupplierMinimumRemediation,
  requiresTargetStockDaysRemediation,
} from "../lib/brain/ReorderApprovalEligibility.ts";
import { SupplierMinimumContract } from "../lib/supplier/SupplierMinimum.ts";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260804020000_product_reorder_approvals.sql",
  import.meta.url,
);

function approvalProduct(overrides = {}) {
  return {
    style_id: "parent::Black",
    parent_product_id: "parent",
    product_name: "Product",
    configuration_trusted: true,
    inventory_strategy: "stocked",
    restock_enabled: true,
    supplier_id: "supplier",
    reorder_approval: null,
    ...overrides,
  };
}

test("approval blocker is emitted only for a product eligible for explicit reorder approval", () => {
  assert.equal(requiresExplicitReorderApproval(approvalProduct()), true);

  for (const overrides of [
    { inventory_strategy: "discontinued" },
    { inventory_strategy: "do_not_restock" },
    { inventory_strategy: "dropship" },
    { restock_enabled: false },
    { configuration_trusted: false },
  ]) {
    assert.equal(requiresExplicitReorderApproval(approvalProduct(overrides)), false);
  }
});

test("classifier uses the shared explicit-approval gate for its approval blocker", async () => {
  const classifier = await readFile(
    new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url),
    "utf8",
  );

  assert.match(classifier, /requiresExplicitReorderApproval\(product\).*reorder_approval_missing/);
});

test("commercial-cost blocker requires a future-purchasing product with an active assigned supplier and invalid cost", () => {
  const activeSupplier = { active: true };
  assert.equal(isFuturePurchasingProduct(approvalProduct()), true);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), activeSupplier, null), true);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), activeSupplier, 0), true);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), activeSupplier, Number.NaN), true);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), activeSupplier, 10), false);
  assert.equal(requiresCommercialCostRemediation(approvalProduct({ supplier_id: null }), activeSupplier, null), false);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), null, null), false);
  assert.equal(requiresCommercialCostRemediation(approvalProduct(), { active: false }, null), false);

  for (const overrides of [
    { inventory_strategy: "discontinued" },
    { inventory_strategy: "do_not_restock" },
    { restock_enabled: false },
  ]) {
    assert.equal(isFuturePurchasingProduct(approvalProduct(overrides)), false);
    assert.equal(requiresCommercialCostRemediation(approvalProduct(overrides), activeSupplier, null), false);
  }
});

test("classifier gates invalid commercial cost with future-purchasing and active-supplier relevance", async () => {
  const classifier = await readFile(
    new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url),
    "utf8",
  );

  assert.match(classifier, /requiresCommercialCostRemediation\(product, supplier, commercial\.landed_cost_per_pack_gbp\)/);
  assert.match(classifier, /!product\.supplier_id \|\| !supplier\).*supplier_missing/s);
  assert.match(classifier, /else if \(!supplier\.active\).*supplier_inactive/s);
});

test("target-stock-days blocker applies only to future-replenishment products with missing or invalid days", () => {
  assert.equal(requiresTargetStockDaysRemediation(approvalProduct(), null), true);
  assert.equal(requiresTargetStockDaysRemediation(approvalProduct(), 0), true);
  assert.equal(requiresTargetStockDaysRemediation(approvalProduct(), 30), false);

  for (const overrides of [
    { inventory_strategy: "discontinued" },
    { inventory_strategy: "do_not_restock" },
    { inventory_strategy: "dropship" },
    { inventory_strategy: "service" },
    { restock_enabled: false },
  ]) {
    assert.equal(requiresTargetStockDaysRemediation(approvalProduct(overrides), null), false);
  }
});

test("classifier gates target-stock-days remediation with the future-purchasing predicate", async () => {
  const classifier = await readFile(
    new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url),
    "utf8",
  );

  assert.match(classifier, /requiresTargetStockDaysRemediation\(product, replenishment\.targetStockDays\)/);
});

test("supplier-minimum blocker requires a future-purchasing product, active supplier, and unknown policy", () => {
  const activeSupplier = { active: true };
  assert.equal(requiresSupplierMinimumRemediation(approvalProduct(), activeSupplier, "unknown"), true);
  assert.equal(requiresSupplierMinimumRemediation(approvalProduct(), null, "unknown"), false);
  assert.equal(requiresSupplierMinimumRemediation(approvalProduct(), { active: false }, "unknown"), false);

  for (const overrides of [
    { inventory_strategy: "discontinued" },
    { inventory_strategy: "do_not_restock" },
    { inventory_strategy: "dropship" },
    { restock_enabled: false },
  ]) {
    assert.equal(requiresSupplierMinimumRemediation(approvalProduct(overrides), activeSupplier, "unknown"), false);
  }
});

test("defined and explicitly not-applicable supplier policies remain trusted", () => {
  const exclusive = SupplierMinimumContract.create({ value: null, currency: "GBP", minimumOrderPacks: 20 });
  const noMinimum = SupplierMinimumContract.create({ value: 0, currency: "EUR", minimumOrderPacks: 0 });

  assert.equal(exclusive.state, "defined");
  assert.equal(noMinimum.state, "not_applicable");
  assert.equal(requiresSupplierMinimumRemediation(approvalProduct(), { active: true }, exclusive.state), false);
  assert.equal(requiresSupplierMinimumRemediation(approvalProduct(), { active: true }, noMinimum.state), false);
});

test("classifier gates supplier-minimum unknown with the shared relevance predicate", async () => {
  const classifier = await readFile(
    new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url),
    "utf8",
  );

  assert.match(classifier, /requiresSupplierMinimumRemediation\(product, supplier, supplierMinimum\.state\)/);
});

test("complete configuration requires an explicit active approval", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /configuration\.configuration_score = 100/);
  assert.match(sql, /configuration\.inventory_strategy = 'stocked'/);
  assert.match(sql, /configuration\.restock_enabled = true/);
  assert.match(sql, /approval\.approval_state = 'approved'/);
});

test("one approval row is retained per canonical parent product", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /product_id uuid not null references public\.vault_products\(id\)/);
  assert.match(sql, /unique \(product_id\)/);
  assert.doesNotMatch(sql, /style_id/);
  assert.doesNotMatch(sql, /insert into public\.vault_product_reorder_approvals/i);
});

test("revocation and later configuration changes remove canonical trust", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /approval_state in \('approved', 'revoked'\)/);
  assert.match(sql, /approval_state = 'revoked'.*revoked_by is not null.*revoked_at is not null/s);
  assert.match(sql, /configuration\.configuration_score = 100.*approval\.approval_state = 'approved'/s);
});

test("approval writes require an authorized operator and current eligibility", async () => {
  const source = await readFile(
    new URL("../app/catalogue/actions.ts", import.meta.url),
    "utf8",
  );

  assert.ok(source.indexOf("requireOperatorRole") < source.indexOf("vault_product_reorder_approvals"));
  assert.match(source, /configuration_trusted !== true/);
  assert.match(source, /inventory_strategy !== "stocked"/);
  assert.match(source, /restock_enabled !== true/);
});

test("Advisor reports missing approval without changing ranking", async () => {
  const [advisor, classifier] = await Promise.all([
    readFile(new URL("../lib/brain/AdvisorEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
  ]);

  assert.match(classifier, /reorder_approval_missing/);
  assert.match(classifier, /requiresExplicitReorderApproval\(product\)/);
  assert.match(advisor, /candidates: TrustedBuyingCandidateResult\[\]/);
  assert.match(advisor, /reorderApprovalMissing: countReason\("reorder_approval_missing"\)/);
});

test("editor copy distinguishes trusted configuration from pending reorder approval", async () => {
  const editor = await readFile(
    new URL("../components/catalogue/ProductEditor.tsx", import.meta.url),
    "utf8",
  );

  assert.match(editor, /Configuration complete/);
  assert.match(editor, /Explicit reorder approval is required before this product can be used in purchasing recommendations\./);
  assert.match(editor, /Configuration is trusted\. Explicit reorder approval is pending/);
  assert.match(editor, /Reorder approval/);
  assert.match(editor, /Required/);
  assert.match(editor, /Trusted for reorder/);
  assert.match(editor, /Granted/);
  assert.doesNotMatch(editor, /Reorder Engine/);
});
