import Link from "next/link";

import VaultIcon, { type VaultIconName } from "@/components/brain/workspace/VaultIcon";
import { CommandCentreLiveRefresh } from "@/components/command-centre/CommandCentreLiveRefresh";
import type {
  CockpitMoney,
  CockpitTrendPoint,
  CockpitValue,
  CommandCentreCockpitData,
} from "@/lib/command-centre/CommandCentreCockpit";
import { getAttentionPriorityPresentation } from "@/lib/command-centre/AttentionPriorityPresentation";

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
  accent,
  value,
  trend,
  comparison,
  comparisonMeaning,
  children,
}: {
  eyebrow: string;
  icon: VaultIconName;
  accent: "gold" | "green" | "blue" | "violet" | "pink";
  value: string;
  trend?: CockpitTrendPoint[];
  comparison?: CockpitValue<number>;
  comparisonMeaning?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`cc-card cc-kpi-card is-${accent}`}>
      <header><span aria-hidden="true"><VaultIcon name={icon} size={21} /></span><h2>{eyebrow}</h2></header>
      <div className="cc-kpi-value">{value}</div>
      {comparison && (comparison.state === "available" || comparison.state === "stale") ? (
        <span
          aria-label={`${comparison.value >= 0 ? "Up" : "Down"} ${Math.abs(comparison.value).toLocaleString("en-GB", { maximumFractionDigits: 1 })}% ${comparisonMeaning ?? "versus the canonical comparison period"}`}
          className={comparison.value >= 0 ? "cc-change is-positive" : "cc-change is-negative"}
        >
          {comparison.value >= 0 ? "+" : ""}{comparison.value.toLocaleString("en-GB", { maximumFractionDigits: 1 })}% <small>vs comparison</small>
        </span>
      ) : null}
      {trend && trend.length > 1 ? <Sparkline points={trend} /> : <div className="cc-sparkline-empty">Live trend building</div>}
      <div className="cc-kpi-support">{children}</div>
    </article>
  );
}

function Sparkline({ points }: { points: CockpitTrendPoint[] }) {
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const spread = Math.max(...values) - minimum || 1;
  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * 100;
    const y = 30 - ((point.value - minimum) / spread) * 24;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = coordinates.join(" ");

  return (
    <svg className="cc-sparkline" viewBox="0 0 100 34" preserveAspectRatio="none" role="img" aria-label={`Seven-day live trend from ${points[0].label} to ${points.at(-1)?.label}`}>
      <polygon points={`0,34 ${line} 100,34`} fill="currentColor" opacity=".1" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.7" vectorEffect="non-scaling-stroke" />
    </svg>
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

function Snapshot({ title, subtitle, icon, href, children }: {
  title: string; subtitle: string; icon: VaultIconName; href?: string; children: React.ReactNode;
}) {
  return (
    <article className="cc-card cc-snapshot">
      <header>
        <span aria-hidden="true"><VaultIcon name={icon} size={20} /></span>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        {href ? <Link href={href} aria-label={`Open ${title}`}><VaultIcon name="arrow" size={16} /></Link> : null}
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

function inventoryFreshnessText(
  value: CockpitValue<string>,
  generatedAt: string,
): string {
  if (value.state === "unavailable") return "Unavailable";
  if (value.value === "syncing") return "Synchronising…";
  if (value.value === "failed") return "Unavailable";
  const age = value.updatedAt ? relativeTime(value.updatedAt, generatedAt) : "update unavailable";
  return value.value === "delayed"
    ? `Delayed · Last update ${age}`
    : `Current · Updated ${age}`;
}

export function CommandCentreCockpit({ data }: DataProps) {
  const moneyValue = (value: CockpitValue<CockpitMoney>) => display(value, formatMoney);
  const numberValue = (value: CockpitValue<number>) => display(value, (entry) => entry.toLocaleString("en-GB"));
  const percentValue = (value: CockpitValue<number>) => display(value, (entry) => `${entry.toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`);

  return (
    <div className="cc-page">
      <header className="cc-page-header">
        <div><p>THE FABRIC VAULT</p><h1>Command Centre</h1><span>Your business. At a glance.</span></div>
        <div className={`cc-pulse is-${data.businessPulse.state}`} aria-label={`Business Pulse: ${data.businessPulse.label}`}>
          <span>Business Pulse</span>
          <strong>{data.businessPulse.label}</strong>
          <small>State-based · no invented score</small>
        </div>
      </header>

      <section className="cc-kpi-grid" aria-label="Headline business metrics">
        <KpiCard eyebrow="Revenue Today" icon="analytics" accent="green" value={moneyValue(data.trading.revenue)} trend={data.trading.revenueTrend} comparison={data.trading.revenueComparison} comparisonMeaning="versus yesterday">
          <span>Net Shopify revenue</span><span>{stateLabel(data.trading.revenue) ?? "Today"}</span>
        </KpiCard>
        <KpiCard eyebrow="Orders Today" icon="orders" accent="gold" value={numberValue(data.trading.orders)} trend={data.trading.orderTrend} comparison={data.trading.orderComparison} comparisonMeaning="versus yesterday">
          <span>Units {numberValue(data.trading.units)}</span><span>AOV {moneyValue(data.trading.averageOrderValue)}</span>
        </KpiCard>
        <KpiCard eyebrow="Website Conversion" icon="trend" accent="blue" value={percentValue(data.website.conversionRate)}>
          <span>Sessions {numberValue(data.website.sessions)}</span><span>Funnel data unavailable</span>
        </KpiCard>
        <KpiCard eyebrow="Add to Cart Today" icon="target" accent="blue" value={numberValue(data.website.addToCartToday)}>
          <span>Tracked storefront sessions</span><span>Event data unavailable</span>
        </KpiCard>
        <KpiCard eyebrow="Abandoned Checkouts" icon="orders" accent="pink" value={numberValue(data.website.abandonedCheckouts)}>
          <span>Distinct checkout sessions</span><span>Checkout data unavailable</span>
        </KpiCard>
        <KpiCard eyebrow="Website Traffic" icon="analytics" accent="violet" value={numberValue(data.website.estimatedTotalVisitors)} trend={data.website.visitorTrend}>
          <span className="cc-traffic-label">Estimated total visitors</span>
          <span className="cc-traffic-breakdown">
            Tracked {numberValue(data.website.trackedVisitors)} · Estimated untracked {numberValue(data.website.estimatedUntrackedVisitors)} · Live tracked {numberValue(data.website.liveTrackedVisitors)}
          </span>
        </KpiCard>
        <KpiCard eyebrow="Meta Ads" icon="target" accent="pink" value="Not connected">
          <span>Meta marketing data is not integrated.</span>
        </KpiCard>
        <KpiCard eyebrow="Finance Position" icon="inventory" accent="gold" value={moneyValue(data.finance.ledgerCash)}>
          <span>Purchasing power {moneyValue(data.finance.purchasingPower)}</span>
          <span>Reserve {moneyValue(data.finance.protectedReserve)} · Committed {moneyValue(data.finance.committedPurchaseOrders)}</span>
        </KpiCard>
      </section>

      <section className="cc-middle-grid">
        <article className="cc-card cc-feature-panel cc-executive-briefing">
          <header className="cc-panel-heading"><div><p><VaultIcon name="brain" size={19} /> Executive Intelligence</p><h2>Deterministic business briefing</h2></div><Link href="/missions">Open Vault Brain →</Link></header>
          <div className="cc-briefing-body">
            <div className={`cc-briefing-message is-${data.businessPulse.state}`}>
              <span aria-hidden="true">{data.businessPulse.state === "healthy" ? "✓" : "!"}</span>
              <div><strong className="cc-briefing-headline">{data.executiveBriefing.headline}</strong>
                <p className="cc-briefing-summary">{data.executiveBriefing.summary}</p></div>
            </div>
            <div className="cc-briefing-columns">
              <div><b>Going well</b>{data.executiveBriefing.positives.length ? <ul>{data.executiveBriefing.positives.map((item) => <li key={item}>{item}</li>)}</ul> : <span>Unavailable</span>}</div>
              <div><b>Limiting the business</b>{data.executiveBriefing.blockers.length ? <ul>{data.executiveBriefing.blockers.map((item) => <li key={item}>{item}</li>)}</ul> : <span>No structured blocker available</span>}</div>
              <div><b>Supporting evidence</b>{data.executiveBriefing.supportingEvidence.length ? <ul>{data.executiveBriefing.supportingEvidence.map((item) => <li key={item}>{item}</li>)}</ul> : <span>Unavailable</span>}</div>
            </div>
            <div className="cc-briefing-focus"><b>Today&apos;s Focus</b>{data.executiveBriefing.todayFocus.state === "available" ? <><strong>{data.executiveBriefing.todayFocus.title}</strong><Link href={data.executiveBriefing.todayFocus.destination}>Take action →</Link></> : <span>No structured action available</span>}</div>
            {data.executiveBriefing.unlocks.length ? <div className="cc-briefing-unlocks"><b>Unlocks</b><span>{data.executiveBriefing.unlocks.join(" · ")}</span></div> : null}
          </div>
        </article>

        <article className="cc-card cc-feature-panel">
          <header className="cc-panel-heading"><div><p><VaultIcon name="shield" size={18} /> Needs Your Attention</p><h2>Structured priorities</h2></div><span className="cc-item-count">{data.attention.length} items</span></header>
          {data.attention.length ? <div className="cc-attention-list">{data.attention.map((item) => {
            const severity = getAttentionPriorityPresentation(item.priority);
            return (
              <Link className="cc-attention" href={item.destination} key={item.id}>
                <span aria-label={severity.accessibilityLabel} className={`cc-priority ${severity.className}`}>{severity.label}</span>
                <div><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}</div><b aria-hidden="true">→</b>
              </Link>
            );
          })}</div> : <p className="cc-empty">No structured actions are currently available.</p>}
        </article>
      </section>

      <section className="cc-domain-strip" aria-label="Business domain states">
        {data.domains.map((domain) => <div className={`is-${domain.state}`} key={domain.domain}>
          <i aria-hidden="true">●</i><span>{domain.domain}</span><strong>{domain.state === "not_connected" ? "Not connected" : domain.state.charAt(0).toUpperCase() + domain.state.slice(1)}</strong><small>{domain.detail}</small>
        </div>)}
      </section>

      <section className="cc-snapshot-grid" aria-label="Business snapshots">
        <Snapshot title="Sales Funnel" subtitle="Website performance today" icon="trend">
          <MetricRow label="Tracked visitors" value={data.website.trackedVisitors} />
          <MetricRow label="Estimated untracked visitors" value={data.website.estimatedUntrackedVisitors} />
          <MetricRow label="Estimated total visitors" value={data.website.estimatedTotalVisitors} />
          <MetricRow label="Sessions" value={data.website.sessions} />
          <MetricRow label="Add-to-cart rate" value={data.website.addToCartRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Checkout rate" value={data.website.checkoutRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Conversion rate" value={data.website.conversionRate} formatter={(v) => `${v}%`} />
          <MetricRow label="Abandoned checkouts" value={data.website.abandonedCheckouts} />
        </Snapshot>
        <Snapshot title="Inventory Snapshot" subtitle="Canonical stock position" icon="inventory" href="/inventory">
          <MetricRow label="Low-stock styles" value={data.inventory.lowStockStyles} />
          <MetricRow label="Out-of-stock styles" value={data.inventory.outOfStockStyles} />
          <MetricRow label="Total stock value" value={data.inventory.stockValue} formatter={(v) => formatMoney(v as CockpitMoney)} />
          <MetricRow label="Inventory" value={data.inventory.freshness} formatter={() => inventoryFreshnessText(data.inventory.freshness, data.generatedAt)} />
          <MetricRow label="Reorder review" value={data.inventory.reorderReview} />
        </Snapshot>
        <Snapshot title="Marketing Snapshot" subtitle="Meta Ads" icon="target">
          <div className="cc-connection-state"><strong>Not connected</strong><p>Meta marketing metrics are not integrated with Vault OS.</p></div>
        </Snapshot>
        <Snapshot title="Operations Snapshot" subtitle="Order fulfilment" icon="orders" href="/orders">
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
        <span>UK business time · Canonical server sources</span>
        <CommandCentreLiveRefresh generatedAt={data.generatedAt} />
      </footer>
      <CommandCentreCockpitStyles />
    </div>
  );
}

function CommandCentreCockpitStyles() {
  return <style>{`
    .cc-page{--cc-text-xs:11px;--cc-text-sm:12px;--cc-text-md:14px;--cc-text-lg:16px;--cc-card-padding:18px;--cc-panel-gap:14px;--cc-row-space:11px;min-width:0;min-height:calc(100vh - 72px);padding:26px 30px 20px;color:#f4f2ec;background:radial-gradient(circle at 48% -10%,rgba(75,124,148,.075),transparent 38%),radial-gradient(circle at 70% 26%,rgba(164,83,222,.035),transparent 31%)}
    .cc-page-header{display:flex;align-items:end;justify-content:space-between;margin-bottom:18px}.cc-page-header p,.cc-panel-heading p,.cc-feed header p{display:flex;align-items:center;gap:8px;margin:0 0 5px;color:#f0bd36;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.cc-page-header h1{margin:0;font-size:34px;line-height:1.08}.cc-page-header>div>span{color:#b3b8b7;font-size:14px}.cc-pulse{min-width:220px;padding:14px 18px;border:1px solid rgba(222,176,57,.28);border-radius:10px;background:linear-gradient(145deg,#121716,#0a0e0d);box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.cc-pulse>span,.cc-pulse small{display:block;color:#9da39f;font-size:12px}.cc-pulse strong{display:block;margin:4px 0;color:#fff;font-size:22px}.cc-pulse.is-critical strong{color:#ff7474}.cc-pulse.is-attention strong,.cc-pulse.is-watch strong{color:#e3b43e}.cc-pulse.is-healthy strong{color:#58d27d}
    .cc-card{border:1px solid rgba(150,166,162,.16);border-radius:10px;background:linear-gradient(145deg,rgba(19,25,25,.98),rgba(10,14,14,.99));box-shadow:0 12px 30px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.018)}
    .cc-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--cc-panel-gap)}.cc-kpi-card{position:relative;min-width:0;min-height:194px;padding:var(--cc-card-padding);overflow:hidden}.cc-kpi-card:after{position:absolute;inset:auto -20% -65% 20%;height:110px;border-radius:50%;background:currentColor;filter:blur(55px);opacity:.04;content:""}.cc-kpi-card header{display:flex;align-items:center;gap:10px}.cc-kpi-card header>span{display:grid;color:currentColor}.cc-kpi-card h2{margin:0;color:#d8dcda;font-size:11px;text-transform:uppercase;letter-spacing:.035em}.cc-kpi-card.is-gold{color:#f0b91f}.cc-kpi-card.is-green{color:#48da7d}.cc-kpi-card.is-blue{color:#54c8f3}.cc-kpi-card.is-violet{color:#9c69ed}.cc-kpi-card.is-pink{color:#ee4da8}.cc-kpi-value{margin-top:16px;color:#fff;font-size:29px;font-weight:780;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-change{position:absolute;top:62px;right:16px;max-width:45%;font-size:11px;font-weight:700;text-align:right}.cc-change small{display:block;color:#929894;font-size:11px;font-weight:500}.cc-change.is-positive{color:#4bd17a}.cc-change.is-negative{color:#ff6969}.cc-sparkline{display:block;width:100%;height:38px;margin-top:8px;overflow:visible}.cc-sparkline-empty{display:flex;height:38px;align-items:center;margin-top:8px;color:#69716e;font-size:11px}.cc-kpi-support{position:relative;z-index:1;display:flex;justify-content:space-between;gap:8px;margin-top:8px;color:#9fa7a4;font-size:11px;line-height:1.35}.cc-kpi-support span:last-child{text-align:right}.cc-kpi-support .cc-traffic-label{max-width:92px}.cc-kpi-support .cc-traffic-breakdown{max-width:190px}
    .cc-middle-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:var(--cc-panel-gap);margin-top:var(--cc-panel-gap)}.cc-feature-panel{min-height:360px}.cc-executive-briefing{border-top-color:rgba(228,184,63,.7)}.cc-panel-heading{display:flex;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid rgba(255,255,255,.08)}.cc-panel-heading h2{margin:0;color:#b5b9b5;font-size:13px;font-weight:500}.cc-panel-heading>a,.cc-panel-heading>span,.cc-feed a,.cc-briefing-focus>a{display:inline-flex;align-items:center;min-height:34px;color:#e2b43e;font-size:13px;text-decoration:none}.cc-briefing-body{padding:20px}.cc-briefing-message{display:grid;grid-template-columns:40px 1fr;gap:14px}.cc-briefing-message>span{display:grid;width:38px;height:38px;place-items:center;border-radius:50%;color:#e3b43e;background:rgba(227,180,62,.12);font-size:20px;font-weight:800}.cc-briefing-message.is-healthy>span{color:#58d27d;background:rgba(88,210,125,.12)}.cc-briefing-message.is-critical>span{color:#ff7474;background:rgba(255,116,116,.12)}.cc-briefing-headline{display:block;font-size:20px;line-height:1.3}.cc-briefing-summary{margin:7px 0 16px;color:#b1b5b1;font-size:14px;line-height:1.5}.cc-briefing-columns{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:16px 0;border-top:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)}.cc-briefing-columns>div+div{padding-left:16px;border-left:1px solid rgba(255,255,255,.07)}.cc-briefing-columns b,.cc-briefing-focus>b,.cc-briefing-unlocks>b{display:block;margin-bottom:7px;color:#dbae35;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.cc-briefing-columns ul{margin:0;padding-left:17px;color:#afb3af;font-size:13px;line-height:1.45}.cc-briefing-columns li{margin:5px 0}.cc-briefing-columns span{color:#858d87;font-size:13px}.cc-briefing-focus{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;margin-top:16px;padding:13px 15px;border:1px solid rgba(219,177,67,.42);border-radius:8px;background:rgba(219,177,67,.035)}.cc-briefing-focus>b{margin:0}.cc-briefing-focus>strong{font-size:14px}.cc-briefing-focus>span{color:#929994;font-size:13px}.cc-briefing-focus>a{padding:0 10px}.cc-briefing-unlocks{display:grid;grid-template-columns:auto 1fr;gap:12px;margin-top:12px;color:#a4aaa5;font-size:12px;line-height:1.45}.cc-briefing-unlocks>b{margin:0}.cc-attention-list{padding:4px 20px}.cc-attention{display:grid;grid-template-columns:78px 1fr 20px;align-items:center;gap:13px;min-height:70px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07);color:inherit;text-decoration:none}.cc-attention:last-child{border:0}.cc-attention strong{font-size:15px;line-height:1.3}.cc-attention p{display:-webkit-box;margin:5px 0 0;overflow:hidden;color:#a8ada9;font-size:13px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}.cc-priority{padding:7px 4px;border:1px solid rgba(149,158,153,.48);border-radius:6px;color:#b4bbb7;background:rgba(149,158,153,.07);font-size:11px;letter-spacing:-.025em;text-align:center;text-transform:uppercase}.cc-priority.is-critical{border-color:rgba(255,65,65,.82);color:#ff5c5c;background:rgba(255,52,52,.14)}.cc-priority.is-high{border-color:rgba(205,58,78,.72);color:#e86a7d;background:rgba(176,35,55,.13)}.cc-priority.is-medium{border-color:rgba(244,157,45,.68);color:#f3a746;background:rgba(244,145,32,.1)}.cc-priority.is-low{border-color:rgba(151,169,184,.5);color:#b2c1cd;background:rgba(151,169,184,.08)}.cc-priority.is-informational{border-color:rgba(91,169,241,.62);color:#72baff;background:rgba(91,169,241,.1)}.cc-priority.is-unavailable{border-color:rgba(137,145,140,.42);color:#9ba29e;background:rgba(137,145,140,.07)}.cc-attention>b{color:#e1b23b;font-size:20px}.cc-empty{margin:24px;color:#929994;font-size:13px}
    .cc-domain-strip{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:1px;margin-top:var(--cc-panel-gap);overflow:hidden;border:1px solid rgba(219,177,67,.18);border-radius:9px;background:rgba(219,177,67,.18)}.cc-domain-strip>div{position:relative;min-width:0;padding:15px 14px 15px 34px;background:#0f1211}.cc-domain-strip i{position:absolute;top:17px;left:14px;color:#868d88;font-size:12px;font-style:normal}.cc-domain-strip span,.cc-domain-strip small{display:block;overflow:hidden;text-overflow:ellipsis}.cc-domain-strip span{color:#969d98;font-size:11px;text-transform:uppercase}.cc-domain-strip strong{display:block;margin:5px 0;color:#e1e0da;font-size:15px}.cc-domain-strip small{color:#8c938e;font-size:11px;line-height:1.35}.cc-domain-strip .is-healthy strong,.cc-domain-strip .is-healthy i{color:#58d27d}.cc-domain-strip .is-watch strong,.cc-domain-strip .is-attention strong,.cc-domain-strip .is-watch i,.cc-domain-strip .is-attention i{color:#e3b43e}.cc-domain-strip .is-critical strong,.cc-domain-strip .is-critical i{color:#ff7474}.cc-domain-strip .is-not_connected strong,.cc-domain-strip .is-not_connected i{color:#78a8dd}
    .cc-snapshot-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--cc-panel-gap);margin-top:var(--cc-panel-gap)}.cc-snapshot{min-height:275px}.cc-snapshot>header{display:flex;gap:12px;align-items:center;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.07)}.cc-snapshot>header>span{color:#dfb33e;font-size:21px}.cc-snapshot h2{margin:0;color:#e1b33c;font-size:14px;text-transform:uppercase}.cc-snapshot header p{margin:4px 0 0;color:#9ca29d;font-size:12px}.cc-snapshot-rows{padding:8px 18px}.cc-metric-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;color:#c5c8c4;font-size:13px;line-height:1.35;border-bottom:1px solid rgba(255,255,255,.05)}.cc-metric-row strong{color:#f0efea;text-align:right}.cc-metric-row strong.is-unavailable,.cc-metric-row strong.is-not_connected{color:#838b85;font-weight:500}.cc-metric-row strong.is-stale{color:#e2b23c}.cc-metric-row small{margin-left:6px;font-size:11px;text-transform:uppercase}.cc-connection-state{display:grid;min-height:190px;place-content:center;text-align:center}.cc-connection-state strong{color:#c0c4c0;font-size:18px}.cc-connection-state p{max-width:240px;margin:10px auto;color:#929a94;font-size:13px;line-height:1.5}
    .cc-feed{margin-top:var(--cc-panel-gap);padding:15px 18px}.cc-feed>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.cc-feed header span{color:#969d98;font-size:12px}.cc-feed-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.cc-feed-grid article{display:grid;grid-template-columns:16px 1fr auto;gap:11px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:8px}.cc-feed-grid article>span{color:#dbae35;font-size:12px}.cc-feed-grid strong{font-size:13px}.cc-feed-grid p{margin:4px 0 0;color:#9da39e;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cc-feed-grid time{color:#929994;font-size:11px}.cc-footer{display:flex;flex-wrap:wrap;gap:12px 24px;padding:16px 2px 4px;color:#929994;font-size:12px}.cc-footer .is-live{color:#54c978}.cc-footer .is-stale,.cc-footer .is-partial{color:#deb13c}.cc-footer .is-error{color:#f16b6b}.cc-live-refresh{display:inline-flex;align-items:center;gap:6px}.cc-live-refresh i{font-size:11px;font-style:normal}.cc-live-refresh.is-live,.cc-live-refresh.is-updated{color:#54c978}.cc-live-refresh.is-connecting,.cc-live-refresh.is-refreshing{color:#e3b43e}.cc-live-refresh.is-reconnecting,.cc-live-refresh.is-delayed{color:#f0a34a}.cc-live-refresh.is-unavailable{color:#929994}
    .cc-item-count{padding:4px 10px;border:1px solid rgba(226,180,62,.3);border-radius:999px;background:rgba(226,180,62,.08)}
    .cc-snapshot{min-width:0}.cc-snapshot>header>span,.cc-snapshot>header>a{display:grid;color:#dfb33e}.cc-snapshot>header>div{min-width:0}.cc-snapshot>header>a{margin-left:auto}
    @media(max-width:1500px){.cc-page{padding:24px}.cc-kpi-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.cc-domain-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.cc-snapshot-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:1050px){.cc-middle-grid{grid-template-columns:1fr}.cc-briefing-columns{gap:12px}.cc-domain-strip{grid-template-columns:repeat(4,1fr)}}
    @media(max-width:820px){.cc-page{padding:20px}.cc-page-header{align-items:flex-start}.cc-page-header h1{font-size:28px}.cc-pulse{min-width:190px}.cc-kpi-grid{grid-template-columns:repeat(2,1fr)}.cc-briefing-columns{grid-template-columns:1fr}.cc-briefing-columns>div+div{padding:12px 0 0;border-top:1px solid rgba(255,255,255,.07);border-left:0}.cc-domain-strip{grid-template-columns:repeat(2,1fr)}.cc-snapshot-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:600px){.cc-page{padding:16px}.cc-page-header{display:grid;gap:14px}.cc-page-header h1{font-size:24px}.cc-pulse{width:100%;min-width:0}.cc-kpi-grid{grid-template-columns:1fr}.cc-kpi-card{min-width:0}.cc-panel-heading{align-items:flex-start;gap:10px}.cc-briefing-focus{grid-template-columns:1fr}.cc-domain-strip{grid-template-columns:1fr}.cc-snapshot-grid{grid-template-columns:1fr}.cc-feed-grid{grid-template-columns:1fr}.cc-feed>header{align-items:flex-start;gap:10px}.cc-feed-grid article{grid-template-columns:16px minmax(0,1fr)}.cc-feed-grid time{grid-column:2}.cc-footer{flex-direction:column;gap:7px}}
  `}</style>;
}
