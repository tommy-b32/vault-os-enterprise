export type BrainDecisionReason =
  | "recommended"
  | "lowest_cost"
  | "fastest_delivery"
  | "highest_quality"
  | "supplier_relationship"
  | "better_branding"
  | "customer_request"
  | "manual_override"
  | "other";

export type BrainLearningEvent = {
  id: string;

  createdAt: string;

  productId: string;

  supplierId: string | null;

  recommendationScore: number;

  accepted: boolean;

  decisionReason: BrainDecisionReason;

  notes: string | null;
};