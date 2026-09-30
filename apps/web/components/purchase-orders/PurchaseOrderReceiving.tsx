"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  postReceiptInventoryToShopify,
  type PostReceivedInventoryState,
  recordReceiptAgainstPurchaseOrder,
  type RecordPurchaseOrderReceiptState,
} from "@/app/purchase-orders/actions";
import { PurchaseOrderProductImage } from "@/components/purchase-orders/PurchaseOrderProductImage";

const initialState: RecordPurchaseOrderReceiptState = { status: "idle", message: "" };
const initialPostingState: PostReceivedInventoryState = { status: "idle", message: "" };
const APPAREL_SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

function apparelSizeRank(value: string | null): number {
  const normalized = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const canonical = normalized === "XXL" ? "2XL" : normalized === "XXXL" ? "3XL" : normalized;
  const rank = APPAREL_SIZE_ORDER.indexOf(canonical);
  return rank === -1 ? APPAREL_SIZE_ORDER.length : rank;
}

function compareCanonicalReceivingVariants(
  left: ReceivingLine["variants"][number],
  right: ReceivingLine["variants"][number],
): number {
  const leftSize = left.size ?? left.title ?? "Default";
  const rightSize = right.size ?? right.title ?? "Default";
  return apparelSizeRank(leftSize) - apparelSizeRank(rightSize)
    || leftSize.localeCompare(rightSize)
    || left.id.localeCompare(right.id);
}

type ReceivingLine = {
  id: string;
  productName: string;
  productImageUrl: string | null;
  productImageAlt: string;
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
  canonicalAllocations?: Array<{ id: string; normalizedSize: string; orderedUnits: number }>;
  pendingAllocations?: Array<{ id: string; supplierSizeLabel: string; normalizedSize: string; orderedUnits: number; sellableReceived: number; nonSellableReceived: number }>;
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
      nonSellableQuantity: number;
      postedQuantity: number;
      postingBlocked: boolean;
      postingBlockReason?: string | null;
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
  const [pendingInputError, setPendingInputError] = useState<string | null>(null);
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
              <PurchaseOrderProductImage productImageAlt={line.productImageAlt} productImageUrl={line.productImageUrl} />
              <div>
                <strong>{line.productName}</strong>
                <span>
                  Ordered {line.orderedQuantity ?? "Unavailable"} · Physically accounted {physicallyAccounted} · Sellable received {line.receivedQuantity} · Non-sellable {line.nonSellableQuantity} · Remaining expected {remaining ?? "Unavailable"}
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
                            {allocation.postingBlocked ? <small>{allocation.postingBlockReason ?? "A prior posting outcome is pending or unknown; further posting is blocked."}</small> : null}
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
        <form action={action} className="purchase-order-receipt-form" onSubmit={(event) => { const form = new FormData(event.currentTarget); for (const [key, value] of form.entries()) { if (!key.startsWith("pending_allocation:") || typeof value !== "string") continue; const suffix = key.slice("pending_allocation:".length); const outstanding = Number((event.currentTarget.elements.namedItem(key) as HTMLInputElement | null)?.dataset.pendingOutstanding); const physical = Number(value) + Number(form.get(`pending_non_sellable:${suffix}`) ?? 0); if (!Number.isFinite(physical) || physical <= 0 || physical > outstanding) { event.preventDefault(); setPendingInputError("Pending physical receipt cannot exceed the saved outstanding size quantity."); return; } } setPendingInputError(null); }}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <input name="idempotency_key" suppressHydrationWarning type="hidden" value={idempotencyKey} />
          <div className="purchase-order-receipt-header">
          <label>
            <span>Received date</span>
            <input name="received_date" onChange={(event) => setReceivedDate(event.target.value)} required type="date" value={receivedDate} />
          </label>
          <label>
            <span>Shopify receiving location</span>
            <select name="received_location_id" required defaultValue="">
              <option disabled value="">Select location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
          </div>
          {lines.map((line) => {
            const physicallyAccounted = line.receivedQuantity + line.nonSellableQuantity;
            const remaining = line.orderedQuantity === null
              ? null
              : Math.max(0, line.orderedQuantity - physicallyAccounted);
            return (
              <details className="purchase-order-receiving-product" key={line.id} open>
                <summary>{line.productName} <span>Receive / View sizes</span></summary>
                <fieldset disabled={remaining === null || remaining === 0}>
                <legend>{line.productName}</legend>
                {line.pendingAllocations?.length || line.variants.length ? <div className="purchase-order-receiving-table-head" aria-hidden="true"><span>Size</span><span>Ordered</span><span>Previously received</span><span>Sellable now</span><span>Non-sellable now</span></div> : null}
                {line.pendingAllocations?.length ? line.pendingAllocations.map((allocation) => {
                  const outstanding = Math.max(0, allocation.orderedUnits - allocation.sellableReceived - allocation.nonSellableReceived);
                  return <div className="purchase-order-receiving-row" key={allocation.id}><strong>{allocation.supplierSizeLabel || allocation.normalizedSize}</strong><span>{allocation.orderedUnits}</span><span>{allocation.sellableReceived + allocation.nonSellableReceived}</span><label><span className="sr-only">Sellable units received now</span><input aria-label={`${allocation.supplierSizeLabel} sellable units received now`} data-pending-outstanding={outstanding} defaultValue="0" max={outstanding} min="0" name={`pending_allocation:${line.id}:${allocation.id}`} required step="1" type="number" /></label><label><span className="sr-only">Non-sellable units received now</span><input aria-label={`${allocation.supplierSizeLabel} non-sellable units received now`} defaultValue="0" max={outstanding} min="0" name={`pending_non_sellable:${line.id}:${allocation.id}`} required step="1" type="number" /></label></div>;
                }) : line.variants.length ? [...line.variants].sort(compareCanonicalReceivingVariants).map((variant) => {
                  const normalizedSize = variant.size ?? variant.title ?? "Default";
                  const savedAllocation = line.canonicalAllocations?.find((allocation) => allocation.normalizedSize === normalizedSize);
                  const previouslyReceived = receipts.flatMap((receipt) => receipt.lines)
                    .filter((receiptLine) => receiptLine.purchaseOrderLineId === line.id)
                    .flatMap((receiptLine) => receiptLine.allocations)
                    .filter((allocation) => allocation.variantId === variant.id)
                    .reduce((sum, allocation) => sum + allocation.quantityReceived + allocation.nonSellableQuantity, 0);
                  const remainingForSize = savedAllocation
                    ? Math.max(0, savedAllocation.orderedUnits - previouslyReceived)
                    : 0;
                  return (
                  <div className="purchase-order-receiving-row" key={variant.id}>
                    <strong>{normalizedSize}</strong>
                    <span>{savedAllocation?.orderedUnits ?? "Unavailable"}</span>
                    <span>{previouslyReceived}</span>
                    <label>
                    Accepted sellable units — size {normalizedSize}
                    <input data-size-outstanding={remainingForSize} defaultValue="0" max={remainingForSize} min="0" name={`size_allocation:${line.id}:${savedAllocation?.id ?? ""}`} required step="1" type="number" />
                    </label>
                    <label>
                    Non-sellable units — size {normalizedSize}
                    <input defaultValue="0" max={remainingForSize} min="0" name={`size_non_sellable:${line.id}:${savedAllocation?.id ?? ""}`} required step="1" type="number" />
                    </label>
                  </div>
                  );
                }) : <p>Exact active Shopify size variants are unavailable. This line cannot be received safely.</p>}
                {!line.pendingAllocations?.length && !line.canonicalAllocations?.length ? <label className="purchase-order-receiving-nonsellable">
                  Damaged, wrong, or otherwise non-sellable units
                  <input defaultValue="0" max={remaining ?? undefined} min="0" name={`non_sellable:${line.id}`} required step="1" type="number" />
                </label> : null}
                <label className="purchase-order-receiving-note">
                  Optional discrepancy or damage note
                  <textarea name={`note:${line.id}`} rows={2} />
                </label>
                </fieldset>
              </details>
            );
          })}
          <p>
            This records physical receipt and exact size allocation evidence only. Count only accepted sellable units; describe short, damaged, or wrong items in the note. Vault OS does not alter Shopify inventory automatically.
          </p>
          <button className="purchase-order-primary-button" disabled={pending || !idempotencyKey || locations.length === 0 || lines.every((line) => line.orderedQuantity === null || line.receivedQuantity + line.nonSellableQuantity >= line.orderedQuantity || (!line.pendingAllocations?.length && line.variants.length === 0))} type="submit">
            {pending ? "Recording Receipt…" : "Record Receipt"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
