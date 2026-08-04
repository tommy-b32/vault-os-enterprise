import Link from "next/link";

import type {
  PurchasingWalletData,
} from "@/components/commercial/PurchasingWallet";
import type {
  SupplierPurchasingData,
} from "@/components/commercial/SupplierPurchasing";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { AdvisorEngine } from "@/lib/brain/AdvisorEngine";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getCatalogueData } from "@/lib/catalogue";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

function formatCurrency(
  value: number,
  currency = "GBP",
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

async function capture<T>(promise: PromiseLike<T>): Promise<LoadResult<T>> {
  try {
    return {
      data: await promise,
      error: null,
    };
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

  const [catalogueResult, walletResult, supplierResult] =
    await Promise.all([
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
            if (error) {
              throw error;
            }

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
            if (error) {
              throw error;
            }

            return (data ?? []) as SupplierPurchasingData[];
          }),
      ),
    ]);

  const advisor = catalogueResult.data
    ? AdvisorEngine.analyse({
        products: catalogueResult.data.products,
      })
    : null;
  const recommendation = advisor?.analysis.highestPriority ?? null;
  const commercialInput = recommendation
    ? advisor?.commercialInputs.find(
        (input) => input.productId === recommendation.id,
      ) ?? null
    : null;
  const supplier = commercialInput
    ? supplierResult.data?.find(
        (candidate) =>
          candidate.supplier_name.toLowerCase() ===
          commercialInput.supplierName.toLowerCase(),
      ) ?? null
    : null;
  const wallet = walletResult.data;
  const reserveState = wallet
    ? wallet.purchasing_power_state === "healthy"
      ? "Protected"
      : wallet.purchasing_power_state === "limited"
        ? "Protected · purchasing limited"
        : wallet.purchasing_power_state === "reserve_protected"
          ? "Reserve protected · purchasing unavailable"
          : "No purchasing power"
    : "Unavailable";

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
              Assemble a supplier-ready order from existing Advisor,
              catalogue and purchasing-wallet signals.
            </p>
          </div>

          <span className="purchase-order-state">Draft foundation</span>
        </header>

        <section className="purchase-order-context">
          <article>
            <span>Recommended supplier</span>
            <strong>
              {commercialInput?.supplierName ?? "Awaiting recommendation"}
            </strong>
            <p>
              {supplier
                ? `${supplier.default_lead_time_days} day lead time · ${supplier.currency_code} · Minimum order ${
                    supplier.minimum_order_value === null
                      ? "not configured"
                      : formatCurrency(
                          supplier.minimum_order_value,
                          supplier.currency_code,
                        )
                  }`
                : commercialInput
                  ? "Canonical supplier purchasing rules are unavailable."
                  : "Advisor has not identified a supplier-ready action."}
            </p>
          </article>

          <article>
            <span>Commercial reason</span>
            <strong>
              {recommendation?.title ?? "No trusted action ready"}
            </strong>
            <p>
              {recommendation?.description ??
                "Complete the remaining Advisor readiness requirements before building a trusted order."}
            </p>
          </article>

          <article>
            <span>Advisor confidence</span>
            <strong>
              {recommendation
                ? `${recommendation.confidence}%`
                : "Not ready"}
            </strong>
            <p>Existing Advisor confidence for this recommendation.</p>
          </article>
        </section>

        <div className="purchase-order-layout">
          <section className="purchase-order-basket">
            <div className="purchase-order-section-heading">
              <div>
                <p className="vault-eyebrow">Draft Purchase Basket</p>
                <h2>Recommended order lines</h2>
              </div>
              <span>{recommendation ? "1 staged line" : "Empty"}</span>
            </div>

            {recommendation && commercialInput ? (
              <article className="purchase-order-line">
                <div>
                  <strong>{recommendation.title}</strong>
                  <p>{commercialInput.supplierName}</p>
                </div>
                <dl>
                  <div>
                    <dt>Recommended quantity</dt>
                    <dd>{commercialInput.recommendedOrderQuantity} packs</dd>
                  </div>
                  <div>
                    <dt>Purchase-cost input</dt>
                    <dd>{formatCurrency(commercialInput.purchaseCost)}</dd>
                  </div>
                  <div>
                    <dt>Priority</dt>
                    <dd>{recommendation.priority}</dd>
                  </div>
                </dl>
              </article>
            ) : (
              <div className="purchase-order-empty">
                <h3>No supplier-ready recommendation available</h3>
                <p>
                  A draft basket will appear when Advisor exposes a
                  trusted recommendation with canonical supplier data.
                </p>
                <Link href="/advisor">Review Advisor readiness →</Link>
              </div>
            )}
          </section>

          <aside className="purchase-order-summary">
            <div className="purchase-order-section-heading">
              <div>
                <p className="vault-eyebrow">Order Totals</p>
                <h2>Draft summary</h2>
              </div>
            </div>

            <dl>
              <div>
                <dt>Order lines</dt>
                <dd>{recommendation ? "1" : "0"}</dd>
              </div>
              <div>
                <dt>Expected revenue</dt>
                <dd>Unavailable</dd>
              </div>
              <div>
                <dt>Expected profit</dt>
                <dd>
                  {recommendation
                    ? formatCurrency(recommendation.estimatedProfit)
                    : "Unavailable"}
                </dd>
              </div>
              <div>
                <dt>Confirmed basket total</dt>
                <dd>Pending basket review</dd>
              </div>
            </dl>

            <p>
              Expected revenue and a final order total remain unavailable
              until canonical basket calculations are connected.
            </p>
          </aside>
        </div>

        <section className="purchase-order-wallet">
          <div className="purchase-order-section-heading">
            <div>
              <p className="vault-eyebrow">Purchasing Wallet Impact</p>
              <h2>Capital protection</h2>
            </div>
            <span>{reserveState}</span>
          </div>

          <div className="purchase-order-wallet-grid">
            <article>
              <span>Available purchasing power</span>
              <strong>
                {wallet
                  ? formatCurrency(wallet.available_purchasing_power_gbp)
                  : "Unavailable"}
              </strong>
            </article>
            <article>
              <span>Protected reserve</span>
              <strong>
                {wallet
                  ? formatCurrency(wallet.protected_reserve_gbp)
                  : "Unavailable"}
              </strong>
            </article>
            <article>
              <span>Committed orders</span>
              <strong>
                {wallet
                  ? formatCurrency(wallet.committed_orders_gbp)
                  : "Unavailable"}
              </strong>
            </article>
            <article>
              <span>Projected impact</span>
              <strong>Pending confirmed basket total</strong>
            </article>
          </div>

          {walletResult.error ? (
            <p className="purchase-order-source-warning">
              Purchasing wallet data is currently unavailable.
            </p>
          ) : null}
        </section>

        <footer className="purchase-order-actions">
          <Link href="/supplier-catalogue/review">Review Basket</Link>
          <button disabled type="button" title="Draft persistence is not connected yet">
            Save Draft
          </button>
          <button disabled type="button" title="PDF export is not connected yet">
            Export PDF
          </button>
          <button disabled type="button" title="WhatsApp order generation is not connected yet">
            Generate WhatsApp Order
          </button>
        </footer>
      </main>
    </VaultAppShell>
  );
}
