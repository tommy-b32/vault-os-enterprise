import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stage3AttentionThresholdDays, stage3PackFit, stage3PrimaryReason, stage3StockState, stage3TargetStockDays } from "../lib/stock-reorder-presentation.ts";

const size = (overrides = {}) => ({ netAvailableStock: 10, calculatedDailyDemand: 1, projectedDaysCover: 15, remainingShortage: 0, projectedExcess: 0, drivesPackNeed: true, reasonCodes: [], ...overrides });
const recommendation = (overrides = {}) => ({ trusted: true, recommendedPackCount: 1, totalShortageRemainingUnits: 0, totalPackShapeExcessUnits: 0, warnings: [], reasonCodes: [], sizes: [size()], governedLeadTimeDays: 14, ...overrides });

test("Stage 3 translates the 45-day total target without replacing supplier lead time", () => {
  assert.equal(stage3TargetStockDays(14), 31);
  assert.equal(stage3TargetStockDays(21), 24);
  assert.equal(stage3AttentionThresholdDays(14), 21);
});

test("Stage 3 stock states fail closed and never call zero velocity healthy", () => {
  assert.equal(stage3StockState(recommendation({ trusted: false })), "INSUFFICIENT DATA");
  assert.equal(stage3StockState(recommendation({ sizes: [size({ netAvailableStock: 0 })] })), "OUT OF STOCK");
  assert.equal(stage3StockState(recommendation({ reasonCodes: ["ZERO_DEMAND"], sizes: [size({ calculatedDailyDemand: 0, projectedDaysCover: null })] })), "SLOW MOVING / NO RECENT VELOCITY");
  assert.equal(stage3StockState(recommendation({ sizes: [size({ netAvailableStock: 14 })] })), "REORDER NOW");
  assert.equal(stage3StockState(recommendation({ sizes: [size({ netAvailableStock: 20 })] })), "REORDER ATTENTION");
  assert.equal(stage3StockState(recommendation({ sizes: [size({ netAvailableStock: 22 })] })), "HEALTHY");
  assert.equal(stage3StockState(recommendation({ recommendedPackCount: 0, sizes: [size({ netAvailableStock: 14 })] })), "REORDER NOW");
  assert.equal(stage3StockState(recommendation({ recommendedPackCount: 0, sizes: [size({ netAvailableStock: 20 })] })), "REORDER ATTENTION");
  assert.equal(stage3StockState(recommendation({ recommendedPackCount: 0, sizes: [size({ netAvailableStock: 22 })] })), "HEALTHY");
});

test("Stage 3 pack fit only classifies existing governed outcomes", () => {
  assert.equal(stage3PackFit(recommendation({ recommendedPackCount: 0 })), "DO NOT REORDER");
  assert.equal(stage3PackFit(recommendation()), "GOOD FIT");
  assert.equal(stage3PackFit(recommendation({ totalPackShapeExcessUnits: 1 })), "ACCEPTABLE");
  assert.equal(stage3PackFit(recommendation({ totalShortageRemainingUnits: 1 })), "REVIEW");
  assert.equal(stage3PackFit(recommendation({ trusted: false, recommendedPackCount: 0 })), null);
});

test("trusted zero recommendations reach the Stage 3 presentation without becoming purchases", async () => {
  const panel = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /recommendations\.filter\(\(result\) => result\.recommendation\.trusted\)\.map/);
  assert.doesNotMatch(panel, /Stage3ActionableRows recommendations=\{buyNow\.map/);
});

test("zero demand takes presentation priority without changing single-size wait wording", async () => {
  assert.equal(stage3PrimaryReason(["ZERO_DEMAND", "ALL_SIZES_ABOVE_TARGET"]), "No recent sales demand currently justifies replenishment for this colour/design.");
  assert.equal(stage3PrimaryReason(["ALL_SIZES_ABOVE_TARGET"], true), "No recent sales demand currently justifies replenishment for this colour/design.");
  assert.equal(stage3PrimaryReason(["ALL_SIZES_ABOVE_TARGET"]), null);
  assert.equal(stage3PrimaryReason(["SINGLE_SIZE_NEED_WAIT"]), null);
  const panel = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /zeroDemandDominant=\{zeroDemandDominant\}/);
  assert.match(panel, /Only one size currently needs stock\. A full pack would create unnecessary excess in other sizes\./);
});
