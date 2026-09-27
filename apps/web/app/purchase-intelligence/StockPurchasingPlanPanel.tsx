"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addAllocatedStockPurchasingPlanRecommendationAction } from "./actions";
import { saveStockPurchasingBudget, type StockBudgetActionState } from "./stock-budget-actions";
import { planningAvailabilityMessage, type StockPurchasingPlan } from "@/lib/stock-purchasing-plan";

const initial: StockBudgetActionState = { status: "idle", message: "" };
const gbp = (value: number | null) => value === null ? "Unavailable" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

export default function StockPurchasingPlanPanel({ plan }: { plan: StockPurchasingPlan }) {
  const [state, action, pending] = useActionState(saveStockPurchasingBudget, initial);
  const supplierGroups = new Map<string, typeof plan.items>();
  for (const item of plan.items) supplierGroups.set(item.supplierId, [...(supplierGroups.get(item.supplierId) ?? []), item]);
  return <section className="purchase-intelligence-diagnostics" aria-labelledby="stock-purchasing-plan">
    <div className="purchase-intelligence-diagnostics-heading"><div><p className="vault-eyebrow">STOCK PURCHASING PLAN</p><h2 id="stock-purchasing-plan">Budgeted governed replenishment</h2><p>Whole trusted Stage 3 recommendations only. Budget and cash safety remain separate constraints.</p></div><span>{plan.usableCapacityGbp === null ? "Planning blocked" : "Planning current"}</span></div>
    <form action={action} className="purchase-intelligence-notice"><label>Stock Purchasing Budget (GBP)<input name="stock_purchasing_budget_gbp" type="number" min="0" step="0.01" defaultValue={plan.budgetGbp ?? ""} required /></label><button className="vault-primary-button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save budget"}</button>{state.status !== "idle" ? <span role={state.status === "error" ? "alert" : "status"}>{state.message}</span> : null}</form>
    <div className="purchase-intelligence-metrics">{[["STOCK BUDGET", gbp(plan.budgetGbp)], ["WALLET CAPACITY", gbp(plan.walletCapacityGbp)], ["USABLE CAPACITY", gbp(plan.usableCapacityGbp)], ["GOVERNED REPLENISHMENT", gbp(plan.identifiedCostGbp)], ["ALLOCATED", gbp(plan.allocatedCostGbp)], ["UNALLOCATED", gbp(plan.unallocatedBudgetGbp)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    {plan.usableCapacityGbp === null ? <div className="purchase-intelligence-rejections"><strong>Planning is fail-closed.</strong><span>{planningAvailabilityMessage(plan.budgetGbp, plan.walletCapacityGbp)}</span></div> : null}
    {[...supplierGroups.entries()].map(([supplierId, items]) => <section className="purchase-intelligence-supplier" key={supplierId}><div className="purchase-intelligence-supplier-heading"><div><p className="vault-eyebrow">SUPPLIER PLAN</p><h3>{items[0]?.supplierName ?? "Supplier identity unavailable"}</h3></div><span>{items.length} styles</span></div><div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Product / design</th><th>State</th><th>Pack fit</th><th>Packs / units</th><th>Cost</th><th>Planning decision</th><th>Draft PO</th></tr></thead><tbody>{items.map((item) => <tr key={item.recommendationId}><td><strong>{item.productName ?? "Identity unavailable"}</strong><small>{item.modelDesign}</small></td><td>{item.stockState}</td><td>{item.packFit ?? "Evidence unavailable"}</td><td>{item.recommendedPackCount} / {item.recommendedTotalUnits}</td><td>{gbp(item.estimatedLandedCostGbp)}</td><td><strong>{item.planningState}</strong><small>{item.planningReason}</small></td><td>{item.planningState === "ALLOCATED" ? <DraftButton styleId={item.styleId} parentProductId={item.parentProductId} /> : "—"}</td></tr>)}</tbody></table></div></section>)}
  </section>;
}

function DraftButton({ styleId, parentProductId }: { styleId: string; parentProductId: string }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ status: "idle" } | { status: "success"; purchaseOrderId: string } | { status: "error"; message: string }>({ status: "idle" });
  const add = async () => {
    if (pending) return;
    setPending(true);
    setFeedback({ status: "idle" });
    try {
      const result = await addAllocatedStockPurchasingPlanRecommendationAction({ styleId, parentProductId, idempotencyKey: crypto.randomUUID() });
      setFeedback(result.success ? { status: "success", purchaseOrderId: result.purchaseOrderId } : { status: "error", message: result.message });
    } catch {
      setFeedback({ status: "error", message: "The recommendation could not be added to a draft. Refresh and try again." });
    } finally {
      setPending(false);
    }
  };
  return <div aria-live="polite">
    <button className="vault-secondary-button" type="button" onClick={add} disabled={pending} aria-busy={pending}>{pending ? "Adding…" : "Add to Draft PO"}</button>
    {feedback.status === "success" ? <span><strong>Added to Draft PO.</strong> <Link href={`/purchase-orders/${feedback.purchaseOrderId}`}>View Draft PO →</Link></span> : null}
    {feedback.status === "error" ? <span role="alert">{feedback.message}</span> : null}
  </div>;
}
