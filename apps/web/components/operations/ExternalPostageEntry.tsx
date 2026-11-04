"use client";

import { useState } from "react";
import { displayExternalPostageAmount, externalPostageInputError } from "@/lib/sales-workbook/external-postage-form";

const styles = `
  .external-postage-entry{margin:18px 0;padding:16px;border:1px solid rgba(214,189,119,.42);border-radius:8px;background:#101311}.external-postage-entry h3{margin:0 0 6px;color:#f0d887;font-size:15px}.external-postage-entry p{margin:6px 0;color:#c7ccc8;font-size:13px;line-height:1.45}.external-postage-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.external-postage-fields label{display:grid;gap:5px;color:#c7ccc8;font-size:12px}.external-postage-fields input{height:36px;padding:0 8px;color:#eee;background:#090b09;border:1px solid rgba(255,255,255,.18);border-radius:5px;font:inherit}.external-postage-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.external-postage-actions button{padding:7px 10px;color:#15120a;background:#d6bd77;border:1px solid #d6bd77;border-radius:5px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}.external-postage-actions button+button{color:#d6bd77;background:transparent}.external-postage-actions button:disabled{opacity:.55;cursor:wait}.external-postage-confirmation{margin-top:12px;padding:12px;border:1px solid rgba(214,189,119,.6);border-radius:6px;background:#0d100e}.external-postage-status{margin-top:12px;padding:10px;border-radius:5px;font-size:13px}.external-postage-status--error{border:1px solid #cb6767;color:#ff9c9c}.external-postage-status--success{border:1px solid #6fb881;color:#a8dfb5}@media(max-width:640px){.external-postage-fields{grid-template-columns:1fr}}
`;

type Props = { onRecorded?: () => void | Promise<void> };

export function ExternalPostageEntry({ onRecorded }: Props) {
  const [orderNumber, setOrderNumber] = useState("");
  const [amountGbp, setAmountGbp] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"error" | "success">("error");
  const error = externalPostageInputError({ orderNumber, amountGbp });

  function review() {
    setMessage(null);
    if (error) { setTone("error"); setMessage(error); return; }
    setConfirming(true);
  }

  async function record() {
    if (error || busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/sales-workbook/external-postage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderNumber: orderNumber.trim(), amountGbp: amountGbp.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) throw new Error("Only an active Vault OS owner or operator can record external postage.");
        throw new Error(payload.error ?? "External postage could not be recorded.");
      }
      setTone("success");
      setMessage(`${displayExternalPostageAmount(amountGbp.trim())} postage was recorded for Shopify order ${orderNumber.trim()}. If this was an exact repeat, it was accepted idempotently and no duplicate evidence was created.`);
      setConfirming(false);
      await onRecorded?.();
    } catch (reason) { setTone("error"); setMessage(reason instanceof Error ? reason.message : "External postage could not be recorded."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="external-postage-heading" className="external-postage-entry">
    <style>{styles}</style>
    <h3 id="external-postage-heading">Record external postage</h3>
    <p>Use this only for postage bought outside Shopify. It records immutable evidence through the governed order API and never changes Shopify shipping snapshots.</p>
    <div className="external-postage-fields">
      <label>Shopify order number<input aria-label="Shopify order number" autoComplete="off" disabled={busy} inputMode="numeric" onChange={(event) => { setOrderNumber(event.target.value); setConfirming(false); }} placeholder="e.g. 1341" value={orderNumber} /></label>
      <label>External postage (GBP)<input aria-label="External postage amount in GBP" autoComplete="off" disabled={busy} inputMode="decimal" onChange={(event) => { setAmountGbp(event.target.value); setConfirming(false); }} placeholder="e.g. 3.75" value={amountGbp} /></label>
    </div>
    {!confirming ? <div className="external-postage-actions"><button disabled={busy} onClick={review} type="button">Review postage entry</button></div> : <section aria-label="Confirm external postage" className="external-postage-confirmation"><strong>Confirm {displayExternalPostageAmount(amountGbp.trim())} for Shopify order {orderNumber.trim()}</strong><p>This cannot be edited or deleted. A conflicting amount will be rejected; an exact retry is safe.</p><div className="external-postage-actions"><button disabled={busy} onClick={() => void record()} type="button">{busy ? "Recording…" : "Confirm & record"}</button><button disabled={busy} onClick={() => setConfirming(false)} type="button">Back</button></div></section>}
    {message ? <p className={`external-postage-status external-postage-status--${tone}`} role="status">{message}</p> : null}
  </section>;
}
