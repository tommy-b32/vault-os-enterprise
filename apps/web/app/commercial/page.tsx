import { CommercialWorkspace } from "@/components/commercial/CommercialWorkspace";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { canCreateCashTransactions } from "@/lib/auth/rules";
import { CashLedgerRepository } from "@/lib/business/CashLedgerRepository";
import { WalletFreshness } from "@/lib/brain/WalletFreshness";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CommercialPage({ searchParams }: { searchParams: Promise<{ attention?: string }> }) {
  const operator = await requireAuthenticatedOperator();
  const [walletResponse, supplierResponse, supplierRuleResponse, costProfileResponse, cashLedgerResult] =
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
          wallet_freshness_threshold_minutes,
          purchasing_power_state
        `)
        .single(),

      supabaseAdmin
        .from("vault_suppliers")
        .select(`
          id,
          supplier_name,
          is_active,
          default_lead_time_days,
          minimum_order_value,
          currency_code,
          notes
        `)
        .eq("is_active", true)
        .order("supplier_name", {
          ascending: true,
        }),
      supabaseAdmin
        .from("vault_supplier_purchasing_rules")
        .select("supplier_id, minimum_order_packs"),
      supabaseAdmin
        .from("vault_supplier_product_type_cost_profiles")
        .select("id, supplier_id, supplier_currency, exchange_rate_to_gbp, pack_cost, shipping_cost_per_pack, import_cost_per_pack, units_per_pack, price_updated_at, effective_from, active, vault_suppliers!inner(supplier_name), vault_cost_types!inner(id, display_name)")
        .order("price_updated_at", { ascending: false }),
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

  const error = walletResponse.error ?? supplierResponse.error ?? supplierRuleResponse.error ?? costProfileResponse.error;

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
  const attention = (await searchParams).attention;
  const walletFreshness = attention === "wallet_stale" || attention === "wallet_freshness_unknown"
    ? WalletFreshness.evaluate({
        evidenceTimestamp: wallet.wallet_last_updated,
        thresholdMinutes: wallet.wallet_freshness_threshold_minutes ?? null,
      })
    : null;
  const packMinimumBySupplierId = new Map(
    (supplierRuleResponse.data ?? []).map((rule) => [
      rule.supplier_id,
      rule.minimum_order_packs,
    ]),
  );
  const suppliers = (supplierResponse.data ?? []).map((supplier) => ({
    ...supplier,
    minimum_order_packs: packMinimumBySupplierId.get(supplier.id) ?? null,
  })) as SupplierPurchasingData[];
  const costProfiles = (costProfileResponse.data ?? []).map((row: any) => ({
    id: row.id, supplier_id: row.supplier_id, supplier_name: row.vault_suppliers.supplier_name,
    cost_type_id: row.vault_cost_types.id, cost_type_name: row.vault_cost_types.display_name,
    supplier_currency: row.supplier_currency, exchange_rate_to_gbp: row.exchange_rate_to_gbp,
    pack_cost: row.pack_cost, shipping_cost_per_pack: row.shipping_cost_per_pack,
    import_cost_per_pack: row.import_cost_per_pack, units_per_pack: row.units_per_pack,
    price_updated_at: row.price_updated_at, effective_from: row.effective_from, active: row.active,
  }));

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
        {walletFreshness ? (
          <section className="commercial-card">
            <p className="vault-eyebrow">Purchasing wallet remediation</p>
            <h2>Wallet freshness: {walletFreshness.status}</h2>
            <p>{walletFreshness.reason}</p>
            <p>Last updated: {walletFreshness.evidenceTimestamp ?? "Unavailable"}. Canonical threshold: {walletFreshness.thresholdMinutes ?? "Unavailable"} minutes.</p>
          </section>
        ) : null}

        <CommercialWorkspace
          canCreateCashTransactions={canCreateCashTransactions(
            operator.role,
          )}
          cashLedger={cashLedgerResult.data}
          cashLedgerError={cashLedgerResult.error}
          suppliers={suppliers}
          costProfiles={costProfiles}
          wallet={wallet}
        />
      </main>
    </VaultAppShell>
  );
}
