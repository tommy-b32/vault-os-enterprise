"use client";
import { useActionState } from "react";
import { closePurchaseOrder, type MarkPurchaseOrderShippedState } from "@/app/purchase-orders/actions";
const initialState: MarkPurchaseOrderShippedState = { status: "idle", message: "" };
export function PurchaseOrderClosure({ purchaseOrderId, status }: { purchaseOrderId: string; status: "received" | "closed" }) {
  const [state, action, pending] = useActionState(closePurchaseOrder, initialState);
  if (status === "closed") return <section><p className="vault-eyebrow">GOVERNED COMPLETION</p><strong>Closed</strong><p>This purchase order has passed the governed completion checks.</p></section>;
  return <section><p className="vault-eyebrow">GOVERNED COMPLETION</p><h2>Close purchase order</h2><p>Closure verifies physical receipt, resolved Shopify posting, reconciled supplier payment, and complete governed landed-cost evidence.</p><form action={action}><input type="hidden" name="purchase_order_id" value={purchaseOrderId}/><label><input required name="closure_confirmed" type="checkbox" value="yes"/> I confirm this received order is ready for governed closure.</label><button className="vault-primary-button" disabled={pending} type="submit">{pending ? "Closing…" : "Close purchase order"}</button></form>{state.status !== "idle" ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}</section>;
}
