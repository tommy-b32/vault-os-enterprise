export type SupplierStylePackCompositionIntelligence = {
  id: string;
  supplier_id: string;
  style_id: string;
  parent_product_id: string | null;
  normalized_size: string | null;
  units_per_pack: number | null;
  declared_units_per_pack: number;
  commercial_units_per_pack: number | null;
  composition_units_per_pack: number;
  composition_complete: boolean;
  composition_valid: boolean;
  commercial_pack_consistent: boolean | null;
  active: boolean;
  updated_at: string;
  missing_requirements: string[];
};

export const SUPPLIER_STYLE_PACK_COMPOSITION_INTELLIGENCE_FIELDS = [
  "id",
  "supplier_id",
  "style_id",
  "parent_product_id",
  "normalized_size",
  "units_per_pack",
  "declared_units_per_pack",
  "commercial_units_per_pack",
  "composition_units_per_pack",
  "composition_complete",
  "composition_valid",
  "commercial_pack_consistent",
  "active",
  "updated_at",
  "missing_requirements",
] as const satisfies readonly (keyof SupplierStylePackCompositionIntelligence)[];

export type SupplierStylePackCompositionIntelligenceQuery = {
  from: (relation: "vault_supplier_style_pack_composition_intelligence") => {
    select: (columns: string) => PromiseLike<{
      data: SupplierStylePackCompositionIntelligence[] | null;
      error: { message: string } | null;
    }>;
  };
};

export function mapSupplierStylePackCompositionIntelligence(
  row: SupplierStylePackCompositionIntelligence,
): SupplierStylePackCompositionIntelligence {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    style_id: row.style_id,
    parent_product_id: row.parent_product_id,
    normalized_size: row.normalized_size,
    units_per_pack: row.units_per_pack,
    declared_units_per_pack: row.declared_units_per_pack,
    commercial_units_per_pack: row.commercial_units_per_pack,
    composition_units_per_pack: row.composition_units_per_pack,
    composition_complete: row.composition_complete,
    composition_valid: row.composition_valid,
    commercial_pack_consistent: row.commercial_pack_consistent,
    active: row.active,
    updated_at: row.updated_at,
    missing_requirements: row.missing_requirements,
  };
}

export async function loadSupplierStylePackCompositionIntelligenceFrom(
  client: SupplierStylePackCompositionIntelligenceQuery,
): Promise<SupplierStylePackCompositionIntelligence[]> {
  const response = await client
    .from("vault_supplier_style_pack_composition_intelligence")
    .select(SUPPLIER_STYLE_PACK_COMPOSITION_INTELLIGENCE_FIELDS.join(", "));

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data ?? []).map(mapSupplierStylePackCompositionIntelligence);
}

export async function loadSupplierStylePackCompositionIntelligence(): Promise<
  SupplierStylePackCompositionIntelligence[]
> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  return loadSupplierStylePackCompositionIntelligenceFrom(supabaseAdmin);
}
