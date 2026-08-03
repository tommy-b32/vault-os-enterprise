export type BrainCopilotPriority =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type BrainCopilotAction =
  | "add_to_basket"
  | "generate_whatsapp"
  | "review_supplier"
  | "review_product"
  | "dismiss";

export type BrainCopilotRecommendation = {
  id: string;

  title: string;

  message: string;

  priority: BrainCopilotPriority;

  confidence: number;

  productId: string | null;

  productName: string | null;

  supplierId: string | null;

  supplierName: string | null;

  suggestedPacks: number | null;

  estimatedCost: number | null;

  estimatedRevenue: number | null;

  estimatedProfit: number | null;

  currency: string;

  primaryAction: BrainCopilotAction;

  secondaryAction:
    | BrainCopilotAction
    | null;

  reasons: string[];

  createdAt: string;
};