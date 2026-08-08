"use client";

import Link from "next/link";
import { useState } from "react";

import type { CanonicalOrderSummary } from "@/lib/orders/OrdersRepository";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function label(value: string | null, fallback: string): string {
  return value ? value.replaceAll("_", " ") : fallback;
}

export function OrderList({ orders }: { orders: CanonicalOrderSummary[] }) {
  const [query, setQuery] = useState("");
  const [financial, setFinancial] = useState("all");
  const [fulfilment, setFulfilment] = useState("all");
  const [state, setState] = useState("all");
  const financialStates = [...new Set(orders.map((order) => order.financialStatus).filter(Boolean))] as string[];
  const fulfilmentStates = [...new Set(orders.map((order) => order.fulfilmentStatus).filter(Boolean))] as string[];
  const term = query.trim().toLocaleLowerCase();
  const filtered = orders.filter((order) => {
    const matchesQuery = !term || [order.orderName, order.orderNumber, order.customerName ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(term));
    return matchesQuery &&
      (financial === "all" || order.financialStatus === financial) &&
      (fulfilment === "all" || order.fulfilmentStatus === fulfilment) &&
      (state === "all" || (state === "cancelled") === Boolean(order.cancelledAt));
  });

  return (
    <>
      <section className="orders-filters" aria-label="Order filters">
        <input aria-label="Search orders" onChange={(event) => setQuery(event.target.value)} placeholder="Search order or customer..." type="search" value={query} />
        <select aria-label="Financial status" onChange={(event) => setFinancial(event.target.value)} value={financial}>
          <option value="all">All payment states</option>
          {financialStates.map((value) => <option key={value} value={value}>{label(value, "Unknown")}</option>)}
        </select>
        <select aria-label="Fulfilment status" onChange={(event) => setFulfilment(event.target.value)} value={fulfilment}>
          <option value="all">All fulfilment states</option>
          {fulfilmentStates.map((value) => <option key={value} value={value}>{label(value, "Unfulfilled")}</option>)}
        </select>
        <select aria-label="Cancellation state" onChange={(event) => setState(event.target.value)} value={state}>
          <option value="all">All orders</option><option value="active">Active only</option><option value="cancelled">Cancelled only</option>
        </select>
      </section>
      <p className="orders-count">Showing {filtered.length} of {orders.length} canonical orders</p>
      {filtered.length === 0 ? (
        <section className="orders-empty"><h2>No matching orders</h2><p>Adjust the current search or filters.</p></section>
      ) : (
        <div className="orders-table-wrap">
          <table className="orders-table">
            <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Value</th><th>Payment</th><th>Fulfilment</th><th>Items</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{filtered.map((order) => (
              <tr key={order.id} className={order.cancelledAt ? "is-cancelled" : ""}>
                <td><strong>{order.orderName}</strong><small>Shopify {order.shopifyOrderId}{order.test ? " · Test" : ""}{order.cancelledAt ? " · Cancelled" : ""}</small></td>
                <td>{date(order.orderDate)}</td><td>{order.customerName ?? "Not available"}</td>
                <td><strong>{money(order.netRevenue, order.currency)}</strong>{order.refunds > 0 ? <small>{money(order.refunds, order.currency)} refunded</small> : null}</td>
                <td><span className="orders-pill">{label(order.financialStatus, "Unknown")}</span></td>
                <td><span className="orders-pill">{label(order.fulfilmentStatus, "Unfulfilled")}</span></td>
                <td>{order.lineItemCount}</td><td><Link href={`/orders/${order.id}`}>View →</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
