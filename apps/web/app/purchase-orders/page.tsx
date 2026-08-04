import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import VaultAppShell from "@/components/layout/VaultAppShell";
import {
  PurchaseOrderDraftWorkspace,
  type SupplierDraftOrder,
} from "@/components/purchase-orders/PurchaseOrderDraftWorkspace";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

async function capture<T>(promise: PromiseLike<T>): Promise<LoadResult<T>> {
  try {
    return { data: await promise, error: null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "This source is currently unavailable.",
    };
  }
}

export default async function PurchaseOrdersPage() {
  await requireAuthenticatedOperator();

  const [catalogueResult, walletResult, supplierResult] = await Promise.all([
      capture(getCatalogueData()),
      capture(
        supabaseAdmin
          .from("vault_purchasing_wallet")
          .select(`
            ledger_balance_gbp,
            protected_reserve_gbp,
            committed_orders_gbp,
            calculated_purchasing_power_gbp,
            available_purchasing_power_gbp,
            manual_spending_limit_gbp,
            reserve_override_allowed,
            purchasing_power_state
          `)
          .single()
          .then(({ data, error }) => {
            if (error) throw error;
            return data as PurchasingWalletData;
          }),
      ),
      capture(
        supabaseAdmin
          .from("vault_suppliers")
          .select(`
            id,
            supplier_name,
            default_lead_time_days,
            minimum_order_value,
            currency_code,
            notes
          `)
          .eq("is_active", true)
          .order("supplier_name", { ascending: true })
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as SupplierPurchasingData[];
          }),
      ),
    ]);

  const advisor = catalogueResult.data
    ? AdvisorEngine.analyse({ products: catalogueResult.data.products })
    : null;
  const orderMap = new Map<string, SupplierDraftOrder>();

  if (advisor && catalogueResult.data) {
    for (const recommendation of advisor.analysis.ranked) {
      const commercialInput = advisor.commercialInputs.find(
        (input) => input.productId === recommendation.id,
      );
      const product = catalogueResult.data.products.find(
        (candidate) => candidate.style_id === recommendation.id,
      );

      if (!commercialInput || !product) continue;

      const supplier = supplierResult.data?.find(
        (candidate) =>
          candidate.supplier_name.toLowerCase() ===
          commercialInput.supplierName.toLowerCase(),
      );
      const existing = orderMap.get(commercialInput.supplierName);
      const order = existing ?? {
        supplierName: commercialInput.supplierName,
        leadTimeDays: supplier?.default_lead_time_days ?? null,
        minimumOrderValue: supplier?.minimum_order_value ?? null,
        minimumOrderCurrency: supplier?.currency_code ?? "GBP",
        currency: "GBP",
        lines: [],
      };

      order.lines.push({
        id: recommendation.id,
        productName: product.product_name,
        supplierName: commercialInput.supplierName,
        suggestedQuantity: commercialInput.recommendedOrderQuantity,
        packCost: product.commercial_cost.landed_cost_per_pack_gbp,
        currency: "GBP",
        expectedProfit: recommendation.estimatedProfit,
        confidence: recommendation.confidence,
        explanation: recommendation.description,
        priority: recommendation.priority,
        supplierMoqPacks: product.supplier_moq_packs,
      });

      orderMap.set(commercialInput.supplierName, order);
    }
  }

  const orders = Array.from(orderMap.values());

  return (
    <VaultAppShell
      searchPlaceholder="Search purchase orders..."
      systemStatusLabel="Purchase order builder ready"
    >
      <main className="purchase-orders-page">
        <header className="purchase-orders-header">
          <div>
            <p className="vault-eyebrow">PURCHASE ORDERS</p>
            <h1>Purchase Order Builder</h1>
            <p>
              Execute trusted Advisor recommendations as supplier-grouped
              draft orders without changing their commercial logic.
            </p>
          </div>

          <span className="purchase-order-state">
            {orders.length > 0 ? "Advisor draft ready" : "Not ready"}
          </span>
        </header>

        {orders.length > 0 ? (
          <PurchaseOrderDraftWorkspace
            advisorConfidence={advisor?.analysis.averageConfidence ?? null}
            orders={orders}
            wallet={walletResult.data}
            walletUnavailable={walletResult.error !== null}
          />
        ) : (
          <section className="purchase-order-empty purchase-order-readiness-empty">
            <p className="vault-eyebrow">ADVISOR READINESS</p>
            <h2>No commercial action is ready yet</h2>
            <p>
              Vault OS needs stronger catalogue, supplier or cost data
              before it can generate a trusted draft purchase basket.
            </p>
            <a href="/advisor">Review Advisor readiness &rarr;</a>
          </section>
        )}
      </main>
    </VaultAppShell>
  );
}
