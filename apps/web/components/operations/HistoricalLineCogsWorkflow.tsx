"use client";

import { useEffect, useState } from "react";

type Preview = {
  prefill: { orderNumber: string; lineTitle: string; variantTitle: string; quantity: number; deliveryReference: string; unitLandedCogsGbp: number; attestation: string };
  line: { title: string | null; variantTitle: string | null; quantity: number; cogsStatus: string; saleAt: string | null } | null;
  batch: { reference: string; receivedAt: string | null; receiptStatus: string; validationStatus: string; approvalStatus: string; computedUnitCost: number | null } | null;
  eligible: boolean;
  operatorRole: "owner" | "operator";
  proposal: { id: string; approval_status: "PENDING" | "APPROVED" | "REJECTED"; owner_attestation: string; proposed_at: string; approved_at: string | null } | null;
  audit: Array<{ id: string; event_type: string; note: string; recorded_at: string }>;
};

const styles = `
  .historical-cogs{max-width:980px;padding:32px}.historical-cogs h1,.historical-cogs h2{margin:0;color:var(--vault-text)}.historical-cogs__intro{max-width:760px;color:var(--vault-text-soft);line-height:1.55}.historical-cogs__card{margin-top:22px;padding:22px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-md);background:var(--vault-panel);box-shadow:var(--vault-shadow)}.historical-cogs__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px;margin:18px 0}.historical-cogs__grid div{padding:12px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);background:var(--vault-panel-soft)}.historical-cogs dt{color:var(--vault-muted);font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.historical-cogs dd{margin:6px 0 0;color:var(--vault-text);overflow-wrap:anywhere}.historical-cogs__attestation{padding:14px;border-left:3px solid var(--vault-gold);color:var(--vault-text-soft);line-height:1.55;background:var(--vault-bg-elevated)}.historical-cogs__status{margin-top:16px;padding:12px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);color:var(--vault-text-soft)}.historical-cogs__status--ok{border-color:var(--vault-success);color:var(--vault-success)}.historical-cogs__status--error{border-color:var(--vault-error);color:var(--vault-error)}.historical-cogs button{margin-top:14px;min-height:42px;padding:10px 15px;border:1px solid var(--vault-border-gold);border-radius:var(--vault-radius-sm);background:var(--vault-gold);color:#15120a;font:inherit;font-weight:700;cursor:pointer}.historical-cogs button:disabled{opacity:.45;cursor:not-allowed}.historical-cogs textarea{display:block;width:100%;min-height:88px;margin-top:12px;padding:10px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);color:var(--vault-text);background:var(--vault-bg-elevated);font:inherit}.historical-cogs__audit{padding-left:20px;color:var(--vault-text-soft)}.historical-cogs__audit li{margin:10px 0}@media(max-width:620px){.historical-cogs{padding:20px}.historical-cogs__grid{grid-template-columns:1fr}}
`;

export function HistoricalLineCogsWorkflow() {
  const [preview, setPreview] = useState<Preview>();
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("Loading governed eligibility evidence…");
  const [tone, setTone] = useState<"" | "ok" | "error">("");

  async function refresh() {
    const response = await fetch("/api/cogs/historical-line-proposals", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setTone("error"); setMessage(data.error ?? "Unable to load historical COGS evidence."); return; }
    setPreview(data); setTone(data.eligible ? "ok" : "error");
    setMessage(data.proposal ? `Proposal is ${data.proposal.approval_status.toLowerCase()}.` : data.eligible ? "All data gates are satisfied. Review and confirm before staging." : "This proposal is not eligible to stage.");
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function stage() {
    const response = await fetch("/api/cogs/historical-line-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stage", confirmed }) });
    const data = await response.json();
    setTone(response.ok ? "ok" : "error"); setMessage(response.ok ? "Proposal staged as pending owner decision." : (data.error ?? "Staging failed."));
    if (response.ok) await refresh();
  }

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!preview?.proposal) return;
    const response = await fetch("/api/cogs/historical-line-proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "decide", proposalId: preview.proposal.id, decision, approvalNote: note }) });
    const data = await response.json();
    setTone(response.ok ? "ok" : "error"); setMessage(response.ok ? `Proposal ${decision.toLowerCase()}.` : (data.error ?? "Decision failed."));
    if (response.ok) await refresh();
  }

  return <main className="historical-cogs"><style>{styles}</style><p className="vault-eyebrow">OPERATIONS / GOVERNED COGS</p><h1>Historical line COGS proposal</h1><p className="historical-cogs__intro">This workflow stages one reviewed line only. Staging creates a pending proposal and immutable audit event; it cannot alter resolved COGS, Stage 1, or the Sales Workbook. Only an owner can make a later decision.</p>{preview && <section className="historical-cogs__card"><h2>Order #{preview.prefill.orderNumber} review</h2><dl className="historical-cogs__grid"><div><dt>Line</dt><dd>{preview.line?.title ?? preview.prefill.lineTitle} — {preview.line?.variantTitle ?? preview.prefill.variantTitle}</dd></div><div><dt>Quantity</dt><dd>{preview.line?.quantity ?? preview.prefill.quantity}</dd></div><div><dt>Approved delivery</dt><dd>{preview.batch?.reference ?? preview.prefill.deliveryReference}</dd></div><div><dt>Verified unit landed COGS</dt><dd>£{(preview.batch?.computedUnitCost ?? preview.prefill.unitLandedCogsGbp).toFixed(4)}</dd></div><div><dt>Line COGS state</dt><dd>{preview.line?.cogsStatus ?? "unavailable"}</dd></div><div><dt>Proposal state</dt><dd>{preview.proposal?.approval_status ?? "Not staged"}</dd></div></dl><p className="historical-cogs__attestation">{preview.prefill.attestation}</p>{!preview.proposal && <><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm the delivery, cost and attestation above are the proposal to stage.</label><br/><button type="button" disabled={!preview.eligible || !confirmed} onClick={stage}>Stage pending proposal</button></>}{preview.proposal?.approval_status === "PENDING" && preview.operatorRole === "owner" && <section className="historical-cogs__card"><h2>Owner decision</h2><p>Approval is separate from staging and will be recorded in the immutable audit trail.</p><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Required owner decision note" /><button type="button" disabled={!note.trim()} onClick={() => decide("APPROVED")}>Approve proposal</button> <button type="button" disabled={!note.trim()} onClick={() => decide("REJECTED")}>Reject proposal</button></section>}{preview.audit.length > 0 && <section className="historical-cogs__card"><h2>Immutable audit history</h2><ol className="historical-cogs__audit">{preview.audit.map((entry) => <li key={entry.id}><strong>{entry.event_type}</strong> — {entry.note} <small>({new Date(entry.recorded_at).toLocaleString()})</small></li>)}</ol></section>}</section>}<p className={`historical-cogs__status${tone ? ` historical-cogs__status--${tone}` : ""}`} role="status">{message}</p></main>;
}
