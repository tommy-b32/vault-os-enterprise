import Link from "next/link";

import type {
  CockpitMoney,
  CockpitValue,
  CommandCentreCockpitData,
} from "@/lib/command-centre/CommandCentreCockpit";

type DataProps = { data: CommandCentreCockpitData };

function formatMoney(value: CockpitMoney): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.amount % 1 === 0 ? 0 : 2,
  }).format(value.amount);
}

function display<T>(
  value: CockpitValue<T>,
  formatter: (entry: T) => string = String,
): string {
  if (value.state === "available" || value.state === "stale") {
    return formatter(value.value);
  }
  if (value.state === "not_connected") return "Not connected";
  if (value.state === "pending") return "Pending";
  return "Unavailable";
}

function stateLabel(value: CockpitValue<unknown>): string | null {
  return value.state === "stale" ? "Stale" : null;
}

function KpiCard({
  eyebrow,
  icon,
  value,
  comparison,
  children,
}: {
  eyebrow: string;
  icon: string;
  value: string;
  comparison?: CockpitValue<number>;
  children: React.ReactNode;
}) {
  return (
    <article className="cc-card cc-kpi-card">
      <header><span aria-hidden="true">{icon}</span><h2>{eyebrow}</h2></header>
      <div className="cc-kpi-value">{value}</div>
      {comparison && (comparison.state === "available" || comparison.state === "stale") ? (
        <span className={comparison.value >= 0 ? "cc-change is-positive" : "cc-change is-negative"}>
          {comparison.value >= 0 ? "+" : ""}{comparison.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%
        </span>
      ) : null}
      <div className="cc-kpi-support">{children}</div>
    </article>
  );
}

function MetricRow({ label, value, formatter }: {
  label: string;
  value: CockpitValue<number | CockpitMoney | string>;
  formatter?: (value: number | CockpitMoney | string) => string;
}) {
  return (
    <div className="cc-metric-row">
      <span>{label}</span>
      <strong className={`is-${value.state}`}>
        {display(value, formatter ?? ((entry) => String(entry)))}
        {stateLabel(value) ? <small>{stateLabel(value)}</small> : null}
      </strong>
    </div>
  );
}

function Snapshot({ title, subtitle, icon, children }: {
  title: string; subtitle: string; icon: string; children: React.ReactNode;
}) {
  return (
    <article className="cc-card cc-snapshot">
      <header>
        <span aria-hidden="true">{icon}</span>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
      </header>
      <div className="cc-snapshot-rows">{children}</div>
    </article>
  );
}

function relativeTime(value: string, now: string): string {
  const minutes = Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes)) return "Time unavailable";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(value));
}

export function CommandCentreCockpit({ data }: DataProps) {
  const moneyValue = (value: CockpitValue<CockpitMoney>) => display(value, formatMoney);
  const numberValue = (value: CockpitValue<number>) => display(value, (entry) => entry.toLocaleString("en-GB"));
  const percentValue = (value: CockpitValue<number>) => display(value, (entry) => `${entry.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`);

  return (
    <div className="cc-page">
      <header className="cc-page-header">
        <div><p>THE FABRIC VAULT</p><h1>Command Centre</h1><span>Your business. At a glance.</span></div>
        <div className="cc-confidence" aria-label="Vault Brain confidence">
          <span>Vault Brain Confidence</span>
          <strong>{display(data.brainConfidence, (value) => `${value}%`)}</strong>
          <small>{data.brainConfidence.state === "unavailable" ? "No canonical page-level score" : data.brainConfidence.state}</small>
        </div>
      </header>

      <section className="cc-kpi-grid" aria-label="Headline business metrics">
        <KpiCard eyebrow="Revenue Today" icon="£" value={moneyValue(data.trading.revenue)} comparison={data.trading.revenueComparison}>
          <span>Net Shopify revenue</span><span>{stateLabel(data.trading.revenue) ?? "Today"}</span>
        </KpiCard>
        <KpiCard eyebrow="Orders Today" icon="▣" value={numberValue(data.trading.orders)} comparison={data.trading.orderComparison}>
          <span>Units {numberValue(data.trading.units)}</span><span>AOV {moneyValue(data.trading.averageOrderValue)}</span>
        </KpiCard>
        <KpiCard eyebrow="Website Conversion" icon="▽" value={percentValue(data.website.conversionRate)}>
          <span>Sessions {numberValue(data.website.sessions)}</span><span>Funnel data unavailable</span>
        </KpiCard>
        <KpiCard eyebrow="Website Traffic" icon="⌁" value={numberValue(data.website.estimatedTotalVisitors)}>
          <span className="cc-traffic-label">Estimated total visitors</span>
          <span className="cc-traffic-breakdown">
            Tracked {numberValue(data.website.trackedVisitors)} · Estimated untracked {numberValue(data.website.estimatedUntrackedVisitors)} · Live tracked {numberValue(data.website.liveTrackedVisitors)}
          </span>
        </KpiCard>
        <KpiCard eyebrow="Meta Ads" icon="∞" value="Not connected">
          <span>Meta marketing data is not integrated.</span>
        </KpiCard>
        <KpiCard eyebrow="Finance Position" icon="▱" value={moneyValue(data.finance.ledgerCash)}>
          <span>Purchasing power {moneyValue(data.finance.purchasingPower)}</span>
          <span>Reserve {moneyValue(data.finance.protectedReserve)}</span>
        </KpiCard>
      </section>

      <section className="cc-middle-grid">
        <article className="cc-card cc-feature-panel">
          <header className="cc-panel-heading"><div><p>Vault Brain Brief</p><h2>Commercial interpretation</h2></div><Link href="/missions">Open Vault Brain →</Link></header>
          {data.insights.length ? <div className="cc-insight-list">{data.insights.map((insight) => (
            <div className={`cc-insight is-${insight.tone}`} key={insight.id}>
              <span aria-hidden="true">{insight.tone === "warning" ? "!" : insight.tone === "positive" ? "↗" : "i"}</span>
              <div><strong>{insight.title}</strong>{insight.detail ? <p>{insight.detail}</p> : null}</div>
            </div>
          ))}</div> : <p className="cc-empty">No canonical Brain summary is available.</p>}
        </article>

        <article className="cc-card cc-feature-panel">
          <header className="cc-panel-heading"><div><p>Needs Your Attention</p><h2>Structured priorities</h2></div><span>{data.attention.length} items</span></header>
          {data.attention.length ? <div className="cc-attention-list">{data.attention.map((item) => (
            <Link className="cc-attention" href={item.destination} key={item.id}>
              <span className={`cc-priority is-${item.priority}`}>{item.priority}</span>
              <div><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}</div><b aria-hidden="true">→</b>
            </Link>
          ))}</div> : <p className="cc-empty">No structured actions are currently available.</p>}
        </article>
      </section>

      <section className="cc-snapshot-grid" aria-label="Business snapshots">
        <Snapshot title="Sales Funnel" subtitle="Website performance today" icon="▽">
          <MetricRow label="Tracked visitors" value={data.website.trackedVisitors} />
          <MetricRow label="Estimated untracked visitors" value={data.website.estimatedUntrackedVisitors} />
          <MetricRow label="Estimated total visitors" value={data.website.estimatedTotalVisitors} />
          <MetricRow label="Sessions" value={data.website.sessions} />
          <MetricRow label="Add-to-cart rate" value={data.website.addToCartRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Checkout rate" value={data.website.checkoutRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Conversion rate" value={data.website.conversionRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Abandoned checkouts" value={data.website.abandonedCheckouts} />
        </Snapshot>
        <Snapshot title="Inventory Snapshot" subtitle="Canonical stock position" icon="♧">
          <MetricRow label="Low-stock styles" value={data.inventory.lowStockStyles} />
          <MetricRow label="Out-of-stock styles" value={data.inventory.outOfStockStyles} />
          <MetricRow label="Total stock value" value={data.inventory.stockValue} formatter={(v) => formatMoney(v as CockpitMoney)} />
          <MetricRow label="Inventory freshness" value={data.inventory.freshness} formatter={(v) => relativeTime(String(v), data.generatedAt)} />
          <MetricRow label="Reorder review" value={data.inventory.reorderReview} />
        </Snapshot>
        <Snapshot title="Marketing Snapshot" subtitle="Meta Ads" icon="⌁">
          <div className="cc-connection-state"><strong>Not connected</strong><p>Meta marketing metrics are not integrated with Vault OS.</p></div>
        </Snapshot>
        <Snapshot title="Operations Snapshot" subtitle="Order fulfilment" icon="▤">
          <MetricRow label="Awaiting fulfilment" value={data.operations.awaitingFulfilment} />
          <MetricRow label="Dispatched today" value={data.operations.dispatchedToday} />
          <MetricRow label="Refunds today" value={data.operations.refundsToday} />
          <MetricRow label="Supplier issues" value={data.operations.supplierIssues} />
          <MetricRow label="Late deliveries" value={data.operations.lateDeliveries} />
        </Snapshot>
      </section>

      <section className="cc-card cc-feed">
        <header><div><p>Latest Business Activity</p><span>Recent canonical events</span></div><Link href="/orders">View orders →</Link></header>
        {data.feed.length ? <div className="cc-feed-grid">{data.feed.map((event) => (
          <article key={event.id}><span aria-hidden="true">●</span><div><strong>{event.title}</strong>{event.description ? <p>{event.description}</p> : null}</div><time dateTime={event.timestamp}>{relativeTime(event.timestamp, data.generatedAt)}</time></article>
        ))}</div> : <p className="cc-empty">No canonical business events are available.</p>}
      </section>

      <footer className="cc-footer">
        <span className={`is-${data.systemStatus}`}>● {data.systemStatus === "live" ? "Sources current" : `Source status: ${data.systemStatus}`}</span>
        <span>{data.latestSourceAt ? `Latest snapshot ${relativeTime(data.latestSourceAt, data.generatedAt)}` : "Snapshot timestamp unavailable"}</span>
        <span>Server refresh complete</span>
      </footer>
      <CommandCentreCockpitStyles />
    </div>
  );
}

function CommandCentreCockpitStyles() {
  return <style>{`
    .cc-page{padding:20px 24px 14px;color:#f4f2ec;background:radial-gradient(circle at 50% 0,rgba(215,169,52,.035),transparent 36%);min-height:calc(100vh - 72px)}
    .cc-page-header{display:flex;align-items:end;justify-content:space-between;margin-bottom:14px}.cc-page-header p,.cc-panel-heading p,.cc-feed header p{margin:0 0 3px;color:#e2b43e;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.cc-page-header h1{margin:0;font-size:25px;line-height:1.1}.cc-page-header>div>span{color:#a7aaa6;font-size:12px}.cc-confidence{min-width:180px;padding:9px 12px;border:1px solid rgba(222,176,57,.25);border-radius:10px;background:#101312}.cc-confidence>span,.cc-confidence small{display:block;color:#929894;font-size:9px}.cc-confidence strong{display:block;margin:2px 0;color:#fff;font-size:15px}
    .cc-card{border:1px solid rgba(219,177,67,.16);border-radius:9px;background:linear-gradient(145deg,rgba(19,23,22,.98),rgba(11,14,13,.98));box-shadow:0 10px 24px rgba(0,0,0,.14)}
    .cc-kpi-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}.cc-kpi-card{position:relative;min-height:128px;padding:13px 14px}.cc-kpi-card header{display:flex;align-items:center;gap:8px}.cc-kpi-card header>span{color:#e4b83f;font-size:17px}.cc-kpi-card h2{margin:0;color:#d4d4d0;font-size:9px;text-transform:uppercase}.cc-kpi-value{margin-top:14px;color:#fff;font-size:24px;font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-change{position:absolute;top:51px;right:13px;font-size:10px;font-weight:700}.cc-change.is-positive{color:#4bd17a}.cc-change.is-negative{color:#ff6969}.cc-kpi-support{display:flex;justify-content:space-between;gap:8px;margin-top:13px;color:#9da29f;font-size:9px;line-height:1.35}.cc-kpi-support span:last-child{text-align:right}.cc-kpi-support .cc-traffic-label{max-width:58px}.cc-kpi-support .cc-traffic-breakdown{max-width:132px}
    .cc-middle-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:10px;margin-top:10px}.cc-feature-panel{min-height:208px}.cc-panel-heading{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.07)}.cc-panel-heading h2{margin:0;color:#aeb2ae;font-size:10px;font-weight:500}.cc-panel-heading>a,.cc-panel-heading>span,.cc-feed a{color:#d9ae3b;font-size:9px;text-decoration:none}.cc-insight-list,.cc-attention-list{padding:4px 14px}.cc-insight{display:flex;gap:11px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)}.cc-insight:last-child{border:0}.cc-insight>span{display:grid;width:25px;height:25px;place-items:center;flex:0 0 auto;border-radius:50%;background:rgba(82,201,115,.09);color:#58d27d;font-weight:800}.cc-insight.is-warning>span{background:rgba(226,177,50,.1);color:#e3b43e}.cc-insight strong,.cc-attention strong{font-size:11px}.cc-insight p,.cc-attention p{margin:3px 0 0;color:#9fa4a0;font-size:9px;line-height:1.3}.cc-attention{display:grid;grid-template-columns:61px 1fr 13px;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);color:inherit;text-decoration:none}.cc-attention:last-child{border:0}.cc-priority{padding:4px;border:1px solid rgba(231,181,54,.4);border-radius:5px;color:#e6ba47;font-size:8px;text-align:center;text-transform:uppercase}.cc-priority.is-critical{border-color:rgba(255,91,91,.5);color:#ff7474}.cc-attention>b{color:#e1b23b}.cc-empty{margin:20px;color:#8f9691;font-size:10px}
    .cc-snapshot-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}.cc-snapshot{min-height:183px}.cc-snapshot>header{display:flex;gap:9px;align-items:center;padding:10px 13px;border-bottom:1px solid rgba(255,255,255,.06)}.cc-snapshot>header>span{color:#dfb33e}.cc-snapshot h2{margin:0;color:#e1b33c;font-size:10px;text-transform:uppercase}.cc-snapshot header p{margin:2px 0 0;color:#929893;font-size:8px}.cc-snapshot-rows{padding:5px 13px}.cc-metric-row{display:flex;justify-content:space-between;gap:9px;padding:4px 0;color:#c0c3bf;font-size:9px;border-bottom:1px solid rgba(255,255,255,.035)}.cc-metric-row strong{color:#f0efea;text-align:right}.cc-metric-row strong.is-unavailable,.cc-metric-row strong.is-not_connected{color:#747c77;font-weight:500}.cc-metric-row strong.is-stale{color:#e2b23c}.cc-metric-row small{margin-left:5px;font-size:7px;text-transform:uppercase}.cc-connection-state{display:grid;min-height:120px;place-content:center;text-align:center}.cc-connection-state strong{color:#b7bbb7;font-size:12px}.cc-connection-state p{max-width:190px;margin:6px auto;color:#777f7a;font-size:9px;line-height:1.4}
    .cc-feed{margin-top:10px;padding:9px 12px}.cc-feed>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px}.cc-feed header span{color:#8f9691;font-size:8px}.cc-feed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.cc-feed-grid article{display:grid;grid-template-columns:12px 1fr auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:7px}.cc-feed-grid article>span{color:#dbae35}.cc-feed-grid strong{font-size:9px}.cc-feed-grid p{margin:2px 0 0;color:#929894;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-feed-grid time{color:#858c87;font-size:8px}.cc-footer{display:flex;gap:18px;padding-top:10px;color:#7e8580;font-size:8px}.cc-footer .is-live{color:#54c978}.cc-footer .is-stale,.cc-footer .is-partial{color:#deb13c}.cc-footer .is-error{color:#f16b6b}
    @media(min-width:1440px){.cc-page{padding-top:16px}.cc-kpi-card{min-height:120px}.cc-feature-panel{min-height:194px}.cc-snapshot{min-height:171px}}
    @media(max-width:1200px){.cc-kpi-grid{grid-template-columns:repeat(3,1fr)}.cc-snapshot-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:820px){.cc-middle-grid{grid-template-columns:1fr}.cc-page{padding:16px}.cc-page-header{align-items:flex-start}.cc-confidence{min-width:155px}}
    @media(max-width:600px){.cc-page-header{display:grid;gap:12px}.cc-confidence{width:100%}.cc-kpi-grid{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.cc-kpi-card{min-width:210px;scroll-snap-align:start}.cc-snapshot-grid{grid-template-columns:1fr}.cc-feed-grid{grid-template-columns:1fr}.cc-footer{flex-direction:column;gap:4px}}
  `}</style>;
}
