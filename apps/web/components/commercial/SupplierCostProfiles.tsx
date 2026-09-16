"use client";

import { useActionState, useState } from "react";
import { saveSupplierCostProfile } from "@/app/commercial/actions";
import type { SupplierPurchasingData } from "@/components/commercial/SupplierPurchasing";

const INITIAL_STATE = { status: "idle" as const, message: "" };

export type SupplierCostProfileRecord = { id: string; supplier_id: string; supplier_name: string; cost_type_id: string; cost_type_name: string; supplier_currency: string; exchange_rate_to_gbp: number; pack_cost: number; shipping_cost_per_pack: number; import_cost_per_pack: number; units_per_pack: number; price_updated_at: string; effective_from: string; active: boolean };
type Draft = { supplierId: string; costTypeId: string; costTypeName: string; currency: string; exchangeRate: string; packCost: string; shipping: string; importCost: string; units: string; priceUpdatedAt: string; effectiveFrom: string };
const emptyDraft = (): Draft => ({ supplierId: "", costTypeId: "", costTypeName: "", currency: "GBP", exchangeRate: "1", packCost: "", shipping: "0", importCost: "0", units: "", priceUpdatedAt: "", effectiveFrom: "" });
const draftFrom = (profile: SupplierCostProfileRecord): Draft => ({ supplierId: profile.supplier_id, costTypeId: profile.cost_type_id, costTypeName: profile.cost_type_name, currency: profile.supplier_currency, exchangeRate: String(profile.exchange_rate_to_gbp), packCost: String(profile.pack_cost), shipping: String(profile.shipping_cost_per_pack), importCost: String(profile.import_cost_per_pack), units: String(profile.units_per_pack), priceUpdatedAt: profile.price_updated_at, effectiveFrom: profile.effective_from.slice(0, 16) });
const positive = (value: string) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; };
const nonNegative = (value: string) => { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; };

export function SupplierCostProfiles({ suppliers, profiles }: { suppliers: SupplierPurchasingData[]; profiles: SupplierCostProfileRecord[] }) {
  const [state, action, pending] = useActionState(saveSupplierCostProfile, INITIAL_STATE);
  const [selected, setSelected] = useState<SupplierCostProfileRecord | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const pack = positive(draft.packCost), shipping = nonNegative(draft.shipping), imports = nonNegative(draft.importCost), units = positive(draft.units);
  const fx = draft.currency === "GBP" ? 1 : positive(draft.exchangeRate);
  const landed = pack === null || shipping === null || imports === null ? null : pack + shipping + imports;
  const landedGbp = landed === null || fx === null ? null : landed * fx;
  const unitGbp = landedGbp === null || units === null ? null : landedGbp / units;

  return <section className="commercial-card supplier-cost-profiles">
    <header className="commercial-card-header"><div><p className="vault-eyebrow">Replacement-cost profiles</p><h2>Supplier + canonical cost type</h2><p>Defaults are never inferred from historic product prices. Products inherit only after an explicit choice in their Commercial tab.</p></div></header>
    {profiles.map((profile) => <article key={profile.id}><strong>{profile.supplier_name} · {profile.cost_type_name}</strong><p>{profile.supplier_currency} {profile.pack_cost} pack + {profile.shipping_cost_per_pack} shipping + {profile.import_cost_per_pack} import · {profile.units_per_pack}/pack · FX {profile.exchange_rate_to_gbp} · updated {profile.price_updated_at} · {profile.active ? "Active" : "Inactive"}</p><button onClick={() => { setSelected(profile); setDraft(draftFrom(profile)); }} type="button">Edit</button></article>)}
    <form action={action} className="supplier-minimum-form">
      <label><span>Supplier</span><select name="supplier_id" onChange={(event) => update("supplierId", event.target.value)} required value={draft.supplierId}><option value="">Choose supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplier_name}</option>)}</select></label>
      <div className="supplier-minimum-defined-fields"><label><span>Canonical cost type ID</span><input name="cost_type_id" onChange={(event) => update("costTypeId", event.target.value)} pattern="[a-z0-9_]+" placeholder="tee" required value={draft.costTypeId} /></label><label><span>Cost type name</span><input name="cost_type_name" onChange={(event) => update("costTypeName", event.target.value)} placeholder="Tee" required value={draft.costTypeName} /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier currency</span><select name="supplier_currency" onChange={(event) => update("currency", event.target.value)} value={draft.currency}><option>GBP</option><option>USD</option><option>EUR</option><option>TRY</option></select></label><label><span>Exchange rate to GBP</span><input disabled={draft.currency === "GBP"} min="0.000001" name="exchange_rate_to_gbp" onChange={(event) => update("exchangeRate", event.target.value)} placeholder="Required for non-GBP" step="0.000001" type="number" required value={draft.currency === "GBP" ? "1" : draft.exchangeRate} /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Pack cost</span><input min="0.01" name="pack_cost" onChange={(event) => update("packCost", event.target.value)} step="0.01" type="number" required value={draft.packCost} /></label><label><span>Units per pack</span><input min="1" name="units_per_pack" onChange={(event) => update("units", event.target.value)} step="1" type="number" required value={draft.units} /></label><label><span>Shipping per pack</span><input min="0" name="shipping_cost_per_pack" onChange={(event) => update("shipping", event.target.value)} step="0.01" type="number" value={draft.shipping} /></label><label><span>Import per pack</span><input min="0" name="import_cost_per_pack" onChange={(event) => update("importCost", event.target.value)} step="0.01" type="number" value={draft.importCost} /></label></div>
      <div className="supplier-minimum-defined-fields"><label><span>Supplier price updated</span><input name="price_updated_at" onChange={(event) => update("priceUpdatedAt", event.target.value)} type="date" required value={draft.priceUpdatedAt} /></label><label><span>Effective from</span><input name="effective_from" onChange={(event) => update("effectiveFrom", event.target.value)} type="datetime-local" value={draft.effectiveFrom} /></label></div>
      <label><span>Notes</span><input name="notes" placeholder="Transfer fees are excluded; do not record them as import costs." /></label>
      <button className="supplier-review-button" disabled={pending} type="submit">{pending ? "Saving…" : "Save replacement-cost profile"}</button>
      {state.message ? <p className={`supplier-minimum-feedback is-${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      {landed !== null && landedGbp !== null && unitGbp !== null ? <p>Preview: {draft.currency} {landed.toFixed(2)} landed pack · £{landedGbp.toFixed(2)} landed pack · £{unitGbp.toFixed(2)} per unit.</p> : <p>Preview unavailable until valid costs, units, and FX are entered.</p>}
      {selected ? <small>Editing profile effective from {selected.effective_from}; leave unchanged to preserve it.</small> : null}
    </form>
  </section>;
}
