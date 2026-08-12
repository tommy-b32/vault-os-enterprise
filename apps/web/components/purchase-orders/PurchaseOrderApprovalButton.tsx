"use client";

import { useActionState } from "react";

import {
  approvePurchaseOrder,
  type ApprovePurchaseOrderState,
} from "@/app/purchase-orders/actions";

const initialState: ApprovePurchaseOrderState = {
  status: "idle",
  message: "",
};

export function PurchaseOrderApprovalButton({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}) {
  const [state, action, pending] = useActionState(
    approvePurchaseOrder,
    initialState,
  );

  return (
    <form action={action}>
      <input
        name="purchase_order_id"
        type="hidden"
        value={purchaseOrderId}
      />
      <button disabled={pending} type="submit">
        {pending ? "Approving…" : "Approve Draft"}
      </button>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
