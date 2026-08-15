"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  recordPaymentAgainstPurchaseOrder,
  type RecordPurchaseOrderPaymentState,
} from "@/app/purchase-orders/actions";

const initialState: RecordPurchaseOrderPaymentState = { status: "idle", message: "" };

type PaymentRecord = {
  id: string;
  amount_gbp: number;
  payment_date: string;
  created_at: string;
};

function gbp(value: number): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
}

export function PurchaseOrderPayment({
  purchaseOrderId,
  status,
  estimatedTotalGbp,
  actualTotalGbp,
  paidAmountGbp,
  payments,
}: {
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  estimatedTotalGbp: number | null;
  actualTotalGbp: number | null;
  paidAmountGbp: number;
  payments: PaymentRecord[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordPaymentAgainstPurchaseOrder, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const settlementTotal = actualTotalGbp ?? estimatedTotalGbp;
  const outstanding = settlementTotal === null ? null : Math.max(0, settlementTotal - paidAmountGbp);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">PAYMENT</p><h2>Supplier payment</h2></div>
        <span>{status.replace("_", " ").toUpperCase()}</span>
      </div>
      <div className="purchase-order-supplier-totals">
        <div><span>Settlement total</span><strong>{settlementTotal === null ? "Unavailable" : gbp(settlementTotal)}</strong></div>
        <div><span>Already paid</span><strong>{gbp(paidAmountGbp)}</strong></div>
        <div><span>Outstanding</span><strong>{outstanding === null ? "Unavailable" : gbp(outstanding)}</strong></div>
      </div>

      <div className="purchase-order-preparation-lines">
        {payments.length === 0 ? <p>No payments recorded.</p> : payments.map((payment) => (
          <article key={payment.id}>
            <strong>{gbp(payment.amount_gbp)}</strong>
            <span>Paid {payment.payment_date}</span>
          </article>
        ))}
      </div>

      {status !== "paid" && outstanding !== 0 ? (
        <form action={action}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <input name="idempotency_key" suppressHydrationWarning type="hidden" value={idempotencyKey} />
          <label>
            Payment amount (GBP)
            <input
              max={outstanding ?? undefined}
              min="0.01"
              name="amount_gbp"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label>
            Payment date
            <input
              name="payment_date"
              onChange={(event) => setPaymentDate(event.target.value)}
              required
              type="date"
              value={paymentDate}
            />
          </label>
          <p>
            Recording payment confirms money was paid to the supplier. It will reduce the business cash ledger and the purchase order outstanding commitment.
          </p>
          <button disabled={pending || !idempotencyKey || outstanding === null} type="submit">
            {pending ? "Recording Paymentâ€¦" : "Record Payment"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
