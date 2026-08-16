"use client";

import { useActionState, useEffect, useState } from "react";
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
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const eligible = status === "draft" || status === "approved" || status === "ordered";
  const canSubmit = reason.trim().length > 0 && confirmed && !pending;

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft purchase-order-cancellation">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">CANCELLATION</p><h2>Purchase-order cancellation</h2></div>
        <span>{status === "cancelled" ? "CANCELLED" : "ACTIVE"}</span>
      </div>

      {status === "cancelled" ? (
        <div className="purchase-order-cancellation__evidence">
          <span>Cancellation reason</span>
          <p>{cancellationReason}</p>
        </div>
      ) : null}

      {eligible ? (
        <form action={action} className="purchase-order-cancellation__form">
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <label className="purchase-order-cancellation__field">
            <span>Cancellation reason</span>
            <small>Explain why this purchase order is being cancelled.</small>
            <textarea
              maxLength={1000}
              name="cancellation_reason" required
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              value={reason}
            />
          </label>
          <label className="purchase-order-cancellation__confirmation">
            <input
              checked={confirmed}
              name="cancellation_confirmed" required
              onChange={(event) => setConfirmed(event.target.checked)}
              type="checkbox"
              value="yes"
            />
            <span>I confirm this purchase order should be cancelled.</span>
          </label>
          <div className="purchase-order-cancellation__warning">
            <strong>Cancellation is an administrative record only.</strong>
            <p>It does not refund payments, contact the supplier, reverse receipts, or alter Shopify or inventory. Orders with payment, shipping, receipt, or inventory-posting evidence are blocked server-side.</p>
          </div>
          <button className="purchase-order-cancellation__button" disabled={!canSubmit} type="submit">
            {pending ? "Cancelling…" : "Cancel Purchase Order"}
          </button>
          {state.message ? (
            <p className="purchase-order-cancellation__message" role={state.status === "error" ? "alert" : "status"}>
              {state.message}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
