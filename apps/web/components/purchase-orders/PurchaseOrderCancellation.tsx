"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  cancelPurchaseOrderAction,
  type CancelPurchaseOrderState,
} from "@/app/purchase-orders/actions";

const initialState: CancelPurchaseOrderState = { status: "idle", message: "" };

export function PurchaseOrderCancellation({
  purchaseOrderId,
  status,
  cancellationReason,
}: {
  purchaseOrderId: string;
  status: "draft" | "approved" | "ordered" | "cancelled";
  cancellationReason: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(cancelPurchaseOrderAction, initialState);
  const eligible = status === "draft" || status === "approved" || status === "ordered";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">CANCELLATION</p><h2>Purchase-order cancellation</h2></div>
        <span>{status === "cancelled" ? "CANCELLED" : "ACTIVE"}</span>
      </div>

      {status === "cancelled" ? (
        <p><strong>Reason:</strong> {cancellationReason}</p>
      ) : null}

      {eligible ? (
        <form action={action}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <label>
            Required cancellation reason
            <textarea maxLength={1000} name="cancellation_reason" required rows={4} />
          </label>
          <label>
            <input name="cancellation_confirmed" required type="checkbox" value="yes" />
            The operator confirms this purchase order should be cancelled.
          </label>
          <p>Cancellation does not refund payments, contact the supplier, reverse receipts, or alter Shopify or inventory. Orders with payment, shipping, receipt, or inventory-posting evidence are blocked server-side.</p>
          <button disabled={pending} type="submit">
            {pending ? "Cancelling…" : "Cancel Purchase Order"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
