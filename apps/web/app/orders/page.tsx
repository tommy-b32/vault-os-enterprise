import VaultAppShell from "@/components/layout/VaultAppShell";
import { OrderList } from "@/components/orders/OrderList";
import { OrdersStyles } from "@/components/orders/OrdersStyles";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { OrdersRepository } from "@/lib/orders/OrdersRepository";

export const dynamic = "force-dynamic";

function observed(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "No completed sync";
}

export default async function OrdersPage() {
  await requireAuthenticatedOperator();
  const result = await OrdersRepository.list();
  return (
    <VaultAppShell searchPlaceholder="Search Vault OS..." systemStatusLabel={`Orders: ${result.freshness}`}>
      <main className="orders-page">
        <header className="orders-header"><div><p className="vault-eyebrow">CANONICAL SHOPIFY ORDERS</p><h1>Orders</h1><p>Read-only order history from the Vault OS canonical store.</p></div>
          <div className={`orders-trust is-${result.freshness}`}><strong>{result.freshness}</strong><span>{result.message}</span><span>Last completed sync: {observed(result.latestSyncAt)}</span></div>
        </header>
        {result.freshness === "error" ? <section className="order-unavailable"><h2>Orders unavailable</h2><p>{result.message} No order data is shown.</p></section> : result.data.length === 0 ? <section className="orders-empty"><h2>No canonical orders</h2><p>{result.message}</p></section> : <OrderList orders={result.data} />}
      </main><OrdersStyles />
    </VaultAppShell>
  );
}
