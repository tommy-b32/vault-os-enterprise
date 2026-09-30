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
  governedPayment,
}: {
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  estimatedTotalGbp: number | null;
  actualTotalGbp: number | null;
  paidAmountGbp: number;
  payments: PaymentRecord[];
  governedPayment?: { supplier_liability_minor_units: number; supplier_paid_minor_units: number; supplier_balance_minor_units: number; transfer_fee_minor_units: number; cash_debit_minor_units: number } | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordPaymentAgainstPurchaseOrder, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const governed = governedPayment ? { liability: governedPayment.supplier_liability_minor_units / 100, paid: governedPayment.supplier_paid_minor_units / 100, outstanding: governedPayment.supplier_balance_minor_units / 100, fee: governedPayment.transfer_fee_minor_units / 100, debit: governedPayment.cash_debit_minor_units / 100 } : null;
  const settlementTotal = governed?.liability ?? actualTotalGbp ?? estimatedTotalGbp;
  const displayPaid = governed?.paid ?? paidAmountGbp;
  const outstanding = governed?.outstanding ?? (settlementTotal === null ? null : Math.max(0, settlementTotal - paidAmountGbp));

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">PAYMENT</p><h2>Supplier payment</h2></div>
        <span>{outstanding === 0 ? "PAID" : status.replace("_", " ").toUpperCase()}</span>
      </div>
      <div className="purchase-order-supplier-totals">
        <div><span>{governed ? "Supplier liability" : "Settlement total"}</span><strong>{settlementTotal === null ? "Unavailable" : gbp(settlementTotal)}</strong></div>
        <div><span>Already paid</span><strong>{gbp(displayPaid)}</strong></div>
        <div><span>Outstanding</span><strong>{outstanding === null ? "Unavailable" : gbp(outstanding)}</strong></div>
        {governed ? <><div><span>Transfer fee</span><strong>{gbp(governed.fee)}</strong></div><div><span>Cash debit</span><strong>{gbp(governed.debit)}</strong></div></> : null}
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
          <button className="purchase-order-primary-button" disabled={pending || !idempotencyKey || outstanding === null} type="submit">
            {pending ? "Recording Paymentâ€¦" : "Record Payment"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : outstanding === 0 ? <p>Supplier settlement is fully reconciled. Recording another payment is disabled.</p> : null}
    </section>
  );
}
