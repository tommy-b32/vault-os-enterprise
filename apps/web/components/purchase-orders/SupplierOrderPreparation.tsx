"use client";

import { useActionState, useState } from "react";

import {
  prepareSupplierOrder,
  type PrepareSupplierOrderState,
} from "@/app/purchase-orders/actions";

const initialState: PrepareSupplierOrderState = {
  status: "idle",
  message: "",
  preparedOrder: null,
};

export function SupplierOrderPreparation({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}) {
  const [state, action, pending] = useActionState(
    prepareSupplierOrder,
    initialState,
  );
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );

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
                  {line.productImageUrl ? (
                    // Canonical URLs are captured server-side from vault_products.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      alt={line.productName}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={line.productImageUrl}
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
        </div>
      ) : null}
    </section>
  );
}
