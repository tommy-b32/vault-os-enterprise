export type CommercialDecision =
  | "buy"
  | "hold"
  | "avoid"
  | "waiting";

export type CommercialDecisionInput = {
  productConfigured: boolean;
  supplierAssigned: boolean;

  unitsPerPack: number | null;

  packCostEntered: boolean;
  sellingPriceEntered: boolean;

  marginPercent: number | null;
  returnOnCapital: number | null;
  grossProfitPerUnit: number | null;
};

export type CommercialDecisionResult = {
  decision: CommercialDecision;

  label: string;
  headline: string;
  explanation: string;

  confidence: number;

  marginPercent: number | null;
  returnOnCapital: number | null;
  grossProfitPerUnit: number | null;

  missingInputs: string[];
};

export type CapitalState =
  | "healthy"
  | "limited"
  | "reserve_protected"
  | "no_cash"
  | "unavailable";

export type CapitalDecision =
  | "approved"
  | "limited"
  | "rejected"
  | "unavailable";

export type CapitalInputState = {
  state: "available" | "missing" | "invalid";
  value: number | null;
};

export type CapitalDecisionInput = {
  ledgerBalanceGbp: number | null | undefined;
  protectedReserveGbp: number | null | undefined;
  committedOrdersGbp: number | null | undefined;

  proposedPurchaseGbp?: number | null;
  manualSpendingLimitGbp?: number | null;
  walletAvailable?: boolean;
  walletLastUpdated?: string | null;
};

export type CapitalDecisionResult = {
  decision: CapitalDecision;
  state: CapitalState;
  availability: "available" | "unavailable";
  walletLastUpdated: string | null;
  inputStates: {
    ledgerBalanceGbp: CapitalInputState;
    protectedReserveGbp: CapitalInputState;
    committedOrdersGbp: CapitalInputState;
    proposedPurchaseGbp: CapitalInputState;
    manualSpendingLimitGbp: CapitalInputState | null;
  };

  ledgerBalanceGbp: number;
  protectedReserveGbp: number;
  committedOrdersGbp: number;

  calculatedPurchasingPowerGbp: number;
  availablePurchasingPowerGbp: number;

  proposedPurchaseGbp: number;
  remainingPurchasingPowerGbp: number;
  projectedCashAfterPurchaseGbp: number;

  reserveProtected: boolean;
  affordable: boolean;

  confidence: number;
  headline: string;
  explanation: string;
};

/* ============================================================
   INVENTORY SIGNALS
============================================================ */

export type InventoryUrgency =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "none"
  | "unknown";

export type InventoryRecommendationSignal = {
  dataAvailable: boolean;

  urgency: InventoryUrgency;

  stockOnHand: number | null;
  targetStockDays: number | null;
  estimatedStockDaysRemaining: number | null;

  reorderRequired: boolean;
  recommendedPackQuantity: number | null;

  confidence: number;
  explanation: string;
};

/* ============================================================
   SUPPLIER SIGNALS
============================================================ */

export type SupplierRecommendationSignal = {
  dataAvailable: boolean;

  supplierAssigned: boolean;
  rulesConfirmed: boolean;
  recommendationEnabled: boolean;

  fulfilmentModel:
    | "stocked"
    | "dropship"
    | "service"
    | null;

  minimumOrderPacks: number | null;
  mixedProductsAllowed: boolean;

  proposedPackQuantity: number | null;
  minimumOrderSatisfied: boolean;

  confidence: number;
  explanation: string;
};

/* ============================================================
   VAULT BRAIN RECOMMENDATION ENGINE
============================================================ */

export type RecommendationDecision =
  | "buy"
  | "wait"
  | "reduce_order"
  | "avoid"
  | "complete_data";

export type RecommendationEngineInput = {
  commercial: CommercialDecisionResult;
  capital: CapitalDecisionResult;

  inventory: InventoryRecommendationSignal;
  supplier: SupplierRecommendationSignal;

  proposedPackQuantity: number;
  proposedPurchaseGbp: number;
};

export type RecommendationPipelineStatus =
  | "ready"
  | "warning"
  | "blocked"
  | "waiting";

export type RecommendationPipelineItem = {
  engine:
    | "commercial"
    | "capital"
    | "inventory"
    | "supplier";

  label: string;
  status: RecommendationPipelineStatus;
  explanation: string;
};

export type RecommendationEngineResult = {
  decision: RecommendationDecision;

  label: string;
  headline: string;
  explanation: string;

  confidence: number;

  proposedPackQuantity: number;
  recommendedPackQuantity: number;

  proposedPurchaseGbp: number;
  maximumSafePurchaseGbp: number;

  affordable: boolean;
  reserveProtected: boolean;
  minimumOrderSatisfied: boolean;
  reorderRequired: boolean;

  pipeline: RecommendationPipelineItem[];
  reasons: string[];
  warnings: string[];
  missingInputs: string[];
};

/* ============================================================
   VAULT BRAIN OPERATIONAL SNAPSHOT
============================================================ */

export type VaultBrainDataSource =
  | "shopify"
  | "inventory"
  | "commercial"
  | "supplier"
  | "catalogue"
  | "capital"
  | "missions"
  | "system";

export type VaultBrainSignalTone =
  | "positive"
  | "neutral"
  | "warning"
  | "critical"
  | "info";

export type VaultBrainConnectionStatus =
  | "healthy"
  | "degraded"
  | "offline"
  | "unknown";

export type VaultBrainSourceStatus = {
  source: VaultBrainDataSource;
  label: string;
  status: VaultBrainConnectionStatus;
  lastUpdatedAt: string | null;
  message?: string;
};

export type OvernightTradingSnapshot = {
  periodStartedAt: string;
  periodEndedAt: string;

  orderCount: number;
  grossRevenueGbp: number;
  netRevenueGbp: number | null;
  profitGbp: number | null;

  itemsSold: number;
  averageOrderValueGbp: number;

  newCustomerCount: number | null;
  returningCustomerCount: number | null;

  comparisonOrderCountPercentage: number | null;
  comparisonRevenuePercentage: number | null;
  comparisonProfitPercentage: number | null;
};

export type InventoryHealthState =
  | "excellent"
  | "healthy"
  | "attention"
  | "critical"
  | "unknown";

export type InventoryHealthSnapshot = {
  state: InventoryHealthState;
  score: number | null;

  totalProducts: number;
  healthyProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;

  estimatedStockValueGbp: number | null;
};

export type StockImpact = {
  productId: string;
  productName: string;

  unitsSold: number;
  stockRemaining: number | null;
  estimatedStockDaysRemaining: number | null;

  reorderRequired: boolean;
  urgency: InventoryUrgency;

  supplierId?: string | null;
  supplierName?: string | null;
  supplierLeadTimeDays?: number | null;

  estimatedRevenueAtRiskGbp?: number | null;
  confidence: number;
};

export type MissionBriefingSnapshot = {
  actionable: number;
  critical: number;
  high: number;

  highestPriorityMissionId: string | null;
  highestPriorityMissionTitle: string | null;

  averageConfidence: number;
};

export type CashPositionSnapshot = {
  availableCashGbp: number | null;
  protectedReserveGbp: number | null;
  committedPurchasingGbp: number | null;
  availablePurchasingPowerGbp: number | null;
};

export type VaultBrainOperationalSnapshot = {
  generatedAt: string;
  organisationId?: string;
  userName: string;

  trading: OvernightTradingSnapshot;
  inventory: InventoryHealthSnapshot;
  stockImpacts: StockImpact[];
  missions: MissionBriefingSnapshot;
  cash: CashPositionSnapshot;

  sourceStatuses: VaultBrainSourceStatus[];
};

/* ============================================================
   MORNING BRIEFING OUTPUT
============================================================ */

export type MorningBriefingMetricId =
  | "orders"
  | "revenue"
  | "profit"
  | "items-sold"
  | "average-order"
  | "cash"
  | "inventory-health";

export type MorningBriefingMetric = {
  id: MorningBriefingMetricId;
  label: string;
  value: string;
  supportingText?: string;
  tone: VaultBrainSignalTone;
};

export type MorningBriefingImpact = {
  id: string;
  title: string;
  description: string;

  tone: VaultBrainSignalTone;
  source: VaultBrainDataSource;

  confidence: number;
  missionId?: string | null;
};

export type MorningBriefingRecommendationAuthority =
  | "automatic"
  | "prepared"
  | "advisory";

export type MorningBriefingRecommendation = {
  id: string;
  title: string;
  explanation: string;

  authority: MorningBriefingRecommendationAuthority;
  confidence: number;

  missionId?: string | null;
  actionLabel?: string;
  actionHref?: string;
};

export type MorningBriefingResult = {
  generatedAt: string;

  greeting: string;
  headline: string;
  summary: string;

  narrative: string[];
  metrics: MorningBriefingMetric[];
  impacts: MorningBriefingImpact[];
  recommendations: MorningBriefingRecommendation[];

  inventoryHealth: InventoryHealthSnapshot;
  missionSummary: MissionBriefingSnapshot;
  sourceStatuses: VaultBrainSourceStatus[];

  confidence: number;
};
