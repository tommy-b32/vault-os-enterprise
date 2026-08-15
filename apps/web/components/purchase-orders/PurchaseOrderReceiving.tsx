"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  recordReceiptAgainstPurchaseOrder,
  type RecordPurchaseOrderReceiptState,
} from "@/app/purchase-orders/actions";

const initialState: RecordPurchaseOrderReceiptState = { status: "idle", message: "" };

type ReceivingLine = {
  id: string;
  productName: string;
  orderedQuantity: number | null;
  receivedQuantity: number;
};

type ReceiptEvent = {
  id: string;
  receivedDate: string;
  createdAt: string;
  lines: Array<{
    id: string;
    purchaseOrderLineId: string;
    productName: string;
    quantityReceived: number;
    discrepancyNote: string | null;
  }>;
};

export function PurchaseOrderReceiving({
  purchaseOrderId,
  status,
  lines,
  receipts,
}: {
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  lines: ReceivingLine[];
  receipts: ReceiptEvent[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(recordReceiptAgainstPurchaseOrder, initialState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const eligible = status !== "received";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">RECEIVING</p><h2>Physical receipt evidence</h2></div>
        <span>{status === "received" ? "FULLY RECEIVED" : receipts.length ? "PARTIALLY RECEIVED" : "AWAITING RECEIPT"}</span>
      </div>

      <div className="purchase-order-preparation-lines">
        {lines.map((line) => {
          const remaining = line.orderedQuantity === null
            ? null
            : Math.max(0, line.orderedQuantity - line.receivedQuantity);
          return (
            <article key={line.id}>
              <div>
                <strong>{line.productName}</strong>
                <span>Ordered {line.orderedQuantity ?? "Unavailable"} · Received {line.receivedQuantity} · Remaining {remaining ?? "Unavailable"}</span>
              </div>
            </article>
          );
        })}
      </div>

      {receipts.length ? (
        <div>
          <h3>Previous receipts</h3>
          <div className="purchase-order-preparation-lines">
            {receipts.map((receipt) => (
              <article key={receipt.id}>
                <div>
                  <strong>Received {receipt.receivedDate}</strong>
                  {receipt.lines.map((line) => (
                    <span key={line.id}>
                      {line.productName}: {line.quantityReceived} accepted unit{line.quantityReceived === 1 ? "" : "s"}
                      {line.discrepancyNote ? ` — ${line.discrepancyNote}` : ""}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : <p>No receipts recorded.</p>}

      {eligible ? (
        <form action={action}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <input name="idempotency_key" suppressHydrationWarning type="hidden" value={idempotencyKey} />
          <label>
            Received date
            <input name="received_date" onChange={(event) => setReceivedDate(event.target.value)} required type="date" value={receivedDate} />
          </label>
          {lines.map((line) => {
            const remaining = line.orderedQuantity === null
              ? null
              : Math.max(0, line.orderedQuantity - line.receivedQuantity);
            return (
              <fieldset disabled={remaining === null || remaining === 0} key={line.id}>
                <legend>{line.productName}</legend>
                <label>
                  Accepted units received
                  <input defaultValue="0" max={remaining ?? undefined} min="0" name={`quantity:${line.id}`} required step="1" type="number" />
                </label>
                <label>
                  Optional discrepancy or damage note
                  <textarea name={`note:${line.id}`} rows={2} />
                </label>
              </fieldset>
            );
          })}
          <p>
            This records physical receipt evidence only. Count only accepted units; describe short, damaged, or wrong items in the note. Vault OS does not alter Shopify inventory automatically.
          </p>
          <button disabled={pending || !idempotencyKey || lines.every((line) => line.orderedQuantity === null || line.receivedQuantity >= line.orderedQuantity)} type="submit">
            {pending ? "Recording Receipt…" : "Record Receipt"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
