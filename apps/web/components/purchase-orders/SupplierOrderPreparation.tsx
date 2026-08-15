"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  prepareSupplierOrder,
  type PrepareSupplierOrderState,
  markPurchaseOrderAsOrdered,
  type MarkPurchaseOrderOrderedState,
} from "@/app/purchase-orders/actions";

const initialState: PrepareSupplierOrderState = {
  status: "idle",
  message: "",
  preparedOrder: null,
};

const initialOrderedState: MarkPurchaseOrderOrderedState = {
  status: "idle",
  message: "",
};

export function SupplierOrderPreparation({
  purchaseOrderId,
  purchaseOrderStatus,
}: {
  purchaseOrderId: string;
  purchaseOrderStatus: "approved" | "ordered" | "part_paid" | "paid";
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    prepareSupplierOrder,
    initialState,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [orderedState, orderedAction, orderingPending] = useActionState(
    markPurchaseOrderAsOrdered,
    initialOrderedState,
  );

  useEffect(() => {
    if (orderedState.status === "success") router.refresh();
  }, [orderedState.status, router]);

  async function copyOrderText() {
    if (!state.preparedOrder) return;

    try {
      await navigator.clipboard.writeText(state.preparedOrder.orderText);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="purchase-order-preparation">
      <form action={action}>
        <input
          name="purchase_order_id"
          type="hidden"
          value={purchaseOrderId}
        />
        <button disabled={pending} type="submit">
          {pending ? "Preparing…" : "Prepare Supplier Order"}
        </button>
      </form>

      {state.status === "error" ? (
        <p role="alert">{state.message}</p>
      ) : null}

      {state.preparedOrder ? (
        <div className="purchase-order-preparation-review">
          <div>
            <p className="vault-eyebrow">SUPPLIER ORDER REVIEW</p>
            <h2>{state.preparedOrder.supplierName}</h2>
            <p>Nothing has been sent automatically.</p>
          </div>

          <pre>{state.preparedOrder.orderText}</pre>

          <div className="purchase-order-preparation-lines">
            {state.preparedOrder.lines.map((line) => (
              <article key={line.styleId}>
                <div className="purchase-order-preparation-image">
                  {line.supplierImageUrl ? (
                    // Canonical evidence is captured server-side from the accepted supplier catalogue match.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={line.productName}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={line.supplierImageUrl}
                    />
                  ) : (
                    <span>Image unavailable for this saved snapshot.</span>
                  )}
                </div>
                <div>
                  <strong>{line.productName}</strong>
                  <span>
                    {line.recommendedPacks}{" "}
                    {line.recommendedPacks === 1 ? "pack" : "packs"}
                    {" / "}
                    {line.recommendedUnits === null
                      ? "Units unavailable"
                      : `${line.recommendedUnits} ${
                          line.recommendedUnits === 1 ? "unit" : "units"
                        }`}
                  </span>
                </div>
              </article>
            ))}
          </div>

          <button type="button" onClick={copyOrderText}>
            {copyState === "copied" ? "Copied" : "Copy Order Text"}
          </button>
          {copyState === "error" ? (
            <p role="alert">Copy failed. Select and copy the text manually.</p>
          ) : null}

          {purchaseOrderStatus === "approved" ? (
            <form action={orderedAction}>
              <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
              <label>
                <input name="placement_confirmed" required type="checkbox" value="yes" />
                The operator confirms this purchase order has actually been placed with the supplier.
              </label>
              <p>Vault OS has not sent or placed this order automatically.</p>
              <button disabled={orderingPending} type="submit">
                {orderingPending ? "Marking as Orderedâ€¦" : "Mark as Ordered"}
              </button>
              {orderedState.message ? (
                <p role={orderedState.status === "error" ? "alert" : "status"}>
                  {orderedState.message}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
