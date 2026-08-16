"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  markPurchaseOrderAsShipped,
  type MarkPurchaseOrderShippedState,
} from "@/app/purchase-orders/actions";

const initialState: MarkPurchaseOrderShippedState = { status: "idle", message: "" };

export function PurchaseOrderShipping({
  purchaseOrderId,
  status,
  dispatchDate,
  carrier,
  trackingReference,
}: {
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  dispatchDate: string | null;
  carrier: string | null;
  trackingReference: string | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(markPurchaseOrderAsShipped, initialState);
  const [selectedDispatchDate, setSelectedDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const canMarkShipped = status === "ordered" || status === "part_paid" || status === "paid";

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">SHIPPING</p><h2>Supplier dispatch</h2></div>
        <span>{dispatchDate ? "DISPATCHED" : "AWAITING DISPATCH"}</span>
      </div>

      {dispatchDate ? (
        <div className="purchase-order-supplier-totals">
          <div><span>Dispatch date</span><strong>{dispatchDate}</strong></div>
          <div><span>Carrier</span><strong>{carrier ?? "Not supplied"}</strong></div>
          <div><span>Tracking reference</span><strong>{trackingReference ?? "Not supplied"}</strong></div>
        </div>
      ) : <p>No supplier dispatch evidence recorded.</p>}

      {canMarkShipped ? (
        <form action={action}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <label>
            Actual dispatch date
            <input max={new Date().toISOString().slice(0, 10)} name="dispatch_date"
              onChange={(event) => setSelectedDispatchDate(event.target.value)} required
              type="date" value={selectedDispatchDate} />
          </label>
          <label>
            Carrier (optional)
            <input maxLength={200} name="carrier" type="text" />
          </label>
          <label>
            Tracking reference (optional)
            <input maxLength={200} name="tracking_reference" type="text" />
          </label>
          <label>
            <input name="dispatch_confirmed" required type="checkbox" value="yes" />
            The operator confirms the supplier has genuinely dispatched this purchase order.
          </label>
          <p>This records supplier-provided dispatch evidence only. Vault OS does not contact the supplier or carrier, alter payment, call Shopify, update inventory, or mark stock received.</p>
          <button disabled={pending} type="submit">
            {pending ? "Recording Dispatch…" : "Mark as Shipped"}
          </button>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
