import type { FinancialIntelligenceSnapshot, FinancialPeriod } from "@/lib/financial-intelligence/FinancialIntelligence";

type FinancialIntelligenceDashboardProps = { period: FinancialPeriod; snapshot: FinancialIntelligenceSnapshot };

function money(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(value);
}

function periodLabel(period: FinancialPeriod) {
  return { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" }[period];
}

function londonDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(new Date(value));
}

export function FinancialIntelligenceDashboard({ period, snapshot }: FinancialIntelligenceDashboardProps) {
  const hasWarning = !snapshot.reconciliationPassed || snapshot.unreconciledRefundOrderCount > 0;
  return <main className="financial-intelligence-page">
    <header className="financial-intelligence-header">
      <div><p className="vault-eyebrow">FINANCIAL INTELLIGENCE</p><h1>Verified Shopify revenue</h1><p>Evidence-gated revenue facts only. Cost and profit are intentionally not shown until verified cost evidence exists.</p></div>
      <form className="financial-period" action="/financial-intelligence" method="get"><label htmlFor="financial-period">Business period</label><select defaultValue={period} id="financial-period" name="period"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select><button type="submit">Apply</button></form>
    </header>

    <p className="financial-range">{periodLabel(period)} · {londonDate(snapshot.range.from)} to {londonDate(new Date(new Date(snapshot.range.to).getTime() - 1).toISOString())} · Europe/London business dates</p>

    <section className="financial-kpis" aria-label="Verified financial summary">
      <article><span>Verified net revenue</span><strong>{money(snapshot.verifiedNetRevenue)}</strong><small>Canonical Shopify adjusted order totals</small></article>
      <article><span>Verified orders</span><strong>{snapshot.verifiedOrderCount}</strong><small>Eligible evidence-gated orders</small></article>
      <article><span>Financial coverage</span><strong>{snapshot.verifiedOrderCount} / {snapshot.canonicalOrderCount}</strong><small>Verified / canonical Shopify orders</small></article>
      <article><span>Refund header evidence</span><strong>{money(snapshot.refundHeaderTotal)}</strong><small>Supporting evidence — not deducted again</small></article>
    </section>

    <section className={`financial-reconciliation ${hasWarning ? "is-warning" : "is-verified"}`} aria-live="polite">
      <div><p className="vault-eyebrow">RECONCILIATION</p><h2>{snapshot.reconciliationPassed ? "Coverage reconciled" : "Coverage requires attention"}</h2><p>{snapshot.reconciliationPassed ? "Every canonical Shopify order in this period is represented once by the verified financial view." : "No revenue is inferred for orders outside the verified view. Review excluded or incomplete evidence before relying on complete-period totals."}</p></div>
      <dl><div><dt>Eligible</dt><dd>{snapshot.verifiedOrderCount}</dd></div><div><dt>Excluded</dt><dd>{snapshot.excludedOrderCount}</dd></div><div><dt>Incomplete</dt><dd>{snapshot.incompleteOrderCount}</dd></div><div><dt>Unreconciled refunds</dt><dd>{snapshot.unreconciledRefundOrderCount}</dd></div></dl>
    </section>

    {snapshot.excludedOrderCount > 0 ? <p className="financial-note">{snapshot.excludedOrderCount} canonical order{snapshot.excludedOrderCount === 1 ? " is" : "s are"} outside the GBP verified-view contract ({snapshot.currencyCodes.join(", ")}). They are excluded, not converted or estimated.</p> : null}
    {snapshot.incompleteOrderCount > 0 ? <p className="financial-note">{snapshot.incompleteOrderCount} GBP canonical order{snapshot.incompleteOrderCount === 1 ? " is" : "s are"} not admitted by the verified view. Missing or failed evidence is not treated as a zero-value event.</p> : null}
    {snapshot.unreconciledRefundOrderCount > 0 ? <p className="financial-note">Refund header evidence is present for {snapshot.unreconciledRefundOrderCount} order{snapshot.unreconciledRefundOrderCount === 1 ? "" : "s"} but remains unreconciled. It is displayed separately and never subtracted from canonical net revenue.</p> : null}
    <FinancialIntelligenceStyles />
  </main>;
}

function FinancialIntelligenceStyles() {
  return <style>{`
    .financial-intelligence-page { padding: 32px; color: #edf0ed; }
    .financial-intelligence-header { display:flex; justify-content:space-between; gap:24px; align-items:flex-end; }
    .financial-intelligence-header h1 { margin:6px 0; font-size:32px; letter-spacing:-.04em; }
    .financial-intelligence-header p, .financial-range, .financial-note { color:#9aa19c; font-size:13px; line-height:1.6; }
    .financial-period { display:flex; align-items:end; gap:8px; padding:12px; border:1px solid rgba(255,255,255,.1); border-radius:10px; background:#0d100e; }
    .financial-period label { display:grid; gap:5px; color:#a7aea8; font-size:10px; text-transform:uppercase; letter-spacing:.08em; }
    .financial-period select, .financial-period button { min-height:34px; border:1px solid rgba(255,255,255,.14); border-radius:6px; color:#edf0ed; background:#151915; font:inherit; font-size:12px; }
    .financial-period select { padding:0 8px; } .financial-period button { padding:0 12px; cursor:pointer; color:#15120a; background:#dfb64b; border-color:#dfb64b; font-weight:700; }
    .financial-range { margin:22px 0; }
    .financial-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
    .financial-kpis article, .financial-reconciliation { border:1px solid rgba(255,255,255,.1); border-radius:12px; background:linear-gradient(145deg,rgba(255,255,255,.045),rgba(255,255,255,.015)); }
    .financial-kpis article { min-height:142px; padding:19px; display:flex; flex-direction:column; }
    .financial-kpis span, .financial-kpis small { color:#99a19b; font-size:11px; } .financial-kpis strong { margin:14px 0 5px; color:#f0c55b; font-size:27px; letter-spacing:-.04em; } .financial-kpis small { margin-top:auto; line-height:1.45; }
    .financial-reconciliation { display:flex; justify-content:space-between; gap:28px; margin-top:18px; padding:22px; } .financial-reconciliation.is-warning { border-color:rgba(217,150,67,.55); } .financial-reconciliation.is-verified { border-color:rgba(91,188,126,.38); }
    .financial-reconciliation h2 { margin:5px 0 8px; font-size:19px; } .financial-reconciliation p { margin:0; color:#adb4ae; font-size:13px; line-height:1.55; max-width:630px; }
    .financial-reconciliation dl { display:grid; grid-template-columns:repeat(4,minmax(75px,1fr)); gap:16px; margin:0; } .financial-reconciliation dt { color:#8f9791; font-size:10px; text-transform:uppercase; letter-spacing:.06em; } .financial-reconciliation dd { margin:7px 0 0; color:#f0c55b; font-size:23px; font-weight:700; }
    .financial-note { margin:12px 0 0; padding:12px 14px; border-left:2px solid #dfb64b; background:rgba(223,182,75,.06); }
    @media (max-width:1000px) { .financial-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); } .financial-reconciliation { display:block; } .financial-reconciliation dl { margin-top:20px; } }
    @media (max-width:680px) { .financial-intelligence-page { padding:20px 14px; } .financial-intelligence-header { display:block; } .financial-period { margin-top:18px; } .financial-kpis { grid-template-columns:1fr; } .financial-reconciliation dl { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  `}</style>;
}
