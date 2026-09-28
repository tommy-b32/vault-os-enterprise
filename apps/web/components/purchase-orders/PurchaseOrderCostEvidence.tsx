"use client";

import { useActionState, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { recordPurchaseOrderFreightEvidenceAction, recordPurchaseOrderFxCommitmentEvidenceAction, type RecordPurchaseOrderEvidenceState } from "@/app/purchase-orders/actions";
import type { PurchaseOrderEvidenceState } from "@/lib/purchase-orders/PurchaseOrderRepository";

const initialState: RecordPurchaseOrderEvidenceState = { status: "idle", message: "" };
const styles = {
  section: { display: "grid", width: "100%", minWidth: 0, maxWidth: "none", boxSizing: "border-box", justifySelf: "stretch", alignSelf: "stretch", gap: "18px" }, heading: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }, badge: { padding: "7px 11px", border: "1px solid var(--vault-border-gold)", borderRadius: "999px", color: "var(--vault-gold)", background: "rgba(205, 172, 93, 0.08)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em", whiteSpace: "nowrap" }, introduction: { margin: "-8px 0 0", color: "var(--vault-muted)", fontSize: "13px", lineHeight: 1.6 }, panels: { display: "grid", width: "100%", minWidth: 0, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "16px" }, panel: { display: "grid", width: "100%", minWidth: 0, gridTemplateRows: "auto 1fr", gap: "16px", padding: "18px", boxSizing: "border-box", border: "1px solid var(--vault-border)", borderRadius: "14px", background: "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))" }, panelHeading: { margin: 0, minWidth: 0, color: "#f4f1e9", fontSize: "13px", letterSpacing: "0.09em", textTransform: "uppercase", overflowWrap: "anywhere" }, evidenceCard: { display: "grid", width: "100%", minWidth: 0, boxSizing: "border-box", gap: "12px", padding: "15px", border: "1px solid rgba(205, 172, 93, 0.3)", borderRadius: "10px", background: "rgba(7, 10, 16, 0.62)" }, evidenceAmount: { color: "#f4f1e9", fontSize: "21px", fontWeight: 700, lineHeight: 1.2 }, evidenceGrid: { display: "grid", width: "100%", minWidth: 0, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: "10px 14px", margin: 0 }, evidenceItem: { minWidth: 0, display: "grid", gap: "3px" }, evidenceLabel: { color: "var(--vault-muted)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }, evidenceValue: { margin: 0, color: "#e7e2d7", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere", wordBreak: "break-word" }, form: { display: "grid", gap: "13px", paddingTop: "16px", borderTop: "1px solid var(--vault-border)" }, formTitle: { margin: 0, color: "#e7e2d7", fontSize: "12px", fontWeight: 700 }, fields: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "12px" }, field: { display: "grid", gap: "6px", minWidth: 0, color: "#d7d0c2", fontSize: "11px", fontWeight: 600 }, fullWidth: { gridColumn: "1 / -1" }, control: { width: "100%", boxSizing: "border-box", minHeight: "39px", padding: "9px 10px", border: "1px solid rgba(235, 224, 195, 0.34)", borderRadius: "7px", outline: "none", color: "#f4f1e9", background: "#10141d", font: "inherit" }, textarea: { minHeight: "76px", resize: "vertical" }, primaryButton: { justifySelf: "start", minHeight: "40px", padding: "10px 15px", border: "1px solid #d2ad50", borderRadius: "7px", color: "#17130b", background: "linear-gradient(135deg, #e2c16f, #b99135)", boxShadow: "0 6px 18px rgba(0,0,0,0.22)", fontWeight: 800, cursor: "pointer" }, status: { margin: 0, color: "var(--vault-muted)", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" },
} satisfies Record<string, CSSProperties>;
function money(value: number, currency: string): string { return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(value); }
function supplierEvidenceReference(snapshot: Record<string, unknown>): string { const reference = snapshot.supplier_evidence_reference; return typeof reference === "string" && reference.trim() ? reference.trim() : "Not supplied"; }
function EvidenceItem({ label, value, fullWidth = false }: { label: string; value: string; fullWidth?: boolean }) { return <div style={{ ...styles.evidenceItem, ...(fullWidth ? styles.fullWidth : {}) }}><dt style={styles.evidenceLabel}>{label}</dt><dd style={styles.evidenceValue}>{value}</dd></div>; }

export function PurchaseOrderCostEvidence({ purchaseOrderId, supplierId, canRecord, evidence }: { purchaseOrderId: string; supplierId: string; canRecord: boolean; evidence: PurchaseOrderEvidenceState; }) {
  const router = useRouter();
  const [freightState, freightAction, freightPending] = useActionState(recordPurchaseOrderFreightEvidenceAction, initialState);
  const [fxState, fxAction, fxPending] = useActionState(recordPurchaseOrderFxCommitmentEvidenceAction, initialState);
  const [freightIdempotencyKey] = useState(() => crypto.randomUUID());
  const [fxIdempotencyKey] = useState(() => crypto.randomUUID());
  const [fxEvidenceReference, setFxEvidenceReference] = useState("");
  useEffect(() => { if (freightState.status === "success" || fxState.status === "success") router.refresh(); }, [freightState.status, fxState.status, router]);
  const freight = evidence.freight.evidence;
  const fx = evidence.fxCommitment.evidence;

  return <section className="purchase-order-supplier-draft" style={styles.section}>
    <style>{`
      .purchase-order-cost-evidence__grid {
        display: grid !important;
        width: 100% !important;
        min-width: 0;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) !important;
        gap: 16px;
      }

      .purchase-order-cost-evidence__grid > article {
        display: grid !important;
        width: 100% !important;
        min-width: 0;
        grid-template-columns: minmax(0, 1fr) !important;
        grid-template-rows: auto auto !important;
        align-items: start !important;
        gap: 16px;
      }

      @media (max-width: 760px) {
        .purchase-order-cost-evidence__grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }
    `}</style>
    <div style={styles.heading}><div><p className="vault-eyebrow">PURCHASE COST EVIDENCE</p><h2>Freight and purchasing commitment</h2></div><span style={styles.badge}>{evidence.landedCostCompleteness === "landed_cost_pending" ? "LANDED COST PENDING" : "LANDED COST COMPLETE"}</span></div>
    <p style={styles.introduction}>Freight and FX evidence do not allocate landed cost to individual products. They reserve supplier purchasing capacity.</p>
    <div className="purchase-order-cost-evidence__grid" style={styles.panels}>
      <article style={styles.panel}><h3 style={styles.panelHeading}>Freight evidence</h3>{evidence.freight.state === "available" && freight ? <div style={styles.evidenceCard}><strong style={styles.evidenceAmount}>{money(freight.freightAmount, freight.currency)}</strong><dl style={styles.evidenceGrid}><EvidenceItem label="Shipment weight" value={`${freight.shipmentWeight ?? "Weight unavailable"}${freight.weightUnit ? ` ${freight.weightUnit}` : ""}`} /><EvidenceItem label="Reference" value={freight.shipmentReference || "Not supplied"} /><EvidenceItem fullWidth label="Note" value={freight.sourceNote} /></dl></div> : evidence.freight.state === "conflicting" ? <p style={styles.status}>Freight evidence requires review.</p> : <p style={styles.status}>Freight evidence not recorded.</p>}</article>
      <article style={styles.panel}><h3 style={styles.panelHeading}>Purchasing FX commitment</h3>{evidence.fxCommitment.state === "available" && fx ? <div style={styles.evidenceCard}><strong style={styles.evidenceAmount}>{money(fx.gbpCommitmentAmount, "GBP")}</strong><dl style={styles.evidenceGrid}><EvidenceItem label="Supplier liability" value={money(fx.supplierLiabilityAmount, fx.sourceCurrency)} /><EvidenceItem label="FX rate" value={`${fx.fxRateToGbp} GBP/${fx.sourceCurrency}`} /><EvidenceItem label="Evidence" value={fx.liabilityEvidenceMode === "operator_supplied_supplier_liability_evidence" ? "Supplier-confirmed order total" : "Reconciled immutable PO evidence"} /><EvidenceItem label="Reference" value={supplierEvidenceReference(fx.sourceEvidenceSnapshot)} /><EvidenceItem fullWidth label="Note" value={fx.sourceNote} /></dl></div> : evidence.fxCommitment.state === "conflicting" ? <p style={styles.status}>FX commitment evidence requires review.</p> : <p style={styles.status}>FX commitment not recorded.</p>}</article>
    </div>
    {canRecord && evidence.freight.state === "missing" ? <form action={freightAction} style={styles.form}><h3 style={styles.formTitle}>Record freight evidence</h3><input name="purchase_order_id" type="hidden" value={purchaseOrderId} /><input name="supplier_id" type="hidden" value={supplierId} /><input name="idempotency_key" suppressHydrationWarning type="hidden" value={freightIdempotencyKey} /><div style={styles.fields}><label style={styles.field}>Currency<input defaultValue="USD" name="currency" required style={styles.control} type="text" /></label><label style={styles.field}>Freight amount<input min="0.01" name="freight_amount" required step="0.01" style={styles.control} type="number" /></label><label style={styles.field}>Shipment weight (kg)<input min="0.001" name="shipment_weight" required step="0.001" style={styles.control} type="number" /></label><label style={styles.field}>Shipment reference<input name="shipment_reference" required style={styles.control} type="text" /></label><label style={{ ...styles.field, ...styles.fullWidth }}>Freight evidence note<textarea name="source_note" required style={{ ...styles.control, ...styles.textarea }} /></label></div><input name="weight_unit" type="hidden" value="kg" /><button disabled={freightPending} style={styles.primaryButton} type="submit">{freightPending ? "Recording Freight…" : "Record Freight Evidence"}</button>{freightState.message ? <p role={freightState.status === "error" ? "alert" : "status"} style={styles.status}>{freightState.message}</p> : null}</form> : null}
    {canRecord && evidence.fxCommitment.state === "missing" ? <form action={fxAction} style={styles.form}><h3 style={styles.formTitle}>Record purchasing FX commitment</h3><input name="purchase_order_id" type="hidden" value={purchaseOrderId} /><input name="supplier_id" type="hidden" value={supplierId} /><input name="idempotency_key" suppressHydrationWarning type="hidden" value={fxIdempotencyKey} /><div style={styles.fields}><label style={styles.field}>Source currency<input defaultValue="USD" name="source_currency" required style={styles.control} type="text" /></label><label style={styles.field}>Supplier liability<input min="0.01" name="supplier_liability_amount" required step="0.01" style={styles.control} type="number" /></label><label style={styles.field}>FX rate to GBP<input min="0.000001" name="fx_rate_to_gbp" required step="0.000001" style={styles.control} type="number" /></label><label style={styles.field}>Evidence mode<select defaultValue="operator_supplied_supplier_liability_evidence" name="liability_evidence_mode" style={styles.control}><option value="operator_supplied_supplier_liability_evidence">Supplier-confirmed order total</option><option value="reconciled_immutable_po_evidence">Reconciled immutable PO evidence</option></select></label><label style={{ ...styles.field, ...styles.fullWidth }}>Supplier evidence reference<textarea onChange={(event) => setFxEvidenceReference(event.target.value)} required style={{ ...styles.control, ...styles.textarea }} /></label><label style={{ ...styles.field, ...styles.fullWidth }}>FX commitment evidence note<textarea name="source_note" required style={{ ...styles.control, ...styles.textarea }} /></label></div><input name="source_evidence_snapshot" type="hidden" value={JSON.stringify({ supplier_evidence_reference: fxEvidenceReference.trim() })} /><button disabled={fxPending || !fxEvidenceReference.trim()} style={styles.primaryButton} type="submit">{fxPending ? "Recording Commitment…" : "Record FX Commitment"}</button>{fxState.message ? <p role={fxState.status === "error" ? "alert" : "status"} style={styles.status}>{fxState.message}</p> : null}</form> : null}
  </section>;
}
