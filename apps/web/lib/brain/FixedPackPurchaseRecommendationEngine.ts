export const FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES = [
  "recommended",
  "zero_recommendation",
  "unavailable",
] as const;

export type FixedPackPurchaseRecommendationStatus =
  (typeof FIXED_PACK_PURCHASE_RECOMMENDATION_STATUSES)[number];

export const FIXED_PACK_PURCHASE_REASON_CODES = [
  "PACK_COMPOSITION_MISSING",
  "PACK_COMPOSITION_INACTIVE",
  "PACK_COMPOSITION_INCOMPLETE",
  "PACK_COMPOSITION_INVALID",
  "COMMERCIAL_PACK_MISMATCH",
  "COMMERCIAL_PACK_UNAVAILABLE",
  "SUPPLIER_MISSING",
  "SUPPLIER_STYLE_OWNERSHIP_AMBIGUOUS",
  "SEMANTIC_IDENTITY_UNRESOLVED",
  "SIZE_EVIDENCE_MISSING",
  "PACK_SIZE_EVIDENCE_MISSING",
  "INVENTORY_STALE",
  "ORDER_HISTORY_STALE",
  "SALES_HISTORY_INCOMPLETE",
  "SALES_MAPPING_INCOMPLETE",
  "TARGET_STOCK_POLICY_MISSING",
  "LEAD_TIME_POLICY_MISSING",
  "MOQ_POLICY_INVALID",
  "SIZE_DRIVES_PACK_PURCHASE",
  "PACK_SHAPE_EXCESS",
  "MOQ_INDUCED_EXCESS",
  "SHORTAGE_REMAINS_AFTER_SELECTED_PACKS",
  "ALL_SIZES_ABOVE_TARGET",
  "ZERO_DEMAND",
  "INCOMING_STOCK_REDUCES_NEED",
  "COMMITTED_STOCK_INCREASES_NEED",
  "NEGATIVE_NET_STOCK",
  "FAST_SELLING_STYLE",
  "EARLY_EVIDENCE_ELIGIBLE",
  "SINGLE_SIZE_NEED_WAIT",
  "TWO_SIZE_NEED_WAIT",
  "FAST_TWO_SIZE_REPLENISHMENT",
  "BROAD_SIZE_CURVE_REPLENISHMENT",
  "PER_SIZE_EXCESS_CAP_REACHED",
  "FAST_BUFFER_PACK",
  "INCREMENTAL_PACK_ONLY_SERVES_ONE_SIZE",
  "CANDIDATE_RANGE_EXHAUSTED",
  "SALES_WINDOW_INCONSISTENT",
] as const;

export type FixedPackPurchaseReasonCode =
  (typeof FIXED_PACK_PURCHASE_REASON_CODES)[number];

export type FixedPackCompositionSize = {
  normalizedSize: string;
  unitsPerPack: number;
};

export type FixedPackSizeEvidence = {
  modelSizeId: string;
  normalizedSize: string;
  availableStock: number;
  committedStock: number;
  incomingStock: number;
  netAvailableStock: number;
  sales7DayUnits: number | null;
  sales14DayUnits: number | null;
  sales30DayUnits: number | null;
  averageDailySales: number | null;
  inventoryFreshness: string | null;
  orderHistoryFreshness: string | null;
  salesHistory30Complete: boolean;
  styleSalesMappingComplete: boolean;
  styleUnresolvedCleanSalesUnits: number;
  globalSalesMappingComplete: boolean;
  globalUnresolvedCleanSalesUnits: number;
  globalUnmatchedCleanSalesUnits: number;
  trusted: boolean;
  missingRequirements: string[];
};

export type FixedPackPurchaseSizeImpact = FixedPackSizeEvidence & {
  unitsPerPack: number;
  calculatedDailyDemand: number | null;
  coverageDays: number | null;
  targetStockUnits: number | null;
  idealNeedUnits: number | null;
  purchasedUnitsFromPacks: number | null;
  projectedStockUnits: number | null;
  projectedShortageUnits: number | null;
  projectedExcessUnits: number | null;
  projectedDaysCover: number | null;
  drivesPackNeed: boolean | null;
  reasonCodes: FixedPackPurchaseReasonCode[];
};

export type FixedPackIdealSizeNeedInput = {
  evidence: FixedPackSizeEvidence;
  targetStockDays: number | null;
  supplierLeadTimeDays: number | null;
  styleSales7DayUnits?: number | null;
  styleSales14DayUnits?: number | null;
};

export type FixedPackIdealSizeNeed = {
  modelSizeId: string;
  normalizedSize: string;
  calculatedDailyDemand: number | null;
  coverageDays: number | null;
  targetStockUnits: number | null;
  idealNeedUnits: number | null;
  trusted: boolean;
  status: "available" | "unavailable";
  historyEligibility: "established" | "early_evidence" | "unavailable";
  blockers: FixedPackPurchaseReasonCode[];
  reasonCodes: FixedPackPurchaseReasonCode[];
};

export type FixedPackPurchaseCandidateSizeImpact = {
  modelSizeId: string;
  normalizedSize: string;
  unitsPerPack: number;
  netAvailableStock: number;
  calculatedDailyDemand: number;
  targetStockUnits: number;
  idealNeedUnits: number;
  hasIdealNeed: boolean;
  purchasedUnitsFromPacks: number;
  projectedStockUnits: number;
  projectedShortageUnits: number;
  projectedExcessUnits: number;
  packShapeExcessUnits: number;
  demandUnitsSatisfied: number;
  projectedDaysCover: number | null;
};

export type FixedPackPurchaseCandidate = {
  packCount: number;
  totalUnitsPurchased: number;
  totalIdealNeedUnits: number;
  totalShortageRemainingUnits: number;
  totalProjectedExcessUnits: number;
  totalPackShapeExcessUnits: number;
  shortageReductionUnits: number;
  demandUnitsSatisfied: number;
  sizesStillShort: string[];
  sizesAboveTarget: string[];
  sizeImpacts: FixedPackPurchaseCandidateSizeImpact[];
};

export type FixedPackPurchaseCandidateSimulationInput = {
  declaredUnitsPerPack: number;
  composition: FixedPackCompositionSize[];
  sizeEvidence: FixedPackSizeEvidence[];
  idealSizeNeeds: FixedPackIdealSizeNeed[];
  candidatePackCounts: number[];
};

export type FixedPackPurchaseRecommendation = {
  recommendationId: string;
  supplierId: string;
  styleId: string;
  parentProductId: string;
  modelDesign: string;
  packDefinitionId: string;
  declaredUnitsPerPack: number;
  commercialUnitsPerPack: number | null;
  applicableMoqPacks: number | null;
  recommendedPackCount: number | null;
  recommendedTotalUnits: number | null;
  status: FixedPackPurchaseRecommendationStatus;
  trusted: boolean;
  blockers: FixedPackPurchaseReasonCode[];
  warnings: FixedPackPurchaseReasonCode[];
  reasonCodes: FixedPackPurchaseReasonCode[];
  totalIdealNeedUnits: number | null;
  totalShortageRemainingUnits: number | null;
  totalProjectedExcessUnits: number | null;
  totalPackShapeExcessUnits: number | null;
  sizes: FixedPackPurchaseSizeImpact[];
};

export type FixedPackRecommendationFixture = {
  supplierId: string;
  styleId: string;
  parentProductId: string;
  modelDesign: string;
  packDefinitionId: string;
  declaredUnitsPerPack: number;
  composition: FixedPackCompositionSize[];
  sizeEvidence: FixedPackSizeEvidence[];
};

const FIXTURE_SUPPLIER_ID = "00000000-0000-0000-0000-000000000010";
const FIXTURE_PARENT_PRODUCT_ID = "00000000-0000-0000-0000-000000000100";

function sizeEvidence(
  normalizedSize: string,
  overrides: Partial<FixedPackSizeEvidence> = {},
): FixedPackSizeEvidence {
  return {
    modelSizeId: `${FIXTURE_PARENT_PRODUCT_ID}::Default::${normalizedSize}`,
    normalizedSize,
    availableStock: 5,
    committedStock: 0,
    incomingStock: 0,
    netAvailableStock: 5,
    sales7DayUnits: 0,
    sales14DayUnits: 0,
    sales30DayUnits: 0,
    averageDailySales: 0,
    inventoryFreshness: "2026-09-14T12:00:00.000Z",
    orderHistoryFreshness: "2026-09-14T12:00:00.000Z",
    salesHistory30Complete: true,
    styleSalesMappingComplete: true,
    styleUnresolvedCleanSalesUnits: 0,
    globalSalesMappingComplete: true,
    globalUnresolvedCleanSalesUnits: 0,
    globalUnmatchedCleanSalesUnits: 0,
    trusted: true,
    missingRequirements: [],
    ...overrides,
  };
}

const STANDARD_5_PACK_COMPOSITION: FixedPackCompositionSize[] = [
  { normalizedSize: "S", unitsPerPack: 1 },
  { normalizedSize: "M", unitsPerPack: 1 },
  { normalizedSize: "L", unitsPerPack: 1 },
  { normalizedSize: "XL", unitsPerPack: 1 },
  { normalizedSize: "2XL", unitsPerPack: 1 },
];

const SIX_UNIT_PACK_COMPOSITION: FixedPackCompositionSize[] = [
  ...STANDARD_5_PACK_COMPOSITION,
  { normalizedSize: "3XL", unitsPerPack: 1 },
];

function fixture(
  styleId: string,
  packDefinitionId: string,
  declaredUnitsPerPack: number,
  composition: FixedPackCompositionSize[],
  sizeEvidenceRows: FixedPackSizeEvidence[],
): FixedPackRecommendationFixture {
  return {
    supplierId: FIXTURE_SUPPLIER_ID,
    styleId,
    parentProductId: FIXTURE_PARENT_PRODUCT_ID,
    modelDesign: "Default",
    packDefinitionId,
    declaredUnitsPerPack,
    composition,
    sizeEvidence: sizeEvidenceRows,
  };
}

export const FIXED_PACK_PURCHASE_RECOMMENDATION_FIXTURES = {
  standard5Pack: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default`,
    "00000000-0000-0000-0000-000000000201",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize)),
  ),
  sixUnitPack: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::SixUnit`,
    "00000000-0000-0000-0000-000000000202",
    6,
    SIX_UNIT_PACK_COMPOSITION,
    SIX_UNIT_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize)),
  ),
  hotSingleSize: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::HotSize`,
    "00000000-0000-0000-0000-000000000203",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize,
      size.normalizedSize === "L"
        ? { availableStock: 0, netAvailableStock: 0, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, averageDailySales: 1 }
        : {})),
  ),
  balancedNeed: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::Balanced`,
    "00000000-0000-0000-0000-000000000204",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize, {
      availableStock: 0, netAvailableStock: 0, sales7DayUnits: 7, sales14DayUnits: 14, sales30DayUnits: 30, averageDailySales: 1,
    })),
  ),
  overstocked: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::Overstocked`,
    "00000000-0000-0000-0000-000000000205",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize, {
      availableStock: 20, netAvailableStock: 20,
    })),
  ),
  incomingStock: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::Incoming`,
    "00000000-0000-0000-0000-000000000206",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize, {
      availableStock: 0, incomingStock: 5, netAvailableStock: 5,
    })),
  ),
  committedStock: fixture(
    `${FIXTURE_PARENT_PRODUCT_ID}::Default::Committed`,
    "00000000-0000-0000-0000-000000000207",
    5,
    STANDARD_5_PACK_COMPOSITION,
    STANDARD_5_PACK_COMPOSITION.map((size) => sizeEvidence(size.normalizedSize, {
      availableStock: 5, committedStock: 4, netAvailableStock: 1,
    })),
  ),
} as const satisfies Record<string, FixedPackRecommendationFixture>;

export function packCompositionTotal(composition: readonly FixedPackCompositionSize[]): number {
  return composition.reduce((total, size) => total + size.unitsPerPack, 0);
}

export function hasConservedPackComposition(
  fixture: Pick<FixedPackRecommendationFixture, "declaredUnitsPerPack" | "composition">,
): boolean {
  return packCompositionTotal(fixture.composition) === fixture.declaredUnitsPerPack;
}

function uniqueReasonCodes(codes: FixedPackPurchaseReasonCode[]): FixedPackPurchaseReasonCode[] {
  return Array.from(new Set(codes)).sort();
}

function evidenceBlockers(
  evidence: FixedPackSizeEvidence,
  earlyEvidenceEligible: boolean,
): FixedPackPurchaseReasonCode[] {
  const blockers: FixedPackPurchaseReasonCode[] = [];
  const requirements = new Set(evidence.missingRequirements);
  if (requirements.has("inventory_stale") || requirements.has("inventory_freshness_unavailable")) {
    blockers.push("INVENTORY_STALE");
  }
  if (requirements.has("sales_history_stale") || requirements.has("sales_history_unavailable")) {
    blockers.push("ORDER_HISTORY_STALE");
  }
  if ((!evidence.salesHistory30Complete || requirements.has("sales_history_30_incomplete")) && !earlyEvidenceEligible) {
    blockers.push("SALES_HISTORY_INCOMPLETE");
  }
  if (
    !evidence.styleSalesMappingComplete ||
    evidence.styleUnresolvedCleanSalesUnits > 0 ||
    requirements.has("style_sales_mapping_incomplete")
  ) {
    blockers.push("SALES_MAPPING_INCOMPLETE");
  }
  if (
    evidence.sales7DayUnits === null ||
    evidence.sales14DayUnits === null ||
    evidence.sales30DayUnits === null
  ) {
    blockers.push("SIZE_EVIDENCE_MISSING");
  }
  const sales = [evidence.sales7DayUnits, evidence.sales14DayUnits, evidence.sales30DayUnits];
  if (
    sales.some((value) => value !== null && (!Number.isFinite(value) || !Number.isInteger(value) || value < 0)) ||
    (evidence.sales7DayUnits !== null && evidence.sales14DayUnits !== null && evidence.sales14DayUnits < evidence.sales7DayUnits) ||
    (evidence.sales14DayUnits !== null && evidence.sales30DayUnits !== null && evidence.sales30DayUnits < evidence.sales14DayUnits)
  ) {
    blockers.push("SALES_WINDOW_INCONSISTENT");
  }
  if (![evidence.availableStock, evidence.committedStock, evidence.incomingStock, evidence.netAvailableStock].every(Number.isFinite)) {
    blockers.push("SIZE_EVIDENCE_MISSING");
  }
  if (!evidence.trusted && blockers.length === 0) {
    blockers.push("SEMANTIC_IDENTITY_UNRESOLVED");
  }
  return blockers;
}

/**
 * Pure Phase 3D-4B ideal-size calculation. It deliberately mirrors the
 * existing scalar quantity engine's 70/20/10 7/14/30-day weighting while
 * remaining independent of pack selection and live Purchase Intelligence.
 */
export function calculateIdealSizeNeed(
  input: FixedPackIdealSizeNeedInput,
): FixedPackIdealSizeNeed {
  const { evidence } = input;
  const earlyEvidenceEligible = !evidence.salesHistory30Complete &&
    ((input.styleSales7DayUnits ?? 0) >= 3 || (input.styleSales14DayUnits ?? 0) >= 5);
  const historyEligibility = evidence.salesHistory30Complete
    ? "established" as const
    : earlyEvidenceEligible ? "early_evidence" as const : "unavailable" as const;
  const blockers = evidenceBlockers(evidence, earlyEvidenceEligible);
  if (input.targetStockDays === null || !Number.isFinite(input.targetStockDays) || input.targetStockDays <= 0) {
    blockers.push("TARGET_STOCK_POLICY_MISSING");
  }
  if (
    input.supplierLeadTimeDays === null ||
    !Number.isFinite(input.supplierLeadTimeDays) ||
    input.supplierLeadTimeDays <= 0
  ) {
    blockers.push("LEAD_TIME_POLICY_MISSING");
  }

  const reasonCodes: FixedPackPurchaseReasonCode[] = [];
  if (evidence.incomingStock > 0) reasonCodes.push("INCOMING_STOCK_REDUCES_NEED");
  if (evidence.committedStock > 0) reasonCodes.push("COMMITTED_STOCK_INCREASES_NEED");
  if (evidence.netAvailableStock < 0) reasonCodes.push("NEGATIVE_NET_STOCK");
  const uniqueBlockers = uniqueReasonCodes(blockers);
  if (uniqueBlockers.length > 0) {
    return {
      modelSizeId: evidence.modelSizeId,
      normalizedSize: evidence.normalizedSize,
      calculatedDailyDemand: null,
      coverageDays: null,
      targetStockUnits: null,
      idealNeedUnits: null,
      trusted: false,
      status: "unavailable",
      historyEligibility: "unavailable",
      blockers: uniqueBlockers,
      reasonCodes: uniqueReasonCodes([...uniqueBlockers, ...reasonCodes]),
    };
  }

  const sales7DayUnits = evidence.sales7DayUnits as number;
  const sales14DayUnits = evidence.sales14DayUnits as number;
  const sales30DayUnits = evidence.sales30DayUnits as number;
  const recentUnits = sales7DayUnits;
  const middleUnits = Math.max(0, sales14DayUnits - sales7DayUnits);
  const olderUnits = Math.max(0, sales30DayUnits - sales14DayUnits);
  const calculatedDailyDemand =
    (recentUnits / 7 * 0.70) +
    (middleUnits / 7 * 0.20) +
    (olderUnits / 16 * 0.10);
  const coverageDays = (input.supplierLeadTimeDays as number) + (input.targetStockDays as number);
  const targetStockUnits = Math.ceil(calculatedDailyDemand * coverageDays);
  const idealNeedUnits = Math.max(0, targetStockUnits - evidence.netAvailableStock);
  if (calculatedDailyDemand === 0) reasonCodes.push("ZERO_DEMAND");

  return {
    modelSizeId: evidence.modelSizeId,
    normalizedSize: evidence.normalizedSize,
    calculatedDailyDemand,
    coverageDays,
    targetStockUnits,
    idealNeedUnits,
    trusted: true,
    status: "available",
    historyEligibility,
    blockers: [],
    reasonCodes: uniqueReasonCodes(reasonCodes),
  };
}

const CANONICAL_APPAREL_SIZES = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);

function assertValidCandidateInput(input: FixedPackPurchaseCandidateSimulationInput): void {
  if (!Number.isInteger(input.declaredUnitsPerPack) || input.declaredUnitsPerPack <= 0) {
    throw new Error("Declared units per pack must be a positive integer.");
  }
  const sizes = new Set<string>();
  for (const size of input.composition) {
    if (!CANONICAL_APPAREL_SIZES.has(size.normalizedSize)) {
      throw new Error(`Unsupported canonical apparel size '${size.normalizedSize}'.`);
    }
    if (!Number.isInteger(size.unitsPerPack) || size.unitsPerPack <= 0) {
      throw new Error(`Units per pack for '${size.normalizedSize}' must be a positive integer.`);
    }
    if (sizes.has(size.normalizedSize)) {
      throw new Error(`Duplicate pack composition size '${size.normalizedSize}'.`);
    }
    sizes.add(size.normalizedSize);
  }
  if (packCompositionTotal(input.composition) !== input.declaredUnitsPerPack) {
    throw new Error("Pack composition units do not equal declared units per pack.");
  }
  const candidateCounts = new Set<number>();
  for (const count of input.candidatePackCounts) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error("Candidate pack counts must be non-negative integers.");
    }
    if (candidateCounts.has(count)) {
      throw new Error(`Duplicate candidate pack count '${count}'.`);
    }
    candidateCounts.add(count);
  }
  const evidenceSizes = new Set<string>();
  for (const evidence of input.sizeEvidence) {
    if (evidenceSizes.has(evidence.normalizedSize)) {
      throw new Error(`Duplicate size evidence '${evidence.normalizedSize}'.`);
    }
    evidenceSizes.add(evidence.normalizedSize);
  }
  const needSizes = new Set<string>();
  for (const need of input.idealSizeNeeds) {
    if (needSizes.has(need.normalizedSize)) {
      throw new Error(`Duplicate ideal-size evidence '${need.normalizedSize}'.`);
    }
    needSizes.add(need.normalizedSize);
    if (!sizes.has(need.normalizedSize) && (need.idealNeedUnits ?? 0) > 0) {
      throw new Error(`Pack composition does not represent needed size '${need.normalizedSize}'.`);
    }
  }
  for (const size of input.composition) {
    const evidence = input.sizeEvidence.find((row) => row.normalizedSize === size.normalizedSize);
    const need = input.idealSizeNeeds.find((row) => row.normalizedSize === size.normalizedSize);
    if (!evidence || !need || need.status !== "available" || !need.trusted ||
      need.calculatedDailyDemand === null || need.targetStockUnits === null || need.idealNeedUnits === null) {
      throw new Error(`Usable ideal-size evidence is required for pack size '${size.normalizedSize}'.`);
    }
    if (need.modelSizeId !== evidence.modelSizeId) {
      throw new Error(`Ideal-size evidence identity does not match '${size.normalizedSize}'.`);
    }
  }
}

export function simulateFixedPackCandidates(
  input: FixedPackPurchaseCandidateSimulationInput,
): FixedPackPurchaseCandidate[] {
  assertValidCandidateInput(input);
  const totalIdealNeedUnits = input.idealSizeNeeds.reduce(
    (total, size) => total + (size.idealNeedUnits ?? 0),
    0,
  );
  const canonicalOrder = ["S", "M", "L", "XL", "2XL", "3XL"];
  const composition = [...input.composition].sort((left, right) =>
    canonicalOrder.indexOf(left.normalizedSize) - canonicalOrder.indexOf(right.normalizedSize));
  return [...input.candidatePackCounts].sort((left, right) => left - right).map((packCount) => {
    const sizeImpacts = composition.map((composition) => {
      const evidence = input.sizeEvidence.find((row) => row.normalizedSize === composition.normalizedSize) as FixedPackSizeEvidence;
      const need = input.idealSizeNeeds.find((row) => row.normalizedSize === composition.normalizedSize) as FixedPackIdealSizeNeed;
      const calculatedDailyDemand = need.calculatedDailyDemand as number;
      const targetStockUnits = need.targetStockUnits as number;
      const idealNeedUnits = need.idealNeedUnits as number;
      const purchasedUnitsFromPacks = packCount * composition.unitsPerPack;
      const projectedStockUnits = evidence.netAvailableStock + purchasedUnitsFromPacks;
      const projectedShortageUnits = Math.max(0, targetStockUnits - projectedStockUnits);
      const projectedExcessUnits = Math.max(0, projectedStockUnits - targetStockUnits);
      const baselineExcessUnits = Math.max(0, evidence.netAvailableStock - targetStockUnits);
      return {
        modelSizeId: evidence.modelSizeId,
        normalizedSize: composition.normalizedSize,
        unitsPerPack: composition.unitsPerPack,
        netAvailableStock: evidence.netAvailableStock,
        calculatedDailyDemand,
        targetStockUnits,
        idealNeedUnits,
        hasIdealNeed: idealNeedUnits > 0,
        purchasedUnitsFromPacks,
        projectedStockUnits,
        projectedShortageUnits,
        projectedExcessUnits,
        packShapeExcessUnits: Math.max(0, projectedExcessUnits - baselineExcessUnits),
        demandUnitsSatisfied: Math.min(idealNeedUnits, purchasedUnitsFromPacks),
        projectedDaysCover: calculatedDailyDemand > 0
          ? Math.max(0, projectedStockUnits) / calculatedDailyDemand
          : null,
      };
    });
    const totalUnitsPurchased = packCount * input.declaredUnitsPerPack;
    if (sizeImpacts.reduce((total, size) => total + size.purchasedUnitsFromPacks, 0) !== totalUnitsPurchased) {
      throw new Error("Candidate pack conservation failed.");
    }
    const totalShortageRemainingUnits = sizeImpacts.reduce((total, size) => total + size.projectedShortageUnits, 0);
    return {
      packCount,
      totalUnitsPurchased,
      totalIdealNeedUnits,
      totalShortageRemainingUnits,
      totalProjectedExcessUnits: sizeImpacts.reduce((total, size) => total + size.projectedExcessUnits, 0),
      totalPackShapeExcessUnits: sizeImpacts.reduce((total, size) => total + size.packShapeExcessUnits, 0),
      shortageReductionUnits: totalIdealNeedUnits - totalShortageRemainingUnits,
      demandUnitsSatisfied: sizeImpacts.reduce((total, size) => total + size.demandUnitsSatisfied, 0),
      sizesStillShort: sizeImpacts.filter((size) => size.projectedShortageUnits > 0).map((size) => size.normalizedSize),
      sizesAboveTarget: sizeImpacts.filter((size) => size.projectedExcessUnits > 0).map((size) => size.normalizedSize),
      sizeImpacts,
    };
  });
}

export type FixedPackPurchaseSelectionInput = {
  candidates: FixedPackPurchaseCandidate[];
  styleSales7DayUnits: number;
  commercialPackConsistent: boolean | null;
  historyEligibility: "established" | "early_evidence" | "unavailable";
};

export type FixedPackPurchaseSelection = {
  recommendedPackCount: number | null;
  recommendedTotalUnits: number | null;
  status: FixedPackPurchaseRecommendationStatus;
  selectedCandidate: FixedPackPurchaseCandidate | null;
  trusted: boolean;
  blockers: FixedPackPurchaseReasonCode[];
  warnings: FixedPackPurchaseReasonCode[];
  reasonCodes: FixedPackPurchaseReasonCode[];
};

function unavailableSelection(blockers: FixedPackPurchaseReasonCode[]): FixedPackPurchaseSelection {
  return {
    recommendedPackCount: null,
    recommendedTotalUnits: null,
    status: "unavailable",
    selectedCandidate: null,
    trusted: false,
    blockers,
    warnings: [],
    reasonCodes: blockers,
  };
}

/** Approved Phase 3D-4D policy: selection only; it never applies basket MOQ. */
export function selectFixedPackPurchaseCandidate(
  input: FixedPackPurchaseSelectionInput,
): FixedPackPurchaseSelection {
  if (input.commercialPackConsistent === false) return unavailableSelection(["COMMERCIAL_PACK_MISMATCH"]);
  if (input.historyEligibility === "unavailable" || input.candidates.length === 0) {
    return unavailableSelection(["SALES_HISTORY_INCOMPLETE"]);
  }
  const candidates = [...input.candidates].sort((left, right) => left.packCount - right.packCount);
  if (candidates.some((candidate, index) => candidate.packCount !== index)) {
    return unavailableSelection(["CANDIDATE_RANGE_EXHAUSTED"]);
  }
  const baseline = candidates.find((candidate) => candidate.packCount === 0);
  if (!baseline) return unavailableSelection(["SIZE_EVIDENCE_MISSING"]);
  const warnings: FixedPackPurchaseReasonCode[] = input.commercialPackConsistent === null
    ? ["COMMERCIAL_PACK_UNAVAILABLE"] : [];
  const fast = input.styleSales7DayUnits >= 4;
  const baseReasons: FixedPackPurchaseReasonCode[] = fast ? ["FAST_SELLING_STYLE"] : [];
  if (input.historyEligibility === "early_evidence") baseReasons.push("EARLY_EVIDENCE_ELIGIBLE");
  const eligible = (candidate: FixedPackPurchaseCandidate): boolean => candidate.packCount === 0 ||
    candidate.sizeImpacts.every((size) => size.projectedExcessUnits <= 4);
  const positive = candidates.filter((candidate) => candidate.packCount > 0 && eligible(candidate));
  const needSizeCount = baseline.sizeImpacts.filter((size) => size.hasIdealNeed).length;
  const zero = (reasonCodes: FixedPackPurchaseReasonCode[]): FixedPackPurchaseSelection => ({
    recommendedPackCount: 0,
    recommendedTotalUnits: 0,
    status: "zero_recommendation",
    selectedCandidate: baseline,
    trusted: true,
    blockers: [],
    warnings,
    reasonCodes: uniqueReasonCodes([...baseReasons, ...reasonCodes]),
  });
  const select = (candidate: FixedPackPurchaseCandidate, reasonCodes: FixedPackPurchaseReasonCode[]): FixedPackPurchaseSelection => ({
    recommendedPackCount: candidate.packCount,
    recommendedTotalUnits: candidate.totalUnitsPurchased,
    status: "recommended",
    selectedCandidate: candidate,
    trusted: true,
    blockers: [],
    warnings,
    reasonCodes: uniqueReasonCodes([...baseReasons, ...reasonCodes]),
  });
  if (needSizeCount === 0) return zero(["ALL_SIZES_ABOVE_TARGET"]);
  if (needSizeCount === 1) return zero(["SINGLE_SIZE_NEED_WAIT"]);
  if (needSizeCount === 2) {
    if (!fast) return zero(["TWO_SIZE_NEED_WAIT"]);
    const onePack = positive.find((candidate) => candidate.packCount === 1);
    return onePack ? select(onePack, ["FAST_TWO_SIZE_REPLENISHMENT"])
      : zero(["PER_SIZE_EXCESS_CAP_REACHED"]);
  }
  let selected = baseline;
  for (const candidate of positive) {
    if (candidate.packCount !== selected.packCount + 1) continue;
    const reductions = candidate.sizeImpacts.filter((size) => {
      const previous = selected.sizeImpacts.find((row) => row.normalizedSize === size.normalizedSize);
      return (previous?.projectedShortageUnits ?? 0) > size.projectedShortageUnits;
    }).length;
    if (reductions < 2) break;
    selected = candidate;
  }
  if (selected.packCount === 0) return zero(["PER_SIZE_EXCESS_CAP_REACHED"]);
  const allSizesNeed = needSizeCount === baseline.sizeImpacts.length;
  if (fast && allSizesNeed) {
    const buffer = positive.find((candidate) => candidate.packCount === selected.packCount + 1);
    if (buffer) return select(buffer, ["BROAD_SIZE_CURVE_REPLENISHMENT", "FAST_BUFFER_PACK"]);
    if (selected.totalShortageRemainingUnits === 0) return unavailableSelection(["CANDIDATE_RANGE_EXHAUSTED"]);
  }
  const next = positive.find((candidate) => candidate.packCount === selected.packCount + 1);
  if (!next && selected.totalShortageRemainingUnits > 0 &&
    selected.sizeImpacts.filter((size) => size.projectedShortageUnits > 0).length >= 2) {
    return unavailableSelection(["CANDIDATE_RANGE_EXHAUSTED"]);
  }
  return select(selected, next ? ["BROAD_SIZE_CURVE_REPLENISHMENT", "INCREMENTAL_PACK_ONLY_SERVES_ONE_SIZE"] : ["BROAD_SIZE_CURVE_REPLENISHMENT"]);
}

export const FixedPackPurchaseRecommendationEngine = {
  calculateIdealSizeNeed,
  hasConservedPackComposition,
  packCompositionTotal,
  simulateFixedPackCandidates,
  selectFixedPackPurchaseCandidate,
} as const;
