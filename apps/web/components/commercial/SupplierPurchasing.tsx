"use client";

import { useActionState, useState } from "react";

import {
  INITIAL_SUPPLIER_MINIMUM_ACTION_STATE,
  updateSupplierMinimumPolicy,
} from "@/app/commercial/actions";
import {
  SupplierMinimumContract,
  type SupplierMinimumState,
} from "@/lib/supplier/SupplierMinimum";

export type SupplierPurchasingData = {
  id: string;
  is_active: boolean;
  supplier_name: string;
  default_lead_time_days: number;
  minimum_order_value: number | null;
  currency_code: string;
  notes: string | null;
};

function stateCopy(state: SupplierMinimumState, currency: string, value: number | null) {
  if (state === "unknown") {
    return { label: "Unknown", detail: "Blocks trusted buying recommendations." };
  }
  if (state === "not_applicable") {
    return { label: "No minimum", detail: "Explicitly confirmed by the operator." };
  }
  return {
    label: `${currency} ${value?.toFixed(2)}`,
    detail: "Defined policy; the supplier basket still requires later evaluation.",
  };
}

function SupplierMinimumEditor({ supplier }: { supplier: SupplierPurchasingData }) {
  const minimum = SupplierMinimumContract.create({
    value: supplier.minimum_order_value,
    currency: supplier.currency_code,
  });
  const [policy, setPolicy] = useState<SupplierMinimumState>(minimum.state);
  const [state, action, pending] = useActionState(
    updateSupplierMinimumPolicy,
    INITIAL_SUPPLIER_MINIMUM_ACTION_STATE,
  );
  const copy = stateCopy(minimum.state, supplier.currency_code, minimum.value);

  return (
    <article className="supplier-purchasing-card">
      <div className="supplier-purchasing-topline">
        <div>
          <span>{supplier.is_active ? "Active supplier" : "Inactive supplier"}</span>
          <h3>{supplier.supplier_name}</h3>
        </div>
        <span className={`supplier-readiness state-${minimum.state}`}>{copy.label}</span>
      </div>

      <div className="supplier-purchasing-metrics">
        <div><span>Lead time</span><strong>{supplier.default_lead_time_days} days</strong></div>
        <div><span>Currency</span><strong>{supplier.currency_code}</strong></div>
        <div><span>Minimum policy</span><strong>{copy.label}</strong></div>
      </div>

      <p className="supplier-minimum-detail">{copy.detail}</p>

      <form action={action} className="supplier-minimum-form">
        <input name="supplier_id" type="hidden" value={supplier.id} />
        <label>
          <span>Minimum-order policy</span>
          <select
            name="minimum_order_policy"
            onChange={(event) => setPolicy(event.target.value as SupplierMinimumState)}
            value={policy}
          >
            <option value="unknown">Unknown</option>
            <option value="not_applicable">No minimum / Not applicable</option>
            <option value="defined">Defined monetary minimum</option>
          </select>
        </label>

        {policy === "defined" ? (
          <label>
            <span>Minimum value ({supplier.currency_code})</span>
            <input
              defaultValue={minimum.state === "defined" ? minimum.value ?? "" : ""}
              inputMode="decimal"
              min="0.01"
              name="minimum_order_value"
              required
              step="0.01"
              type="number"
            />
          </label>
        ) : null}

        <button className="supplier-review-button" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save minimum policy"}
        </button>
        {state.message ? (
          <p
            className={`supplier-minimum-feedback is-${state.status}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

export function SupplierPurchasing({ suppliers }: { suppliers: SupplierPurchasingData[] }) {
  return (
    <section className="commercial-card supplier-purchasing">
      <header className="commercial-card-header">
        <div>
          <p className="vault-eyebrow">Supplier Purchasing</p>
          <h2>Supplier readiness</h2>
          <p>Maintain the canonical minimum-order policy used by trusted buying decisions.</p>
        </div>
      </header>
      <div className="supplier-purchasing-grid">
        {suppliers.map((supplier) => (
          <SupplierMinimumEditor key={supplier.id} supplier={supplier} />
        ))}
      </div>
    </section>
  );
}
