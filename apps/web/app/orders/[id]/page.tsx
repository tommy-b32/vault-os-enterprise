import Link from "next/link";
import { notFound } from "next/navigation";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { OrdersStyles } from "@/components/orders/OrdersStyles";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { OrdersRepository } from "@/lib/orders/OrdersRepository";

export const dynamic = "force-dynamic";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function label(value: string | null, fallback: string): string {
  return value ? value.replaceAll("_", " ") : fallback;
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuthenticatedOperator();
  const { id } = await params;
  const result = await OrdersRepository.getById(id);
  if (result.freshness !== "error" && !result.data) notFound();

  return (
    <VaultAppShell searchPlaceholder="Search Vault OS..." systemStatusLabel={`Orders: ${result.freshness}`}>
      <main className="orders-page">
        <Link className="order-back" href="/orders">← All orders</Link>
        {result.freshness === "error" || !result.data ? (
          <section className="order-unavailable"><h1>Order unavailable</h1><p>{result.message} No order detail is shown.</p></section>
        ) : (() => {
          const order = result.data;
          return <>
            <header className="orders-header"><div><p className="vault-eyebrow">READ-ONLY CANONICAL ORDER</p><h1>{order.orderName}</h1><p>Shopify order {order.shopifyOrderId} · {date(order.orderDate)}</p></div>
              <div className={`orders-trust is-${result.freshness}`}><strong>{result.freshness}</strong><span>{result.message}</span></div>
            </header>
            <section className="order-summary-grid">
              <div><span>Customer</span><strong>{order.customerName ?? "Not available"}</strong></div>
              <div><span>Payment</span><strong>{label(order.financialStatus, "Unknown")}</strong></div>
              <div><span>Fulfilment</span><strong>{label(order.fulfilmentStatus, "Unfulfilled")}</strong></div>
              <div><span>Order state</span><strong>{order.cancelledAt ? `Cancelled ${date(order.cancelledAt)}` : order.test ? "Test order" : "Active"}</strong></div>
            </section>
            <section className="order-lines"><h2>Line items</h2><div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>Product</th><th>Variant</th><th>SKU</th><th>Quantity</th><th>Refunded</th><th>Unit price</th><th>Discount</th><th>Net line value</th></tr></thead>
              <tbody>{order.lines.map((line) => <tr key={line.id}><td><strong>{line.title}</strong><small>Product {line.shopifyProductId ?? "not available"}</small></td><td>{line.variantTitle ?? "Default"}<small>Variant {line.shopifyVariantId ?? "not available"}</small></td><td>{line.sku ?? "Not available"}</td><td>{line.quantity}</td><td>{line.refundedQuantity}</td><td>{money(line.unitPrice, order.currency)}</td><td>{money(line.discountAllocation, order.currency)}</td><td><strong>{money(line.netLineRevenue, order.currency)}</strong></td></tr>)}</tbody>
            </table></div></section>
            <section className="order-totals">
              <div><span>Subtotal</span><strong>{money(order.subtotal, order.currency)}</strong></div><div><span>Discounts</span><strong>{money(order.discounts, order.currency)}</strong></div><div><span>Shipping</span><strong>{money(order.shipping, order.currency)}</strong></div><div><span>Tax</span><strong>{money(order.tax, order.currency)}</strong></div><div><span>Gross total</span><strong>{money(order.grossTotal, order.currency)}</strong></div><div><span>Refunds</span><strong>{money(order.refunds, order.currency)}</strong></div><div><span>Net revenue</span><strong>{money(order.netRevenue, order.currency)}</strong></div><div><span>Line items</span><strong>{order.lineItemCount}</strong></div>
            </section>
          </>;
        })()}
      </main><OrdersStyles />
    </VaultAppShell>
  );
}
