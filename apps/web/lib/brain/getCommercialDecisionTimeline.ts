import "server-only";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import {
  CommercialDecisionTimeline,
  type CommercialDecisionTimelineResult,
} from "@/lib/brain/CommercialDecisionTimeline";
import { TrustedBuyingCandidateClassifier } from "@/lib/brain/TrustedBuyingCandidateClassifier";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function getCommercialDecisionTimeline(
  generatedAt: string,
): Promise<CommercialDecisionTimelineResult | null> {
  try {
    const [catalogue, walletResponse, supplierResponse] = await Promise.all([
      getCatalogueData(),
      supabaseAdmin.from("vault_purchasing_wallet").select(`
        ledger_balance_gbp,
        protected_reserve_gbp,
        committed_orders_gbp,
        calculated_purchasing_power_gbp,
        available_purchasing_power_gbp,
        manual_spending_limit_gbp,
        reserve_override_allowed,
        wallet_last_updated,
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
    ]);
    const wallet = walletResponse.error
      ? null
      : walletResponse.data as PurchasingWalletData;
    const suppliers = supplierResponse.error
      ? []
      : (supplierResponse.data ?? []) as SupplierPurchasingData[];
    const candidates = catalogue.products.map((product) => {
      const supplier = suppliers.find((entry) => entry.id === product.supplier_id);
      return TrustedBuyingCandidateClassifier.classify({
        product,
        supplier: supplier
          ? {
              id: supplier.id,
              name: supplier.supplier_name,
              active: supplier.is_active,
              currency: supplier.currency_code,
              minimumOrderValue: supplier.minimum_order_value,
            }
          : null,
        wallet: wallet
          ? { available: true, lastUpdated: wallet.wallet_last_updated }
          : null,
      });
    });
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
