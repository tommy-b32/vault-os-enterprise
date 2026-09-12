import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/purchase-orders/PurchaseOrderRepository.ts", import.meta.url), "utf8");

test("approval source families remain exact and fail closed", () => {
  assert.match(source, /classifyPurchaseOrderApprovalSources/);
  assert.match(source, /purchase_intelligence_required/);
  assert.match(source, /purchase_intelligence_bring_forward/);
  assert.match(source, /fixed_pack_purchase_recommendation/);
  assert.match(source, /manual_fixed_pack_purchase/);
  assert.match(source, /PO_SOURCE_MIX_INVALID/);
  assert.match(source, /FixedPackApprovalQualification/);
});

test("approval qualification loads persisted line sources and classifies them", () => {
  const qualificationStart = source.indexOf("async function getCurrentApprovalQualification");
  const linesQuery = source.indexOf('.from("vault_purchase_order_lines")', qualificationStart);
  const sourceSelect = source.indexOf('.select("source_recommendation_type")', linesQuery);
  const classifierCall = source.indexOf("classifyPurchaseOrderApprovalSources(", linesQuery);
  const fixedPackGuard = source.indexOf('sourceFamily === "fixed_pack"', classifierCall);
  const fixedPackLines = source.indexOf('.select("id, supplier_id, style_id, recommended_packs, recommended_units, units_per_pack, pack_cost_gbp, line_cost_gbp, source_recommendation_type, source_snapshot")', fixedPackGuard);
  const fixedPackAllocations = source.indexOf('vault_purchase_order_line_size_allocations', fixedPackLines);
  const conservation = source.indexOf("validateFixedPackAllocationConservation(", fixedPackAllocations);
  const fixedPackQualification = source.indexOf('source_family: "fixed_pack"', fixedPackGuard);
  const piInputs = source.indexOf("const [catalogue, freshness, walletResult, suppliersResult, rulesResult]", qualificationStart);
  const piEvaluation = source.indexOf("PurchaseIntelligenceEngine.evaluate(", qualificationStart);
  assert.ok(qualificationStart >= 0); assert.ok(linesQuery > qualificationStart); assert.ok(sourceSelect > linesQuery); assert.ok(classifierCall > sourceSelect); assert.ok(fixedPackGuard > classifierCall); assert.ok(fixedPackLines > fixedPackGuard); assert.ok(fixedPackAllocations > fixedPackLines); assert.ok(conservation > fixedPackAllocations); assert.ok(fixedPackQualification > conservation); assert.ok(piInputs > fixedPackQualification); assert.ok(piEvaluation > piInputs);
});

test("fixed-pack routing does not change the existing legacy PI path", () => {
  const fixedPackGuard = source.indexOf('if (sourceFamily === "fixed_pack")');
  const fixedPackReturn = source.indexOf('source_family: "fixed_pack"', fixedPackGuard);
  const legacyPiWork = source.indexOf("PurchaseIntelligenceEngine.evaluate(", fixedPackGuard);
  assert.ok(fixedPackGuard >= 0); assert.ok(fixedPackReturn > fixedPackGuard); assert.ok(legacyPiWork > fixedPackReturn); assert.equal(source.match(/PurchaseIntelligenceEngine.evaluate\(/g)?.length, 1);
});
