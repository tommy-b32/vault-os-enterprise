"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  recordPurchaseOrderFreightEvidenceAction,
  recordPurchaseOrderFxCommitmentEvidenceAction,
  type RecordPurchaseOrderEvidenceState,
} from "@/app/purchase-orders/actions";
import type { PurchaseOrderEvidenceState } from "@/lib/purchase-orders/PurchaseOrderRepository";

const initialState: RecordPurchaseOrderEvidenceState = { status: "idle", message: "" };

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value);
}

export function PurchaseOrderCostEvidence({
  purchaseOrderId,
  supplierId,
  canRecord,
  evidence,
}: {
  purchaseOrderId: string;
  supplierId: string;
  canRecord: boolean;
  evidence: PurchaseOrderEvidenceState;
}) {
  const router = useRouter();
  const [freightState, freightAction, freightPending] = useActionState(recordPurchaseOrderFreightEvidenceAction, initialState);
  const [fxState, fxAction, fxPending] = useActionState(recordPurchaseOrderFxCommitmentEvidenceAction, initialState);
  const [freightIdempotencyKey] = useState(() => crypto.randomUUID());
  const [fxIdempotencyKey] = useState(() => crypto.randomUUID());
  const [fxEvidenceReference, setFxEvidenceReference] = useState("");

  useEffect(() => {
    if (freightState.status === "success" || fxState.status === "success") router.refresh();
  }, [freightState.status, fxState.status, router]);

  const freight = evidence.freight.evidence;
  const fx = evidence.fxCommitment.evidence;

  return (
    <section className="purchase-order-supplier-draft">
      <div className="purchase-order-section-heading">
        <div><p className="vault-eyebrow">PURCHASE COST EVIDENCE</p><h2>Freight and purchasing commitment</h2></div>
        <span>{evidence.landedCostCompleteness === "landed_cost_pending" ? "LANDED COST PENDING" : "LANDED COST COMPLETE"}</span>
      </div>

      <div className="purchase-order-supplier-totals">
        <div>
          <span>Landed cost</span>
          <strong>{evidence.landedCostCompleteness === "landed_cost_pending" ? "Pending" : "Complete"}</strong>
        </div>
      </div>
      {evidence.landedCostCompleteness === "landed_cost_pending" ? <p>Freight and FX evidence do not allocate landed cost to individual products.</p> : null}

      <div className="purchase-order-preparation-lines">
        <article>
          <strong>Freight Evidence</strong>
          {evidence.freight.state === "available" && freight ? (
            <span>
              {money(freight.freightAmount, freight.currency)} · {freight.shipmentWeight ?? "Weight unavailable"}{freight.weightUnit ? ` ${freight.weightUnit}` : ""}
              {freight.shipmentReference ? ` · ${freight.shipmentReference}` : ""} · {freight.sourceNote}
            </span>
          ) : evidence.freight.state === "conflicting" ? <span>Freight evidence requires review</span> : <span>Freight evidence not recorded</span>}
        </article>
        <article>
          <strong>Purchasing FX Commitment</strong>
          {evidence.fxCommitment.state === "available" && fx ? (
            <span>
              Supplier liability: {money(fx.supplierLiabilityAmount, fx.sourceCurrency)} · FX rate: {fx.fxRateToGbp} · Purchasing commitment: {money(fx.gbpCommitmentAmount, "GBP")} · {fx.liabilityEvidenceMode === "operator_supplied_supplier_liability_evidence" ? "Supplier-confirmed order total" : "Reconciled immutable PO evidence"} · {fx.sourceNote}
            </span>
          ) : evidence.fxCommitment.state === "conflicting" ? <span>FX commitment evidence requires review</span> : <span>FX commitment not recorded</span>}
        </article>
      </div>

      {canRecord && evidence.freight.state === "missing" ? (
        <form action={freightAction}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <input name="supplier_id" type="hidden" value={supplierId} />
          <input name="idempotency_key" suppressHydrationWarning type="hidden" value={freightIdempotencyKey} />
          <label>Currency<input defaultValue="USD" name="currency" required type="text" /></label>
          <label>Freight amount<input min="0.01" name="freight_amount" required step="0.01" type="number" /></label>
          <label>Shipment weight (kg)<input min="0.001" name="shipment_weight" required step="0.001" type="number" /></label>
          <input name="weight_unit" type="hidden" value="kg" />
          <label>Shipment reference<input name="shipment_reference" required type="text" /></label>
          <label>Freight evidence note<textarea name="source_note" required /></label>
          <button disabled={freightPending} type="submit">{freightPending ? "Recording Freight…" : "Record Freight Evidence"}</button>
          {freightState.message ? <p role={freightState.status === "error" ? "alert" : "status"}>{freightState.message}</p> : null}
        </form>
      ) : null}

      {canRecord && evidence.fxCommitment.state === "missing" ? (
        <form action={fxAction}>
          <input name="purchase_order_id" type="hidden" value={purchaseOrderId} />
          <input name="supplier_id" type="hidden" value={supplierId} />
          <input name="idempotency_key" suppressHydrationWarning type="hidden" value={fxIdempotencyKey} />
          <label>Source currency<input defaultValue="USD" name="source_currency" required type="text" /></label>
          <label>Supplier liability<input min="0.01" name="supplier_liability_amount" required step="0.01" type="number" /></label>
          <label>FX rate to GBP<input min="0.000001" name="fx_rate_to_gbp" required step="0.000001" type="number" /></label>
          <label>Evidence mode
            <select defaultValue="operator_supplied_supplier_liability_evidence" name="liability_evidence_mode">
              <option value="operator_supplied_supplier_liability_evidence">Supplier-confirmed order total</option>
              <option value="reconciled_immutable_po_evidence">Reconciled immutable PO evidence</option>
            </select>
          </label>
          <label>Supplier evidence reference
            <textarea onChange={(event) => setFxEvidenceReference(event.target.value)} required />
          </label>
          <input name="source_evidence_snapshot" type="hidden" value={JSON.stringify({ supplier_evidence_reference: fxEvidenceReference.trim() })} />
          <label>FX commitment evidence note<textarea name="source_note" required /></label>
          <button disabled={fxPending || !fxEvidenceReference.trim()} type="submit">{fxPending ? "Recording Commitment…" : "Record FX Commitment"}</button>
          {fxState.message ? <p role={fxState.status === "error" ? "alert" : "status"}>{fxState.message}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
