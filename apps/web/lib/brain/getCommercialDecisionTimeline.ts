import "server-only";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import {
  CommercialDecisionTimeline,
  type CommercialDecisionTimelineResult,
} from "@/lib/brain/CommercialDecisionTimeline";
import { PurchaseIntelligenceEngine } from "@/lib/brain/PurchaseIntelligenceEngine";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getCommercialDecisionTimeline(
  generatedAt: string,
): Promise<CommercialDecisionTimelineResult | null> {
  try {
    const [catalogue, freshness, walletResponse, supplierResponse, supplierRuleResponse] = await Promise.all([
      getCatalogueData(),
      InventorySyncRepository.getFreshness(),
      supabaseAdmin.from("vault_purchasing_wallet").select(`
        ledger_balance_gbp,
        protected_reserve_gbp,
        committed_orders_gbp,
        calculated_purchasing_power_gbp,
        available_purchasing_power_gbp,
        manual_spending_limit_gbp,
        reserve_override_allowed,
        wallet_last_updated,
        wallet_freshness_threshold_minutes,
        purchasing_power_state
      `).single(),
      supabaseAdmin.from("vault_suppliers").select(`
        id,
        supplier_name,
        is_active,
        default_lead_time_days,
        minimum_order_value,
        currency_code,
        notes
      `),
      supabaseAdmin.from("vault_supplier_purchasing_rules").select(`
        supplier_id,
        minimum_order_packs
      `),
    ]);
    const wallet = walletResponse.error
      ? null
      : walletResponse.data as PurchasingWalletData;
    const packMinimumBySupplierId = new Map(
      (supplierRuleResponse.data ?? []).map((rule) => [
        rule.supplier_id,
        rule.minimum_order_packs,
      ]),
    );
    const suppliers = supplierResponse.error || supplierRuleResponse.error
      ? []
      : (supplierResponse.data ?? []).map((supplier) => ({
          ...supplier,
          minimum_order_packs: packMinimumBySupplierId.get(supplier.id) ?? null,
        })) as SupplierPurchasingData[];
    const candidates = PurchaseIntelligenceEngine.evaluate({
      products: catalogue.products,
      suppliers: suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.supplier_name,
        active: supplier.is_active,
        currency: supplier.currency_code,
        minimumOrderValue: supplier.minimum_order_value,
        minimumOrderPacks: supplier.minimum_order_packs,
      })),
      wallet,
      inventoryTrusted: freshness.syncStatus === "current",
    }).candidates;
    const advisor = AdvisorEngine.analyse({
      products: catalogue.products,
      candidates,
    });

    return CommercialDecisionTimeline.build({
      advisor,
      candidates,
      generatedAt,
    });
  } catch {
    return null;
  }
}
