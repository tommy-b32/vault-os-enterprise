import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { InventoryValuationInput } from "./InventoryValuation";

export const InventoryValuationRepository = { async getCurrent(): Promise<InventoryValuationInput[]> {
  const [stockResult, costResult] = await Promise.all([
    supabaseAdmin.from("vault_style_replenishment_intelligence").select("style_id,parent_product_id,stock_on_hand"),
    supabaseAdmin.from("vault_product_commercial_intelligence").select("product_id,landed_cost_per_pack_gbp,units_per_pack,missing_commercial_requirements,commercial_cost_resolution_mode,pack_cost_source,units_source,fx_source,shipping_cost_source,import_cost_source"),
  ]);
  if (stockResult.error || costResult.error) throw new Error("Inventory valuation source unavailable");
  const costs = new Map<string, InventoryValuationInput["commercialCost"]>();
  for (const row of costResult.data ?? []) { if (costs.has(row.product_id)) throw new Error("Duplicate commercial cost evidence"); costs.set(row.product_id, { landedCostPerPackGbp: row.landed_cost_per_pack_gbp, unitsPerPack: row.units_per_pack, missingRequirements: row.missing_commercial_requirements ?? [], resolutionMode: row.commercial_cost_resolution_mode ?? "unavailable", packCostSource: row.pack_cost_source ?? "unavailable", unitsSource: row.units_source ?? "unavailable", fxSource: row.fx_source ?? "unavailable", shippingCostSource: row.shipping_cost_source ?? "unavailable", importCostSource: row.import_cost_source ?? "unavailable" }); }
  return (stockResult.data ?? []).map((row) => ({ styleId: row.style_id, parentProductId: row.parent_product_id, stockOnHand: row.stock_on_hand, commercialCost: costs.get(row.parent_product_id) ?? null }));
} };
