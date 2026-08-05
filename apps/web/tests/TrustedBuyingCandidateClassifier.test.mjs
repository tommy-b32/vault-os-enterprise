import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { BuyingRecommendationEngine } from "../lib/brain/BuyingRecommendationEngine.ts";
import { CommercialOpportunityEngine } from "../lib/brain/CommercialOpportunityEngine.ts";

const classifierUrl = new URL(
  "../lib/brain/TrustedBuyingCandidateClassifier.ts",
  import.meta.url,
);

function quantityProduct() {
  return {
    style_id: "parent::Black",
    parent_product_id: "parent",
    product_name: "Product",
    supplier_moq_packs: 10,
    stock_on_hand: 0,
    inventory_strategy: "stocked",
    restock_enabled: true,
    configuration_trusted: true,
    trusted_for_reorder: true,
    sales_intelligence: {
      average_daily_sales: 1,
      average_weekly_sales: 7,
      average_monthly_sales: null,
      reorder_point: null,
      safety_stock: 0,
    },
    commercial_cost: {
      units_per_pack: 5,
      pack_cost: 10,
      currency: "GBP",
      estimated_gross_profit_per_unit: 5,
      commercial_cost_trusted: true,
    },
    replenishment_intelligence: {
      stockOnHand: 0,
      averageDailySales: 1,
      supplierLeadTimeDays: 7,
      targetStockDays: 14,
      unitsPerPack: 5,
      supplierMoqPacks: 10,
      trusted: true,
      missingRequirements: [],
    },
  };
}

test("classifier is upstream of Advisor without a circular import", async () => {
  const [classifier, advisor] = await Promise.all([
    readFile(classifierUrl, "utf8"),
    readFile(new URL("../lib/brain/AdvisorEngine.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(classifier, /AdvisorEngine/);
  assert.match(classifier, /BuyingRecommendationEngine\.buildRecommendation/);
  assert.match(advisor, /TrustedBuyingCandidateResult/);
  assert.doesNotMatch(advisor, /BuyingRecommendationEngine/);
});

test("classifier owns established ineligible gates and thresholds", async () => {
  const source = await readFile(classifierUrl, "utf8");
  for (const reason of [
    "configuration_untrusted",
    "reorder_approval_missing",
    "supplier_inactive",
    "invalid_or_missing_commercial_cost",
    "profitability_incomplete",
    "margin_below_threshold",
    "return_below_threshold",
    "replenishment_untrusted",
  ]) assert.match(source, new RegExp(`add\\(reasons, "${reason}"\\)`));
  assert.match(source, /TRUSTED_BUYING_MARGIN_PERCENT = 45/);
  assert.match(source, /TRUSTED_BUYING_RETURN_PERCENT = 100/);
});

test("calculated quantity and MOQ remain distinct and unresolved", async () => {
  const recommendation = BuyingRecommendationEngine.buildRecommendation({
    product: quantityProduct(),
  });
  const source = await readFile(classifierUrl, "utf8");
  assert.equal(recommendation.calculatedQuantity, 3);
  assert.equal(recommendation.minimumRequiredQuantity, 10);
  assert.equal(recommendation.suggestedPacks, 10);
  assert.match(source, /buying\.calculatedQuantity < buying\.minimumRequiredQuantity/);
  assert.match(source, /quantity_below_minimum_policy_unresolved/);
});

test("supplier minimum and wallet gaps remain policy blockers", async () => {
  const source = await readFile(classifierUrl, "utf8");
  assert.match(source, /supplierMinimum\.state === "unknown"/);
  assert.match(source, /supplier_minimum_not_evaluated/);
  assert.match(source, /minimumEvaluation = "currency_unavailable"/);
  assert.match(source, /wallet_unavailable/);
  assert.match(source, /wallet_freshness_policy_missing/);
  assert.match(source, /reserveProtected: null/);
  assert.doesNotMatch(source, /CapitalEngine\.review/);
});

test("Advisor admits only eligible candidates", async () => {
  const advisor = await readFile(
    new URL("../lib/brain/AdvisorEngine.ts", import.meta.url),
    "utf8",
  );
  assert.match(advisor, /filter\(\(candidate\) => candidate\.status === "eligible"\)/);
  assert.doesNotMatch(advisor, /MINIMUM_MARGIN_PERCENT|LOW_STOCK_THRESHOLD/);
});

test("commercial opportunity uses unit-correct canonical profit", () => {
  const opportunity = CommercialOpportunityEngine.create({
    productId: "parent::Black",
    supplierId: "supplier-1",
    productName: "Product",
    supplierName: "Supplier",
    marginPercent: 60,
    returnOnCapital: 150,
    grossProfitPerUnit: 5,
    estimatedGrossProfit: 75,
    stockRemaining: 0,
    recommendedOrderQuantity: 3,
    purchaseCost: 10,
  });
  assert.equal(opportunity.estimatedProfit, 75);
});

test("Purchase Orders classifies upstream and renders Advisor ranking only", async () => {
  const source = await readFile(
    new URL("../app/purchase-orders/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /TrustedBuyingCandidateClassifier\.classify/);
  assert.match(source, /advisor\.analysis\.ranked/);
  assert.doesNotMatch(source, /BuyingRecommendationEngine/);
});
