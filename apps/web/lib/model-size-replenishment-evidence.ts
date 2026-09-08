
export type ModelSizeReplenishmentEvidence = {
  model_size_id: string;
  style_id: string;
  parent_product_id: string;
  model_design: string;
  normalized_size: string;
  available_stock: number;
  committed_stock: number;
  incoming_stock: number;
  net_available_stock: number;
  sales_7_day_units: number | null;
  sales_14_day_units: number | null;
  sales_30_day_units: number | null;
  average_daily_sales: number | null;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  inventory_freshness: string | null;
  order_history_freshness: string | null;
  sales_history_30_complete: boolean;
  style_sales_mapping_complete: boolean;
  style_unresolved_clean_sales_units: number;
  global_sales_mapping_complete: boolean;
  global_unresolved_clean_sales_units: number;
  global_unmatched_clean_sales_units: number;
  trusted: boolean;
  missing_requirements: string[];
};

export const MODEL_SIZE_REPLENISHMENT_EVIDENCE_FIELDS = [
  "model_size_id", "style_id", "parent_product_id", "model_design", "normalized_size",
  "available_stock", "committed_stock", "incoming_stock", "net_available_stock",
  "sales_7_day_units", "sales_14_day_units", "sales_30_day_units", "average_daily_sales",
  "last_sale_date", "days_since_last_sale", "inventory_freshness", "order_history_freshness",
  "sales_history_30_complete", "style_sales_mapping_complete", "style_unresolved_clean_sales_units",
  "global_sales_mapping_complete", "global_unresolved_clean_sales_units",
  "global_unmatched_clean_sales_units", "trusted", "missing_requirements",
] as const satisfies readonly (keyof ModelSizeReplenishmentEvidence)[];

export type ModelSizeReplenishmentEvidenceQuery = {
  from: (relation: "vault_model_size_replenishment_intelligence") => {
    select: (columns: string) => PromiseLike<{
      data: ModelSizeReplenishmentEvidence[] | null;
      error: { message: string } | null;
    }>;
  };
};

export function mapModelSizeReplenishmentEvidence(
  row: ModelSizeReplenishmentEvidence,
): ModelSizeReplenishmentEvidence {
  return {
    model_size_id: row.model_size_id,
    style_id: row.style_id,
    parent_product_id: row.parent_product_id,
    model_design: row.model_design,
    normalized_size: row.normalized_size,
    available_stock: row.available_stock,
    committed_stock: row.committed_stock,
    incoming_stock: row.incoming_stock,
    net_available_stock: row.net_available_stock,
    sales_7_day_units: row.sales_7_day_units,
    sales_14_day_units: row.sales_14_day_units,
    sales_30_day_units: row.sales_30_day_units,
    average_daily_sales: row.average_daily_sales,
    last_sale_date: row.last_sale_date,
    days_since_last_sale: row.days_since_last_sale,
    inventory_freshness: row.inventory_freshness,
    order_history_freshness: row.order_history_freshness,
    sales_history_30_complete: row.sales_history_30_complete,
    style_sales_mapping_complete: row.style_sales_mapping_complete,
    style_unresolved_clean_sales_units: row.style_unresolved_clean_sales_units,
    global_sales_mapping_complete: row.global_sales_mapping_complete,
    global_unresolved_clean_sales_units: row.global_unresolved_clean_sales_units,
    global_unmatched_clean_sales_units: row.global_unmatched_clean_sales_units,
    trusted: row.trusted,
    missing_requirements: row.missing_requirements,
  };
}

export async function loadModelSizeReplenishmentEvidenceFrom(
  client: ModelSizeReplenishmentEvidenceQuery,
): Promise<ModelSizeReplenishmentEvidence[]> {
  const response = await client
    .from("vault_model_size_replenishment_intelligence")
    .select(MODEL_SIZE_REPLENISHMENT_EVIDENCE_FIELDS.join(", "));

  if (response.error) {
    throw new Error(response.error.message);
  }

  const evidence = (response.data ?? []).map(mapModelSizeReplenishmentEvidence);
  const ids = new Set<string>();
  for (const row of evidence) {
    if (ids.has(row.model_size_id)) {
      throw new Error(`Duplicate model-size evidence ID: ${row.model_size_id}`);
    }
    ids.add(row.model_size_id);
  }
  return evidence;
}

export async function loadModelSizeReplenishmentEvidence(): Promise<ModelSizeReplenishmentEvidence[]> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  return loadModelSizeReplenishmentEvidenceFrom(supabaseAdmin);
}
