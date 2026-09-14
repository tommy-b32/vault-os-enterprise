"use client";

import { useActionState } from "react";
import { INITIAL_SUPPLIER_COST_PROFILE_ACTION_STATE, saveSupplierCostProfile } from "@/app/commercial/actions";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";

export function SupplierCostProfiles({ suppliers }: { suppliers: SupplierPurchasingData[] }) {
  const [state, action, pending] = useActionState(saveSupplierCostProfile, INITIAL_SUPPLIER_COST_PROFILE_ACTION_STATE);
  return <section className="commercial-card supplier-cost-profiles">
    <header className="commercial-card-header"><div><p className="vault-eyebrow">Replacement-cost profiles</p><h2>Supplier + canonical cost type</h2><p>Defaults are never inferred from historic product prices. Products inherit only after an explicit choice in their Commercial tab.</p></div></header>
    <form action={action} className="supplier-minimum-form">
      <label><span>Supplier</span><select name="supplier_id" required><option value="">Choose supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label>
      <div className="supplier-minimum-defined-fields"><label><span>Canonical cost type ID</span><input name="cost_type_id" pattern="[a-z0-9_]+" placeholder="tee" required /></label><label><span>Cost type name</span><input name="cost_type_name" placeholder="Tee" required /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier currency</span><select name="supplier_currency" defaultValue="GBP"><option>GBP</option><option>USD</option><option>EUR</option><option>TRY</option></select></label><label><span>Exchange rate to GBP</span><input defaultValue="1" min="0.000001" name="exchange_rate_to_gbp" step="0.000001" type="number" required /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Pack cost</span><input min="0.01" name="pack_cost" step="0.01" type="number" required /></label><label><span>Units per pack</span><input min="1" name="units_per_pack" step="1" type="number" required /></label><label><span>Shipping per pack</span><input defaultValue="0" min="0" name="shipping_cost_per_pack" step="0.01" type="number" /></label><label><span>Import per pack</span><input defaultValue="0" min="0" name="import_cost_per_pack" step="0.01" type="number" /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier price updated</span><input name="price_updated_at" type="date" required /></label><label><span>Effective from</span><input name="effective_from" type="datetime-local" /></label></div>
      <label><span>Notes</span><input name="notes" placeholder="Transfer fees are excluded; do not record them as import costs." /></label>
      <button className="supplier-review-button" disabled={pending} type="submit">{pending ? "Saving…" : "Save replacement-cost profile"}</button>
      {state.message ? <p className={`supplier-minimum-feedback is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </form>
  </section>;
}
