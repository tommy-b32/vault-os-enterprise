import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { InventoryValuationInput } from "./InventoryValuation";

export const InventoryValuationRepository = { async getCurrent(): Promise<InventoryValuationInput[]> {
  const [stockResult, costResult] = await Promise.all([
    supabaseAdmin.from("vault_style_replenishment_intelligence").select("style_id,parent_product_id,stock_on_hand"),
    supabaseAdmin.from("vault_product_commercial_intelligence").select("product_id,currency,landed_cost_per_pack_gbp,units_per_pack,commercial_cost_trusted"),
  ]);
  if (stockResult.error || costResult.error) throw new Error("Inventory valuation source unavailable");
  const costs = new Map<string, InventoryValuationInput["commercialCost"]>();
  for (const row of costResult.data ?? []) { if (costs.has(row.product_id)) throw new Error("Duplicate commercial cost evidence"); costs.set(row.product_id, { trusted: row.commercial_cost_trusted === true, currency: row.currency, landedCostPerPackGbp: row.landed_cost_per_pack_gbp, unitsPerPack: row.units_per_pack }); }
  return (stockResult.data ?? []).map((row) => ({ styleId: row.style_id, parentProductId: row.parent_product_id, stockOnHand: row.stock_on_hand, commercialCost: costs.get(row.parent_product_id) ?? null }));
} };
