import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PurchaseOrderDraftLineInput = {
  styleId: string;
  productName: string;
  supplierId: string;
  recommendedPacks: number;
  recommendedUnits: number | null;
  unitsPerPack: number | null;
  productMoqPacks: number | null;
  packCostGbp: number | null;
  lineCostGbp: number | null;
  expectedProfitGbp: number | null;
  recommendationConfidence: number | null;
  recommendationPriority: string | null;
  sourceRecommendationType: string;
  sourceSnapshot: Record<string, unknown>;
};

export type CreatePurchaseOrderDraftInput = {
  supplierId: string;
  operatorId: string;
  idempotencyKey: string;
  currency: string;
  estimatedTotalGbp: number | null;
  totalPacks: number;
  recommendationConfidence: number | null;
  reasoning: string | null;
  sourceSnapshot: Record<string, unknown>;
  lines: PurchaseOrderDraftLineInput[];
};

export type SavedPurchaseOrderDraft = {
  id: string;
  supplierId: string;
  status: string;
  estimatedTotalGbp: number | null;
  totalPacks: number | null;
  createdAt: string;
};

function assertDraftInput(input: CreatePurchaseOrderDraftInput) {
  if (!input.supplierId) {
    throw new Error("Supplier is required.");
  }

  if (!input.operatorId) {
    throw new Error("Operator is required.");
  }

  if (!input.idempotencyKey) {
    throw new Error("Draft idempotency key is required.");
  }

  if (input.lines.length === 0) {
    throw new Error("A purchase-order draft must contain at least one line.");
  }

  if (!Number.isInteger(input.totalPacks) || input.totalPacks <= 0) {
    throw new Error("Purchase-order draft packs must be positive.");
  }

  for (const line of input.lines) {
    if (line.supplierId !== input.supplierId) {
      throw new Error("Every purchase-order line must use the draft supplier.");
    }

    if (
      !Number.isInteger(line.recommendedPacks) ||
      line.recommendedPacks <= 0
    ) {
      throw new Error("Every purchase-order line must contain positive packs.");
    }

    if (
      line.productMoqPacks !== null &&
      line.recommendedPacks < line.productMoqPacks
    ) {
      throw new Error(
        `${line.productName} is below its canonical product MOQ.`,
      );
    }
  }
}

export async function createPurchaseOrderDraft(
  input: CreatePurchaseOrderDraftInput,
): Promise<SavedPurchaseOrderDraft> {
  assertDraftInput(input);

  const existing = await supabaseAdmin
    .from("vault_purchase_orders")
    .select(`
      id,
      supplier_id,
      status,
      estimated_total_gbp,
      total_packs,
      created_at
    `)
    .eq("created_by_operator_id", input.operatorId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return {
      id: existing.data.id,
      supplierId: existing.data.supplier_id,
      status: existing.data.status,
      estimatedTotalGbp: existing.data.estimated_total_gbp,
      totalPacks: existing.data.total_packs,
      createdAt: existing.data.created_at,
    };
  }

  const header = await supabaseAdmin
    .from("vault_purchase_orders")
    .insert({
      supplier_id: input.supplierId,
      status: "draft",
      currency: input.currency,
      estimated_total_gbp: input.estimatedTotalGbp,
      total_packs: input.totalPacks,
      recommended_by_vault_brain: true,
      recommendation_confidence: input.recommendationConfidence,
      reasoning: input.reasoning,
      created_by_operator_id: input.operatorId,
      idempotency_key: input.idempotencyKey,
      source_snapshot: input.sourceSnapshot,
    })
    .select(`
      id,
      supplier_id,
      status,
      estimated_total_gbp,
      total_packs,
      created_at
    `)
    .single();

  if (header.error || !header.data) {
    throw header.error ?? new Error("Purchase-order draft could not be created.");
  }

  const lineRows = input.lines.map((line) => ({
    purchase_order_id: header.data.id,
    supplier_id: line.supplierId,
    style_id: line.styleId,
    product_name: line.productName,
    recommended_packs: line.recommendedPacks,
    recommended_units: line.recommendedUnits,
    units_per_pack: line.unitsPerPack,
    product_moq_packs: line.productMoqPacks,
    pack_cost_gbp: line.packCostGbp,
    line_cost_gbp: line.lineCostGbp,
    expected_profit_gbp: line.expectedProfitGbp,
    recommendation_confidence: line.recommendationConfidence,
    recommendation_priority: line.recommendationPriority,
    source_recommendation_type: line.sourceRecommendationType,
    source_snapshot: line.sourceSnapshot,
  }));

  const lines = await supabaseAdmin
    .from("vault_purchase_order_lines")
    .insert(lineRows);

  if (lines.error) {
    // Avoid leaving a header with no lines if line persistence fails.
    await supabaseAdmin
      .from("vault_purchase_orders")
      .delete()
      .eq("id", header.data.id);

    throw lines.error;
  }

  return {
    id: header.data.id,
    supplierId: header.data.supplier_id,
    status: header.data.status,
    estimatedTotalGbp: header.data.estimated_total_gbp,
    totalPacks: header.data.total_packs,
    createdAt: header.data.created_at,
  };
}

export async function getPurchaseOrderDrafts() {
  const { data, error } = await supabaseAdmin
    .from("vault_purchase_orders")
    .select(`
      id,
      supplier_id,
      status,
      currency,
      estimated_total_gbp,
      total_packs,
      recommendation_confidence,
      created_by_operator_id,
      created_at,
      updated_at,
      vault_suppliers (
        supplier_name
      ),
      vault_purchase_order_lines (
        id,
        style_id,
        product_name,
        recommended_packs,
        recommended_units,
        units_per_pack,
        pack_cost_gbp,
        line_cost_gbp
      )
    `)
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getPurchaseOrderDraft(id: string) {
  const { data, error } = await supabaseAdmin
    .from("vault_purchase_orders")
    .select(`
      *,
      vault_suppliers (
        supplier_name
      ),
      vault_purchase_order_lines (
        *
      )
    `)
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}