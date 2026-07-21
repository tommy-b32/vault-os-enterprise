import { CommercialWorkspace } from "@/components/commercial/CommercialWorkspace";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  const [walletResponse, supplierResponse] =
    await Promise.all([
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
        .single(),

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
        .order("supplier_name", {
          ascending: true,
        }),
    ]);

  const error =
    walletResponse.error ?? supplierResponse.error;

  if (error) {
    return (
      <main className="commercial-error">
        <h1>Commercial Intelligence unavailable</h1>
        <p>{error.message}</p>
      </main>
    );
  }

  const wallet =
    walletResponse.data as PurchasingWalletData;

  const suppliers =
    (supplierResponse.data ??
      []) as SupplierPurchasingData[];

  return (
    <main className="commercial-page">
      <header className="commercial-page-header">
        <div>
          <p className="vault-eyebrow">
            Vault Commercial Engine
          </p>

          <h1>Commercial Intelligence</h1>

          <p>
            Understand purchasing power, supplier
            readiness and the safest action to take next.
          </p>
        </div>

        <a className="catalogue-back" href="/">
          ← Command Centre
        </a>
      </header>

      <CommercialWorkspace
        suppliers={suppliers}
        wallet={wallet}
      />
    </main>
  );
}