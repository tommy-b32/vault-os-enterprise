import VaultAppShell from "@/components/layout/VaultAppShell";
import { HistoricalStockDeliveries } from "@/components/operations/HistoricalStockDeliveries";
import { requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function HistoricalStockDeliveriesPage() {
  const operator = await requireOperatorRole("owner", "operator");
  const [{ data: suppliers, error: suppliersError }, { data: classes, error: classesError }] = await Promise.all([
    supabaseAdmin.from("vault_suppliers").select("id,supplier_name").eq("is_active", true).order("supplier_name"),
    supabaseAdmin.from("vault_historical_merchandise_classes").select("id,display_name").order("display_name"),
  ]);
  if (suppliersError) throw suppliersError;
  if (classesError) throw classesError;
  return <VaultAppShell systemStatusLabel="Governed historical evidence">
    <main className="orders-page">
      <header className="orders-header"><div><p className="vault-eyebrow">OPERATIONS</p><h1>Historical Stock Deliveries</h1><p>Stage documented historical ledger evidence for review. Approval does not activate a costing policy or alter the Sales Workbook.</p></div></header>
      <HistoricalStockDeliveries suppliers={suppliers ?? []} classes={classes ?? []} operatorName={operator.displayName ?? operator.email} />
    </main>
  </VaultAppShell>;
}
