import assert from "node:assert/strict";
import test from "node:test";
import { projectSizeDemandEvidence } from "../lib/brain/SizeDemandEvidence.ts";

function row(size, stock, sold, overrides = {}) { return { model_size_id: `style::${size}`, style_id: "style", parent_product_id: "parent", model_design: "Navy", normalized_size: size, available_stock: stock, committed_stock: 0, incoming_stock: 0, net_available_stock: stock, sales_7_day_units: sold, sales_14_day_units: sold, sales_30_day_units: sold, average_daily_sales: sold / 30, last_sale_date: null, days_since_last_sale: null, inventory_freshness: "current", order_history_freshness: "current", sales_history_30_complete: true, style_sales_mapping_complete: true, style_unresolved_clean_sales_units: 0, global_sales_mapping_complete: true, global_unresolved_clean_sales_units: 0, global_unmatched_clean_sales_units: 0, trusted: true, missing_requirements: [], ...overrides }; }

test("size demand evidence calculates factual serviceability and exposure from observed attributable units", () => {
  const all = projectSizeDemandEvidence([row("S", 2, 8), row("M", 1, 12)])[0];
  assert.equal(all.sizeEvidenceAvailable, true);
  assert.equal(all.sizeEvidenceUnavailableReason, null);
  assert.equal(all.sizeDistributionEstablishment, "not_evaluated");
  assert.equal(all.historicalAvailabilityCensoring, "not_evaluated");
  assert.equal(all.demandServiceableShare, 1); assert.equal(all.demandExposedShare, 0);
  const exposed = projectSizeDemandEvidence([row("S", 2, 8), row("M", 0, 12), row("L", -1, 0)])[0];
  assert.equal(exposed.totalSizeAttributableUnits, 20); assert.equal(exposed.demandServiceableShare, .4); assert.equal(exposed.demandExposedShare, .6); assert.deepEqual(exposed.unavailableDemandedSizes, ["M"]); assert.equal(exposed.sizes.find((size) => size.canonicalSize === "L").currentlyServiceable, false);
});

test("size demand evidence fails closed for untrusted attribution and never invents zero-sales demand", () => {
  const unavailable = projectSizeDemandEvidence([row("S", 1, null, { trusted: false, sales_30_day_units: null, missing_requirements: ["style_sales_mapping_incomplete"] })])[0];
  assert.equal(unavailable.sizeEvidenceAvailable, false);
  assert.equal(unavailable.sizeEvidenceUnavailableReason, "style_sales_mapping_incomplete");
  assert.equal(unavailable.totalSizeAttributableUnits, null); assert.equal(unavailable.sizes[0].observedDemandShare, null);
  const zero = projectSizeDemandEvidence([row("S", 1, 0), row("M", 0, 0)])[0];
  assert.equal(zero.totalSizeAttributableUnits, 0); assert.equal(zero.demandServiceableShare, null); assert.equal(zero.demandExposedShare, null);
});

test("canonical styles remain separate", () => {
  const other = { ...row("S", 1, 1), model_size_id: "other::S", style_id: "other", model_design: "White" };
  const projection = projectSizeDemandEvidence(
    [row("S", 1, 1), other],
    new Map([["style", "SUFFICIENT_EVIDENCE"]]),
  );
  assert.deepEqual(projection.map((item) => item.canonicalStyleId), ["other", "style"]);
  assert.equal(projection[1].tradingEvidenceMaturity, "SUFFICIENT_EVIDENCE");
  assert.equal(projection[1].sizeDistributionEstablishment, "not_evaluated");
});
