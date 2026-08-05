import { CommercialWorkspace } from "@/components/commercial/CommercialWorkspace";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { canCreateCashTransactions } from "@/lib/auth/rules";
import { CashLedgerRepository } from "@/lib/business/CashLedgerRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CommercialPage() {
  const operator = await requireAuthenticatedOperator();
  const [walletResponse, supplierResponse, cashLedgerResult] =
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
          wallet_last_updated,
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
      CashLedgerRepository.getSnapshot(20).then(
        (data) => ({ data, error: null }),
        (error: unknown) => ({
          data: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to load the cash ledger.",
        }),
      ),
    ]);

  const error = walletResponse.error ?? supplierResponse.error;

  if (error) {
    return (
      <VaultAppShell
        searchPlaceholder="Search Commercial Intelligence..."
        systemStatusLabel="Commercial intelligence unavailable"
      >
        <main className="commercial-error">
          <h1>Commercial Intelligence unavailable</h1>
          <p>{error.message}</p>
        </main>
      </VaultAppShell>
    );
  }

  const wallet = walletResponse.data as PurchasingWalletData;
  const suppliers =
    (supplierResponse.data ?? []) as SupplierPurchasingData[];

  return (
    <VaultAppShell
      searchPlaceholder="Search Commercial Intelligence..."
      systemStatusLabel="Commercial intelligence online"
    >
      <main className="commercial-page">
        <header className="commercial-page-header">
          <div>
            <p className="vault-eyebrow">
              COMMERCIAL INTELLIGENCE
            </p>

            <h1>Commercial Intelligence</h1>

            <p>
              Cash, purchasing power, commitments and supplier
              readiness.
            </p>
          </div>
        </header>

        <CommercialWorkspace
          canCreateCashTransactions={canCreateCashTransactions(
            operator.role,
          )}
          cashLedger={cashLedgerResult.data}
          cashLedgerError={cashLedgerResult.error}
          suppliers={suppliers}
          wallet={wallet}
        />
      </main>
    </VaultAppShell>
  );
}
