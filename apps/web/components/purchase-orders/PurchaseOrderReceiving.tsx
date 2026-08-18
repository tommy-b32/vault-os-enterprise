"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  postReceiptInventoryToShopify,
  type PostReceivedInventoryState,
  recordReceiptAgainstPurchaseOrder,
  type RecordPurchaseOrderReceiptState,
} from "@/app/purchase-orders/actions";

const initialState: RecordPurchaseOrderReceiptState = { status: "idle", message: "" };
const initialPostingState: PostReceivedInventoryState = { status: "idle", message: "" };

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
      postedQuantity: number;
      postingBlocked: boolean;
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
  const [postingState, postingAction, postingPending] = useActionState(postReceiptInventoryToShopify, initialPostingState);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [postingIdempotencyKey] = useState(() => crypto.randomUUID());
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const eligible = status !== "received";

  useEffect(() => {
    if (state.status === "success") router.refresh();
    if (postingState.status === "success") router.refresh();
  }, [router, state.status, postingState.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">RECEIVING</p><h2>Physical receipt evidence</h2></div>
        <span>{status === "received" ? "FULLY RECEIVED" : receipts.length ? "PARTIALLY RECEIVED" : "AWAITING RECEIPT"}</span>
      </div>

      <div className="purchase-order-preparation-lines">
        {lines.map((line) => {
          const physicallyAccounted = line.receivedQuantity + line.nonSellableQuantity;
          const remaining = line.orderedQuantity === null
            ? null
            : Math.max(0, line.orderedQuantity - physicallyAccounted);
          const posted = receipts.flatMap((receipt) => receipt.lines)
            .filter((receiptLine) => receiptLine.purchaseOrderLineId === line.id)
            .flatMap((receiptLine) => receiptLine.allocations)
            .reduce((sum, allocation) => sum + allocation.postedQuantity, 0);
          return (
            <article key={line.id}>
              <div>
                <strong>{line.productName}</strong>
                <span>
                  Ordered {line.orderedQuantity ?? "Unavailable"} · Physically accounted {physicallyAccounted} · Sellable received {line.receivedQuantity} · Non-sellable {line.nonSellableQuantity} · Already posted to Shopify {posted} · Remaining to post {Math.max(0, line.receivedQuantity - posted)} · Remaining expected {remaining ?? "Unavailable"}
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
                      {line.productName}: {line.quantityReceived + line.nonSellableQuantity} physically accounted ({line.quantityReceived} sellable, {line.nonSellableQuantity} non-sellable) at {receipt.locationName}
                      {line.discrepancyNote ? ` — ${line.discrepancyNote}` : ""}
                      {line.allocations.map((allocation) =>
                        ` · ${allocation.size}: sellable received ${allocation.quantityReceived}, posted ${allocation.postedQuantity}, remaining to post ${Math.max(0, allocation.quantityReceived - allocation.postedQuantity)}`)}
                    </span>
                  ))}
                  {receipt.lines.some((line) => line.allocations.some((allocation) =>
                    allocation.quantityReceived > allocation.postedQuantity)) ? (
                    <form action={postingAction}>
                      <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
                      <input name="receipt_id" type="hidden" value={receipt.id} />
                      <input name="posting_idempotency_key" type="hidden" value={postingIdempotencyKey} />
                      {receipt.lines.flatMap((line) => line.allocations).map((allocation) => {
                        const remaining = Math.max(0, allocation.quantityReceived - allocation.postedQuantity);
                        return remaining > 0 ? (
                          <label key={allocation.id}>
                            Post size {allocation.size} to Shopify (maximum {remaining})
                            <input defaultValue={remaining} disabled={allocation.postingBlocked} max={remaining} min="0"
                              name={`post_allocation:${allocation.id}`} step="1" type="number" />
                            {allocation.postingBlocked ? <small>A prior posting outcome is pending or unknown; further posting is blocked.</small> : null}
                          </label>
                        ) : null;
                      })}
                      <p>This operator action increases Shopify available inventory. It does not post damaged/non-sellable units and does not write Vault inventory tables; Vault is reconciled by the normal Shopify inventory sync.</p>
                      <button disabled={postingPending || receipt.lines.flatMap((line) => line.allocations).every((allocation) =>
                        allocation.postingBlocked || allocation.quantityReceived <= allocation.postedQuantity)} type="submit">
                        {postingPending ? "Posting Received Stock…" : "Post Received Stock to Shopify"}
                      </button>
                      {postingState.message ? <p role={postingState.status === "error" ? "alert" : "status"}>{postingState.message}</p> : null}
                    </form>
                  ) : null}
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
            const physicallyAccounted = line.receivedQuantity + line.nonSellableQuantity;
            const remaining = line.orderedQuantity === null
              ? null
              : Math.max(0, line.orderedQuantity - physicallyAccounted);
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
                  <input defaultValue="0" max={remaining ?? undefined} min="0" name={`non_sellable:${line.id}`} required step="1" type="number" />
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
          <button disabled={pending || !idempotencyKey || locations.length === 0 || lines.every((line) => line.orderedQuantity === null || line.receivedQuantity + line.nonSellableQuantity >= line.orderedQuantity || line.variants.length === 0)} type="submit">
            {pending ? "Recording Receipt…" : "Record Receipt"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
