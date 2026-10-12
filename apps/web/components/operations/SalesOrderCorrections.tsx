"use client";

import { useState } from "react";

const kinds = [
  "sale_price",
  "order_date",
  "postage",
  "card_fee",
  "cogs",
  "tracking",
  "manual_non_shopify",
  "exchange_partial_payment",
];

type Preview = {
  proposalId: string;
  original: unknown;
  corrected: unknown;
  readinessBefore: "READY" | "REVIEW";
  readinessAfter: "READY" | "REVIEW";
};

const styles = `
  .sales-correction-panel{max-width:900px;padding:24px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-md);background:var(--vault-panel);box-shadow:var(--vault-shadow)}
  .sales-correction-panel h2{margin:0 0 6px;font-size:19px;color:var(--vault-text)}
  .sales-correction-intro{margin:0 0 22px;color:var(--vault-muted);line-height:1.55}
  .sales-correction-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .sales-correction-field{display:grid;align-content:start;gap:8px;min-width:0;color:var(--vault-text-soft);font-size:13px;font-weight:600}
  .sales-correction-field--wide{grid-column:1/-1}
  .sales-correction-field input,.sales-correction-field select,.sales-correction-field textarea{width:100%;min-height:42px;padding:10px 12px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);font-weight:400}
  .sales-correction-field textarea{min-height:100px;resize:vertical}
  .sales-correction-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:22px}
  .sales-correction-button{min-height:42px;padding:10px 16px;border:1px solid var(--vault-border-gold);border-radius:var(--vault-radius-sm);color:#15120a;background:var(--vault-gold);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
  .sales-correction-button:hover{background:var(--vault-gold-bright)}
  .sales-correction-button:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:3px}
  .sales-correction-preview{margin-top:24px;padding:20px;border:1px solid var(--vault-border-gold);border-radius:var(--vault-radius-md);background:var(--vault-bg-elevated)}
  .sales-correction-preview h3{margin:0 0 16px;color:var(--vault-text);font-size:16px}
  .sales-correction-preview dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:0}
  .sales-correction-preview dl>div{min-width:0;padding:14px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);background:var(--vault-panel-soft)}
  .sales-correction-preview dt{color:var(--vault-muted);font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .sales-correction-preview dd{margin:7px 0 0;overflow-wrap:anywhere;color:var(--vault-text);font-size:14px}
  .sales-correction-preview .sales-correction-readiness{grid-column:1/-1}
  .sales-correction-status{margin:18px 0 0;padding:12px 14px;border:1px solid var(--vault-border);border-radius:var(--vault-radius-sm);color:var(--vault-text-soft);background:var(--vault-bg-elevated);line-height:1.5}
  .sales-correction-status--error{border-color:var(--vault-error);color:var(--vault-error)}
  .sales-correction-status--success{border-color:var(--vault-success);color:var(--vault-success)}
  @media(max-width:640px){.sales-correction-panel{padding:18px}.sales-correction-fields,.sales-correction-preview dl{grid-template-columns:1fr}.sales-correction-field--wide,.sales-correction-preview .sales-correction-readiness{grid-column:auto}.sales-correction-actions .sales-correction-button{width:100%}}
`;

export function SalesOrderCorrections() {
  const [orderNumber, setOrderNumber] = useState("");
  const [type, setType] = useState(kinds[0]);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [result, setResult] = useState("");
  const [resultTone, setResultTone] = useState<"info" | "error" | "success">("info");

  async function propose() {
    if (!reason.trim()) {
      setResultTone("error");
      return setResult("A reason is required.");
    }
    setPreview(undefined);
    const r = await fetch("/api/sales-workbook/corrections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNumber, type, value, reason }),
    });
    const data = await r.json();
    if (!r.ok) {
      setResultTone("error");
      return setResult(data.error ?? "Proposal failed");
    }
    setPreview(data);
    setResultTone("info");
    setResult("Review the immutable before/after proposal before applying it.");
  }

  async function apply() {
    if (!preview) return;
    const r = await fetch("/api/sales-workbook/corrections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "apply", proposalId: preview.proposalId }),
    });
    const data = await r.json();
    setResultTone(r.ok ? "success" : "error");
    setResult(r.ok ? `Correction activated in workbook version ${data.newWorkbookVersion}.` : (data.error ?? "Apply failed"));
  }

  return (
    <section className="sales-correction-panel" aria-labelledby="sales-correction-heading">
      <style>{styles}</style>
      <h2 id="sales-correction-heading">Correction details</h2>
      <p className="sales-correction-intro">Enter the Shopify order, the field to correct and the reason for the change.</p>
      <div className="sales-correction-fields">
        <label className="sales-correction-field">
          <span>Shopify order</span>
          <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
        </label>
        <label className="sales-correction-field">
          <span>Correction field</span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {kinds.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("_", " ")}</option>)}
          </select>
        </label>
        <label className="sales-correction-field sales-correction-field--wide">
          <span>Corrected value</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <label className="sales-correction-field sales-correction-field--wide">
          <span>Reason</span>
          <textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
      <div className="sales-correction-actions">
        <button className="sales-correction-button" onClick={propose} type="button">Preview correction</button>
      </div>
      {preview && (
        <section className="sales-correction-preview" aria-label="Correction preview">
          <h3>Before and after</h3>
          <dl>
            <div><dt>Original value</dt><dd>{String(preview.original ?? "blank")}</dd></div>
            <div><dt>Corrected value</dt><dd>{String(preview.corrected ?? "blank")}</dd></div>
            <div className="sales-correction-readiness"><dt>Readiness impact</dt><dd>{preview.readinessBefore} → {preview.readinessAfter}</dd></div>
          </dl>
          <div className="sales-correction-actions">
            <button className="sales-correction-button" onClick={apply} type="button">Apply approved correction</button>
          </div>
        </section>
      )}
      {result && <p className={`sales-correction-status${resultTone === "info" ? "" : ` sales-correction-status--${resultTone}`}`} role="status">{result}</p>}
    </section>
  );
}
