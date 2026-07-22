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
  | "no_cash";

export type CapitalDecision =
  | "approved"
  | "limited"
  | "rejected";

export type CapitalDecisionInput = {
  ledgerBalanceGbp: number;
  protectedReserveGbp: number;
  committedOrdersGbp: number;

  proposedPurchaseGbp?: number;
  manualSpendingLimitGbp?: number | null;
};

export type CapitalDecisionResult = {
  decision: CapitalDecision;
  state: CapitalState;

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