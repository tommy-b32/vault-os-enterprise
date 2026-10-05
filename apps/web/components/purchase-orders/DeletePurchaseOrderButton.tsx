"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  deleteDisposablePurchaseOrderAction,
  type DeletePurchaseOrderState,
} from "@/app/purchase-orders/actions";

const initialState: DeletePurchaseOrderState = { status: "idle", message: "" };

export function DeletePurchaseOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteDisposablePurchaseOrderAction, initialState);

  useEffect(() => {
    if (state.status === "success") router.refresh();
  }, [router, state.status]);

  return (
    <form
      action={action}
      className="purchase-order-delete"
      onSubmit={(event) => {
        if (!window.confirm("Delete this purchase order permanently? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
      <button className="purchase-order-delete__button" disabled={pending} type="submit">
        {pending ? "Deleting…" : "Delete"}
      </button>
      {state.status === "error" ? <p className="purchase-order-delete__message" role="alert">{state.message}</p> : null}
    </form>
  );
}
