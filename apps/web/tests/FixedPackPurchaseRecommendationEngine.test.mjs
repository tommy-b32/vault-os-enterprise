import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXED_PACK_PURCHASE_REASON_CODES,
  FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES,
  FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES,
  calculateIdealSizeNeed,
  hasConservedPackComposition,
  packCompositionTotal,
  simulateFixedPackCandidates,
  selectFixedPackPurchaseCandidate,
} from "../lib/brain/FixedPackPurchaseRecommendationEngine.ts";

let assertionCount = 0;

function equal(actual, expected) {
  assertionCount += 1;
  assert.equal(actual, expected);
}

function deepEqual(actual, expected) {
  assertionCount += 1;
  assert.deepEqual(actual, expected);
}

test("standard fixed pack fixture is canonical and conserves five units", () => {
  const fixture = FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.standard5Pack;
  deepEqual(fixture.composition.map((size) => size.normalizedSize), ["S", "M", "L", "XL", "2XL"]);
  equal(fixture.composition.length, 5);
  equal(packCompositionTotal(fixture.composition), 5);
  equal(hasConservedPackComposition(fixture), true);
});

test("six-unit fixture is explicit composition data and conserves six units", () => {
  const fixture = FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.sixUnitPack;
  equal(fixture.composition.length, 6);
  equal(fixture.composition.some((size) => size.normalizedSize === "3XL"), true);
  equal(packCompositionTotal(fixture.composition), 6);
  equal(hasConservedPackComposition(fixture), true);
  equal(JSON.stringify(fixture).includes("polo"), false);
});

test("fixtures preserve supplier/style identity and canonical Default data", () => {
  const standard = FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.standard5Pack;
  const secondSupplier = { ...standard, supplierId: "00000000-0000-0000-0000-000000000011" };
  equal(standard.styleId, secondSupplier.styleId);
  assert.notEqual(standard.supplierId, secondSupplier.supplierId);
  assertionCount += 1;
  equal(standard.modelDesign, "Default");
  equal(standard.sizeEvidence.every((size) => size.modelSizeId.includes("::Default::")), true);
});

test("status and reason vocabularies are finite and support unavailable separately from zero", () => {
  deepEqual(FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES, ["recommended", "zero_recommendation", "unavailable"]);
  equal(FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES.includes("zero_recommendation"), true);
  equal(FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES.includes("unavailable"), true);
  equal(FIXED_PACK_PURCHASE_REASON_CODES.includes("PACK_COMPOSITION_MISSING"), true);
  equal(FIXED_PACK_PURCHASE_REASON_CODES.includes("SIZE_DRIVES_PACK_PURCHASE"), true);
  equal(FIXED_PACK_PURCHASE_REASON_CODES.includes("NEGATIVE_NET_STOCK"), true);
});

test("future recommendation null and zero semantics remain distinct without selection logic", () => {
  const unavailable = { recommendedPackCount: null, status: "unavailable" };
  const zero = { recommendedPackCount: 0, status: "zero_recommendation" };
  equal(unavailable.recommendedPackCount, null);
  equal(zero.recommendedPackCount, 0);
  assert.notDeepEqual(unavailable, zero);
  assertionCount += 1;
});

test("deterministic fixtures carry stock conditions without purchasable per-size quantities", () => {
  const fixtures = FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES;
  equal(fixtures.hotSingleSize.sizeEvidence.find((size) => size.normalizedSize === "L")?.netAvailableStock, 0);
  equal(fixtures.balancedNeed.sizeEvidence.every((size) => size.netAvailableStock === 0), true);
  equal(fixtures.overstocked.sizeEvidence.every((size) => size.netAvailableStock === 20), true);
  equal(fixtures.incomingStock.sizeEvidence.every((size) => size.incomingStock === 5), true);
  equal(fixtures.committedStock.sizeEvidence.every((size) => size.committedStock === 4), true);
  equal(JSON.stringify(fixtures).includes("option"), false);
  equal(JSON.stringify(fixtures).includes("sku"), false);
  equal(JSON.stringify(fixtures).includes("title"), false);
});

function idealInput(overrides = {}) {
  return {
    evidence: {
      ...FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.standard5Pack.sizeEvidence[0],
      sales7DayUnits: 7,
      sales14DayUnits: 14,
      sales30DayUnits: 30,
      averageDailySales: 1,
      availableStock: 1,
      committedStock: 0,
      incomingStock: 0,
      netAvailableStock: 1,
      ...overrides,
    },
    targetStockDays: 7,
    supplierLeadTimeDays: 3,
  };
}

test("ideal need mirrors the existing weighted 7/14/30 demand formula", () => {
  const result = calculateIdealSizeNeed(idealInput());
  equal(result.status, "available");
  equal(result.trusted, true);
  equal(result.calculatedDailyDemand, (7 / 7 * 0.70) + (7 / 7 * 0.20) + (16 / 16 * 0.10));
  equal(result.coverageDays, 10);
  equal(result.targetStockUnits, 10);
  equal(result.idealNeedUnits, 9);
  equal(result.blockers.length, 0);
});

test("ideal need preserves valid zero demand and sufficient-stock zero need", () => {
  const zeroDemand = calculateIdealSizeNeed(idealInput({
    sales7DayUnits: 0, sales14DayUnits: 0, sales30DayUnits: 0, averageDailySales: 0,
  }));
  equal(zeroDemand.targetStockUnits, 0);
  equal(zeroDemand.idealNeedUnits, 0);
  equal(zeroDemand.reasonCodes.includes("ZERO_DEMAND"), true);
  equal(zeroDemand.status, "available");

  const sufficientStock = calculateIdealSizeNeed(idealInput({ netAvailableStock: 20 }));
  equal(sufficientStock.targetStockUnits, 10);
  equal(sufficientStock.idealNeedUnits, 0);
});

test("ideal need uses canonical net stock once, including negative, incoming, and committed stock", () => {
  const negative = calculateIdealSizeNeed(idealInput({ netAvailableStock: -2 }));
  equal(negative.idealNeedUnits, 12);
  equal(negative.reasonCodes.includes("NEGATIVE_NET_STOCK"), true);

  const incoming = calculateIdealSizeNeed(idealInput({ availableStock: 0, incomingStock: 5, netAvailableStock: 5 }));
  equal(incoming.idealNeedUnits, 5);
  equal(incoming.reasonCodes.includes("INCOMING_STOCK_REDUCES_NEED"), true);

  const committed = calculateIdealSizeNeed(idealInput({ availableStock: 5, committedStock: 4, netAvailableStock: 1 }));
  equal(committed.idealNeedUnits, 9);
  equal(committed.reasonCodes.includes("COMMITTED_STOCK_INCREASES_NEED"), true);
});

test("missing or invalid policy and unsafe evidence fail closed", () => {
  const targetMissing = calculateIdealSizeNeed({ ...idealInput(), targetStockDays: null });
  equal(targetMissing.status, "unavailable");
  equal(targetMissing.blockers.includes("TARGET_STOCK_POLICY_MISSING"), true);
  const targetInvalid = calculateIdealSizeNeed({ ...idealInput(), targetStockDays: -1 });
  equal(targetInvalid.blockers.includes("TARGET_STOCK_POLICY_MISSING"), true);
  const leadInvalid = calculateIdealSizeNeed({ ...idealInput(), supplierLeadTimeDays: -1 });
  equal(leadInvalid.blockers.includes("LEAD_TIME_POLICY_MISSING"), true);
  const incompleteHistory = calculateIdealSizeNeed(idealInput({ salesHistory30Complete: false }));
  equal(incompleteHistory.blockers.includes("SALES_HISTORY_INCOMPLETE"), true);
  const staleInventory = calculateIdealSizeNeed(idealInput({ missingRequirements: ["inventory_stale"] }));
  equal(staleInventory.blockers.includes("INVENTORY_STALE"), true);
  const staleOrders = calculateIdealSizeNeed(idealInput({ missingRequirements: ["sales_history_stale"] }));
  equal(staleOrders.blockers.includes("ORDER_HISTORY_STALE"), true);
  const styleMapping = calculateIdealSizeNeed(idealInput({ styleSalesMappingComplete: false }));
  equal(styleMapping.blockers.includes("SALES_MAPPING_INCOMPLETE"), true);
  const unresolvedSales = calculateIdealSizeNeed(idealInput({ styleUnresolvedCleanSalesUnits: 1 }));
  equal(unresolvedSales.blockers.includes("SALES_MAPPING_INCOMPLETE"), true);
  const globalMapping = calculateIdealSizeNeed(idealInput({ globalUnmatchedCleanSalesUnits: 1 }));
  equal(globalMapping.status, "available");
  const unavailableSales = calculateIdealSizeNeed(idealInput({ sales7DayUnits: null }));
  equal(unavailableSales.blockers.includes("SIZE_EVIDENCE_MISSING"), true);
});

test("ideal calculation is deterministic and does not select packs", () => {
  const input = idealInput();
  deepEqual(calculateIdealSizeNeed(input), calculateIdealSizeNeed(input));
  equal(input.evidence.averageDailySales, 1);
  equal("recommendedPackCount" in calculateIdealSizeNeed(input), false);
  equal("purchasedUnitsFromPacks" in calculateIdealSizeNeed(input), false);
});

test("approved early evidence permits only canonically clean new-style size calculations", () => {
  const early = calculateIdealSizeNeed({ ...idealInput({ salesHistory30Complete: false }), styleSales7DayUnits: 3 });
  equal(early.status, "available");
  equal(early.historyEligibility, "early_evidence");
  const early14 = calculateIdealSizeNeed({ ...idealInput({ salesHistory30Complete: false }), styleSales7DayUnits: 2, styleSales14DayUnits: 5 });
  equal(early14.status, "available");
  const insufficient = calculateIdealSizeNeed({ ...idealInput({ salesHistory30Complete: false }), styleSales7DayUnits: 2, styleSales14DayUnits: 4 });
  equal(insufficient.status, "unavailable");
  const stale = calculateIdealSizeNeed({ ...idealInput({ salesHistory30Complete: false, missingRequirements: ["inventory_stale"] }), styleSales7DayUnits: 3 });
  equal(stale.status, "unavailable");
});

function simulationInput({
  fixture = FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.standard5Pack,
  needsBySize = {},
  candidatePackCounts = [0, 1, 2, 3],
} = {}) {
  const sizeEvidence = fixture.sizeEvidence.map((evidence) => ({
    ...evidence,
    ...(needsBySize[evidence.normalizedSize]?.evidence ?? {}),
  }));
  const idealSizeNeeds = sizeEvidence.map((evidence) => {
    const values = needsBySize[evidence.normalizedSize] ?? {};
    const targetStockUnits = values.targetStockUnits ?? 2;
    const idealNeedUnits = values.idealNeedUnits ?? Math.max(0, targetStockUnits - evidence.netAvailableStock);
    return {
      modelSizeId: evidence.modelSizeId,
      normalizedSize: evidence.normalizedSize,
      calculatedDailyDemand: values.calculatedDailyDemand ?? 1,
      coverageDays: 2,
      targetStockUnits,
      idealNeedUnits,
      trusted: true,
      status: "available",
      blockers: [],
      reasonCodes: [],
    };
  });
  return {
    declaredUnitsPerPack: fixture.declaredUnitsPerPack,
    composition: fixture.composition,
    sizeEvidence,
    idealSizeNeeds,
    candidatePackCounts,
  };
}

test("candidate zero is a factual baseline and standard packs conserve units", () => {
  const candidates = simulateFixedPackCandidates(simulationInput({
    needsBySize: { S: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2 }, XL: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2 }, "2XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2 } },
  }));
  equal(candidates[0].packCount, 0);
  equal(candidates[0].totalUnitsPurchased, 0);
  equal(candidates[0].totalShortageRemainingUnits, 10);
  equal(candidates[1].totalUnitsPurchased, 5);
  equal(candidates[1].sizeImpacts.every((size) => size.purchasedUnitsFromPacks === 1), true);
  equal(candidates[2].totalUnitsPurchased, 10);
  equal(candidates[2].totalShortageRemainingUnits, 0);
  equal(candidates[3].totalPackShapeExcessUnits, 5);
  equal(candidates[3].sizeImpacts.every((size) => size.projectedExcessUnits === 1), true);
});

test("hot-size candidates show factual shortage and excess without selection", () => {
  const candidates = simulateFixedPackCandidates(simulationInput({
    needsBySize: { S: { evidence: { netAvailableStock: 0 }, targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, M: { evidence: { netAvailableStock: 0 }, targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, L: { evidence: { netAvailableStock: 0 }, targetStockUnits: 4, idealNeedUnits: 4 }, XL: { evidence: { netAvailableStock: 0 }, targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, "2XL": { evidence: { netAvailableStock: 0 }, targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 } },
    candidatePackCounts: [4, 2, 0, 3, 1],
  }));
  deepEqual(candidates.map((candidate) => candidate.packCount), [0, 1, 2, 3, 4]);
  deepEqual(candidates.map((candidate) => candidate.sizeImpacts.find((size) => size.normalizedSize === "L")?.projectedShortageUnits), [4, 3, 2, 1, 0]);
  equal(candidates[4].totalUnitsPurchased, 20);
  equal(candidates[4].totalPackShapeExcessUnits, 16);
  equal("recommendedPackCount" in candidates[4], false);
});

test("six-unit, zero-demand, excess attribution, and negative stock simulation are exact", () => {
  const six = simulateFixedPackCandidates(simulationInput({
    fixture: FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES.sixUnitPack,
    needsBySize: { S: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 }, XL: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 }, "2XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 }, "3XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1 } },
    candidatePackCounts: [1],
  }))[0];
  equal(six.totalUnitsPurchased, 6);
  equal(six.sizeImpacts.find((size) => size.normalizedSize === "3XL")?.purchasedUnitsFromPacks, 1);

  const zeroDemand = simulateFixedPackCandidates(simulationInput({
    needsBySize: { S: { targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, M: { targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, L: { targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, XL: { targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 }, "2XL": { targetStockUnits: 0, idealNeedUnits: 0, calculatedDailyDemand: 0 } },
    candidatePackCounts: [0, 1],
  }));
  equal(zeroDemand[0].totalPackShapeExcessUnits, 0);
  equal(zeroDemand[1].totalPackShapeExcessUnits, 5);
  equal(zeroDemand[1].sizeImpacts.every((size) => size.projectedDaysCover === null), true);

  const preexisting = simulateFixedPackCandidates(simulationInput({ needsBySize: { S: { evidence: { netAvailableStock: 5 }, targetStockUnits: 2, idealNeedUnits: 0 } }, candidatePackCounts: [1] }))[0];
  equal(preexisting.sizeImpacts.find((size) => size.normalizedSize === "S")?.packShapeExcessUnits, 1);
  const negative = simulateFixedPackCandidates(simulationInput({ needsBySize: { S: { evidence: { netAvailableStock: -2 }, targetStockUnits: 3, idealNeedUnits: 5 } }, candidatePackCounts: [1] }))[0];
  equal(negative.sizeImpacts.find((size) => size.normalizedSize === "S")?.projectedStockUnits, -1);
  equal(negative.sizeImpacts.find((size) => size.normalizedSize === "S")?.projectedShortageUnits, 4);
});

test("candidate simulation rejects malformed composition, counts, and unavailable needs", () => {
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), declaredUnitsPerPack: 4 })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), composition: [{ normalizedSize: "S", unitsPerPack: 1 }, { normalizedSize: "S", unitsPerPack: 1 }] })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), composition: [{ normalizedSize: "S", unitsPerPack: 0 }] })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), composition: [{ normalizedSize: "S", unitsPerPack: 1.5 }] })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), candidatePackCounts: [-1] })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), candidatePackCounts: [1.5] })); assertionCount += 1;
  assert.throws(() => simulateFixedPackCandidates({ ...simulationInput(), candidatePackCounts: [0, 0] })); assertionCount += 1;
  const unavailable = simulationInput(); unavailable.idealSizeNeeds[0] = { ...unavailable.idealSizeNeeds[0], status: "unavailable", trusted: false, idealNeedUnits: null };
  assert.throws(() => simulateFixedPackCandidates(unavailable)); assertionCount += 1;
});

function selectFromNeeds(needsBySize, styleSales7DayUnits = 0, options = {}) {
  return selectFixedPackPurchaseCandidate({
    candidates: simulateFixedPackCandidates(simulationInput({ needsBySize, candidatePackCounts: [0, 1, 2, 3, 4] })),
    styleSales7DayUnits,
    commercialPackConsistent: options.commercialPackConsistent ?? true,
    historyEligibility: options.historyEligibility ?? "established",
  });
}

test("selection applies approved one-, two-, and broad-size rules without MOQ", () => {
  const none = selectFromNeeds({});
  equal(none.recommendedPackCount, 0);
  const oneNormal = selectFromNeeds({ L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 4, targetStockUnits: 4 } });
  equal(oneNormal.recommendedPackCount, 0);
  const oneFast = selectFromNeeds({ L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 4, targetStockUnits: 4 } }, 4);
  equal(oneFast.recommendedPackCount, 0);
  const twoNormal = selectFromNeeds({ M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } });
  equal(twoNormal.recommendedPackCount, 0);
  const twoFast = selectFromNeeds({ M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } }, 4);
  equal(twoFast.recommendedPackCount, 1);
  const broad = selectFromNeeds({ S: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 0, targetStockUnits: 0 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2, targetStockUnits: 2 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 }, XL: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2, targetStockUnits: 2 }, "2XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 0, targetStockUnits: 0 } });
  equal(broad.recommendedPackCount, 2);
  equal(broad.reasonCodes.includes("INCREMENTAL_PACK_ONLY_SERVES_ONE_SIZE"), true);
});

test("selection applies the one-pack FAST buffer and cap without bypasses", () => {
  const allOne = { S: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, XL: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, "2XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } };
  equal(selectFromNeeds(allOne).recommendedPackCount, 1);
  equal(selectFromNeeds(allOne, 4).recommendedPackCount, 2);
  const allTwo = Object.fromEntries(Object.keys(allOne).map((size) => [size, { evidence: { netAvailableStock: 0 }, idealNeedUnits: 2, targetStockUnits: 2 }]));
  equal(selectFromNeeds(allTwo).recommendedPackCount, 2);
  equal(selectFromNeeds(allTwo, 4).recommendedPackCount, 3);
  const capped = selectFromNeeds({ S: { evidence: { netAvailableStock: 5 }, idealNeedUnits: 1, targetStockUnits: 5 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } });
  equal(capped.recommendedPackCount, 1);
  const capFive = selectFromNeeds({ S: { evidence: { netAvailableStock: 5 }, idealNeedUnits: 1, targetStockUnits: 1 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } });
  equal(capFive.recommendedPackCount, 0);
});

test("commercial and early-evidence policy retain null versus zero semantics", () => {
  const candidates = simulateFixedPackCandidates(simulationInput({ needsBySize: { M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 1, targetStockUnits: 1 } }, candidatePackCounts: [0, 1] }));
  const mismatch = selectFixedPackPurchaseCandidate({ candidates, styleSales7DayUnits: 4, commercialPackConsistent: false, historyEligibility: "established" });
  equal(mismatch.status, "unavailable");
  equal(mismatch.recommendedPackCount, null);
  const unavailableCommercial = selectFixedPackPurchaseCandidate({ candidates, styleSales7DayUnits: 4, commercialPackConsistent: null, historyEligibility: "early_evidence" });
  equal(unavailableCommercial.recommendedPackCount, 1);
  equal(unavailableCommercial.warnings.includes("COMMERCIAL_PACK_UNAVAILABLE"), true);
  equal(unavailableCommercial.reasonCodes.includes("EARLY_EVIDENCE_ELIGIBLE"), true);
});

test("hardening rejects inconsistent sales windows and non-finite inventory without coercion", () => {
  const inconsistent14 = calculateIdealSizeNeed(idealInput({ sales7DayUnits: 3, sales14DayUnits: 2 }));
  equal(inconsistent14.status, "unavailable");
  equal(inconsistent14.blockers.includes("SALES_WINDOW_INCONSISTENT"), true);
  const inconsistent30 = calculateIdealSizeNeed(idealInput({ sales14DayUnits: 5, sales30DayUnits: 4 }));
  equal(inconsistent30.blockers.includes("SALES_WINDOW_INCONSISTENT"), true);
  const fractional = calculateIdealSizeNeed(idealInput({ sales7DayUnits: 1.5 }));
  equal(fractional.blockers.includes("SALES_WINDOW_INCONSISTENT"), true);
  const negative = calculateIdealSizeNeed(idealInput({ sales7DayUnits: -1 }));
  equal(negative.blockers.includes("SALES_WINDOW_INCONSISTENT"), true);
  const nonFiniteStock = calculateIdealSizeNeed(idealInput({ netAvailableStock: Number.POSITIVE_INFINITY }));
  equal(nonFiniteStock.status, "unavailable");
});

test("selection fails closed for sparse or exhausted candidate ranges", () => {
  const broadNeeds = { S: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 }, M: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 }, L: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 }, XL: { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 }, "2XL": { evidence: { netAvailableStock: 0 }, idealNeedUnits: 3, targetStockUnits: 3 } };
  const sparse = simulateFixedPackCandidates(simulationInput({ needsBySize: broadNeeds, candidatePackCounts: [0, 1, 3] }));
  const sparseSelection = selectFixedPackPurchaseCandidate({ candidates: sparse, styleSales7DayUnits: 0, commercialPackConsistent: true, historyEligibility: "established" });
  equal(sparseSelection.status, "unavailable");
  equal(sparseSelection.blockers.includes("CANDIDATE_RANGE_EXHAUSTED"), true);
  const exhausted = simulateFixedPackCandidates(simulationInput({ needsBySize: broadNeeds, candidatePackCounts: [0, 1, 2] }));
  const exhaustedSelection = selectFixedPackPurchaseCandidate({ candidates: exhausted, styleSales7DayUnits: 0, commercialPackConsistent: true, historyEligibility: "established" });
  equal(exhaustedSelection.recommendedPackCount, null);
  equal(exhaustedSelection.blockers.includes("CANDIDATE_RANGE_EXHAUSTED"), true);
});

test("adversarial composition and explicit non-uniform packs retain deterministic conservation", () => {
  const input = simulationInput({ candidatePackCounts: [0, 1, 2] });
  input.declaredUnitsPerPack = 6;
  input.composition = [{ normalizedSize: "XL", unitsPerPack: 1 }, { normalizedSize: "M", unitsPerPack: 2 }, { normalizedSize: "S", unitsPerPack: 1 }, { normalizedSize: "L", unitsPerPack: 2 }];
  input.sizeEvidence = input.sizeEvidence.filter((row) => ["S", "M", "L", "XL"].includes(row.normalizedSize)).map((row) => ({ ...row, netAvailableStock: 0 }));
  input.idealSizeNeeds = input.idealSizeNeeds.filter((row) => ["S", "M", "L", "XL"].includes(row.normalizedSize)).map((row) => ({ ...row, targetStockUnits: 2, idealNeedUnits: 2 }));
  const candidates = simulateFixedPackCandidates(input);
  equal(candidates[1].totalUnitsPurchased, 6);
  deepEqual(candidates[1].sizeImpacts.map((size) => [size.normalizedSize, size.purchasedUnitsFromPacks]), [["S", 1], ["M", 2], ["L", 2], ["XL", 1]]);
  equal(candidates[2].sizeImpacts.reduce((sum, size) => sum + size.purchasedUnitsFromPacks, 0), 12);
  const duplicateEvidence = simulationInput(); duplicateEvidence.sizeEvidence.push({ ...duplicateEvidence.sizeEvidence[0] });
  assert.throws(() => simulateFixedPackCandidates(duplicateEvidence)); assertionCount += 1;
});

test("deterministic generated candidates preserve monotonic invariants", () => {
  for (let need = 0; need <= 5; need += 1) {
    const needs = Object.fromEntries(["S", "M", "L", "XL", "2XL"].map((size) => [size, { evidence: { netAvailableStock: 0 }, targetStockUnits: need, idealNeedUnits: need }]));
    const candidates = simulateFixedPackCandidates(simulationInput({ needsBySize: needs, candidatePackCounts: [3, 0, 2, 1] }));
    for (let index = 1; index < candidates.length; index += 1) {
      const previous = candidates[index - 1];
      const current = candidates[index];
      equal(current.totalUnitsPurchased >= previous.totalUnitsPurchased, true);
      equal(current.totalShortageRemainingUnits <= previous.totalShortageRemainingUnits, true);
      equal(current.shortageReductionUnits >= previous.shortageReductionUnits, true);
      equal(current.totalPackShapeExcessUnits >= previous.totalPackShapeExcessUnits, true);
    }
  }
});

test.after(() => {
  console.log(`FixedPackPurchaseRecommendationEngine: ${assertionCount} assertions passed`);
});
