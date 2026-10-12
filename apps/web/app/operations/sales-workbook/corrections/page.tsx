import VaultAppShell from "@/components/layout/VaultAppShell";
import { OrdersStyles } from "@/components/orders/OrdersStyles";
import { SalesOrderCorrections } from "@/components/operations/SalesOrderCorrections";
import { requireOperatorRole } from "@/lib/auth/operators";

export default async function SalesWorkbookCorrectionsPage() {
  await requireOperatorRole("owner", "operator");

  return (
    <VaultAppShell systemStatusLabel="Sales workbook corrections">
      <main className="orders-page">
        <header className="orders-header">
          <div>
            <p className="vault-eyebrow">OPERATIONS / SALES WORKBOOK</p>
            <h1>Sales order corrections</h1>
            <p>Review the original value and readiness impact before applying a correction.</p>
          </div>
        </header>
        <SalesOrderCorrections />
      </main>
      <OrdersStyles />
    </VaultAppShell>
  );
}
