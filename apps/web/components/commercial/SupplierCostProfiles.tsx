"use client";

import { useActionState, useState } from "react";
import { saveSupplierCostProfile } from "@/app/commercial/actions";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";

const INITIAL_SUPPLIER_COST_PROFILE_ACTION_STATE = { status: "idle" as const, message: "" };

export type SupplierCostProfileRecord = { id: string; supplier_id: string; supplier_name: string; cost_type_id: string; cost_type_name: string; supplier_currency: string; exchange_rate_to_gbp: number; pack_cost: number; shipping_cost_per_pack: number; import_cost_per_pack: number; units_per_pack: number; price_updated_at: string; active: boolean };

export function SupplierCostProfiles({ suppliers, profiles }: { suppliers: SupplierPurchasingData[]; profiles: SupplierCostProfileRecord[] }) {
  const [state, action, pending] = useActionState(saveSupplierCostProfile, INITIAL_SUPPLIER_COST_PROFILE_ACTION_STATE);
  const [selected, setSelected] = useState<SupplierCostProfileRecord | null>(null);
  const landed = selected ? selected.pack_cost + selected.shipping_cost_per_pack + selected.import_cost_per_pack : null;
  return <section className="commercial-card supplier-cost-profiles">
    <header className="commercial-card-header"><div><p className="vault-eyebrow">Replacement-cost profiles</p><h2>Supplier + canonical cost type</h2><p>Defaults are never inferred from historic product prices. Products inherit only after an explicit choice in their Commercial tab.</p></div></header>
    {profiles.map((profile) => <article key={profile.id}><strong>{profile.supplier_name} · {profile.cost_type_name}</strong><p>{profile.supplier_currency} {profile.pack_cost} pack + {profile.shipping_cost_per_pack} shipping + {profile.import_cost_per_pack} import · {profile.units_per_pack}/pack · FX {profile.exchange_rate_to_gbp} · updated {profile.price_updated_at} · {profile.active ? "Active" : "Inactive"}</p><button onClick={() => setSelected(profile)} type="button">Edit</button></article>)}
    <form action={action} className="supplier-minimum-form" key={selected?.id ?? "new"}>
      <label><span>Supplier</span><select defaultValue={selected?.supplier_id ?? ""} name="supplier_id" required><option value="">Choose supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label>
      <div className="supplier-minimum-defined-fields"><label><span>Canonical cost type ID</span><input defaultValue={selected?.cost_type_id ?? ""} name="cost_type_id" pattern="[a-z0-9_]+" placeholder="tee" required /></label><label><span>Cost type name</span><input defaultValue={selected?.cost_type_name ?? ""} name="cost_type_name" placeholder="Tee" required /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier currency</span><select defaultValue={selected?.supplier_currency ?? "GBP"} name="supplier_currency"><option>GBP</option><option>USD</option><option>EUR</option><option>TRY</option></select></label><label><span>Exchange rate to GBP</span><input defaultValue={selected?.exchange_rate_to_gbp ?? ""} min="0.000001" name="exchange_rate_to_gbp" placeholder="Required for non-GBP" step="0.000001" type="number" required /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Pack cost</span><input defaultValue={selected?.pack_cost ?? ""} min="0.01" name="pack_cost" step="0.01" type="number" required /></label><label><span>Units per pack</span><input defaultValue={selected?.units_per_pack ?? ""} min="1" name="units_per_pack" step="1" type="number" required /></label><label><span>Shipping per pack</span><input defaultValue={selected?.shipping_cost_per_pack ?? 0} min="0" name="shipping_cost_per_pack" step="0.01" type="number" /></label><label><span>Import per pack</span><input defaultValue={selected?.import_cost_per_pack ?? 0} min="0" name="import_cost_per_pack" step="0.01" type="number" /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier price updated</span><input defaultValue={selected?.price_updated_at ?? ""} name="price_updated_at" type="date" required /></label><label><span>Effective from</span><input name="effective_from" type="datetime-local" /></label></div>
      <label><span>Notes</span><input name="notes" placeholder="Transfer fees are excluded; do not record them as import costs." /></label>
      <button className="supplier-review-button" disabled={pending} type="submit">{pending ? "Saving…" : "Save replacement-cost profile"}</button>
      {state.message ? <p className={`supplier-minimum-feedback is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      {landed !== null ? <p>Preview: {selected!.supplier_currency} {landed.toFixed(2)} landed pack · £{(landed * selected!.exchange_rate_to_gbp).toFixed(2)} landed pack · £{(landed * selected!.exchange_rate_to_gbp / selected!.units_per_pack).toFixed(2)} per unit.</p> : null}
    </form>
  </section>;
}
