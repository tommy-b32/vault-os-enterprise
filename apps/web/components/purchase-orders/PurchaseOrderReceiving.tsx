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
  nonSellableQuantity: number;
  variants: Array<{
    id: string;
    title: string | null;
    size: string | null;
    sourceVariantId: string;
    inventoryItemId: string;
  }>;
};

type ReceivingLocation = {
  id: string;
  name: string;
  sourceLocationId: string;
};

type ReceiptEvent = {
  id: string;
  receivedDate: string;
    createdAt: string;
    locationName: string;
  lines: Array<{
    id: string;
    purchaseOrderLineId: string;
    productName: string;
    quantityReceived: number;
    discrepancyNote: string | null;
    nonSellableQuantity: number;
    allocations: Array<{
      id: string;
      variantId: string;
      size: string;
      quantityReceived: number;
    }>;
  }>;
};

export function PurchaseOrderReceiving({
  purchaseOrderId,
  status,
  lines,
  receipts,
  locations,
}: {
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  lines: ReceivingLine[];
  receipts: ReceiptEvent[];
  locations: ReceivingLocation[];
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
                <span>
                  Ordered {line.orderedQuantity ?? "Unavailable"} · Physically received {line.receivedQuantity + line.nonSellableQuantity} · Accepted sellable {line.receivedQuantity} · Non-sellable {line.nonSellableQuantity} · Already posted to Shopify unavailable · Remaining to post unavailable · Remaining expected {remaining ?? "Unavailable"}
                </span>
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
                      {line.productName}: {line.quantityReceived} accepted unit{line.quantityReceived === 1 ? "" : "s"}, {line.nonSellableQuantity} non-sellable at {receipt.locationName}
                      {line.discrepancyNote ? ` — ${line.discrepancyNote}` : ""}
                      {line.allocations.map((allocation) =>
                        ` · ${allocation.size}: ${allocation.quantityReceived}`)}
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
          <label>
            Shopify receiving location
            <select name="received_location_id" required defaultValue="">
              <option disabled value="">Select location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
          {lines.map((line) => {
            const remaining = line.orderedQuantity === null
              ? null
              : Math.max(0, line.orderedQuantity - line.receivedQuantity);
            return (
              <fieldset disabled={remaining === null || remaining === 0} key={line.id}>
                <legend>{line.productName}</legend>
                {line.variants.length ? line.variants.map((variant) => (
                  <label key={variant.id}>
                    Accepted sellable units — size {variant.size ?? variant.title ?? "Default"}
                    <input defaultValue="0" max={remaining ?? undefined} min="0" name={`allocation:${line.id}:${variant.id}`} required step="1" type="number" />
                    <small>Shopify variant {variant.sourceVariantId} · inventory item {variant.inventoryItemId}</small>
                  </label>
                )) : <p>Exact active Shopify size variants are unavailable. This line cannot be received safely.</p>}
                <label>
                  Damaged, wrong, or otherwise non-sellable units
                  <input defaultValue="0" min="0" name={`non_sellable:${line.id}`} required step="1" type="number" />
                </label>
                <label>
                  Optional discrepancy or damage note
                  <textarea name={`note:${line.id}`} rows={2} />
                </label>
              </fieldset>
            );
          })}
          <p>
            This records physical receipt and exact size allocation evidence only. Count only accepted sellable units; describe short, damaged, or wrong items in the note. Vault OS does not alter Shopify inventory automatically.
          </p>
          <p>Shopify posting is unavailable until this exact allocation evidence has been recorded and a separately audited posting operation is installed. No canonical posting history exists yet, so already-posted and remaining-to-post quantities are unavailable rather than assumed to be zero.</p>
          <button disabled={pending || !idempotencyKey || locations.length === 0 || lines.every((line) => line.orderedQuantity === null || line.receivedQuantity >= line.orderedQuantity || line.variants.length === 0)} type="submit">
            {pending ? "Recording Receipt…" : "Record Receipt"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
