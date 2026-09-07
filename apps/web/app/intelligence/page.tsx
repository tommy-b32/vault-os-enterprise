import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { StoreIntelligence } from "@/lib/intelligence/StoreIntelligence";

export const dynamic = "force-dynamic";

function money(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPercent(value: number | null): string {
  if (value === null) return "NEW";
  const amount = Math.round(value * 100);
  return `${amount > 0 ? "+" : ""}${amount}%`;
}

export default async function IntelligencePage() {
  await requireAuthenticatedOperator();

  let snapshot;
  try {
    snapshot = await StoreIntelligence.getSnapshot();
  } catch (error) {
    return (
      <VaultAppShell
        searchPlaceholder="Search Store Intelligence..."
        systemStatusLabel="Store intelligence unavailable"
      >
        <main className="intelligence-page">
          <section className="intelligence-error">
            <p className="vault-eyebrow">STORE INTELLIGENCE</p>
            <h1>Store Intelligence unavailable</h1>
            <p>{error instanceof Error ? error.message : "Unable to calculate store intelligence."}</p>
          </section>
          <IntelligenceStyles />
        </main>
      </VaultAppShell>
    );
  }

  return (
    <VaultAppShell
      searchPlaceholder="Search Store Intelligence..."
      systemStatusLabel="Store intelligence online"
    >
      <main className="intelligence-page">
        <header className="intelligence-header">
          <div>
            <p className="vault-eyebrow">STORE INTELLIGENCE</p>
            <h1>What is happening, why, and what should we do?</h1>
            <p>
              Deterministic Shopify intelligence from genuine Vault OS orders. Historical migration data before 4 May 2026 is excluded.
            </p>
          </div>
          <div className="intelligence-source-chip">
            <span className="intelligence-source-dot" />
            Shopify canonical data
          </div>
        </header>

        <section className="intelligence-kpis" aria-label="Store intelligence summary">
          <article><span>Genuine orders</span><strong>{snapshot.sourceOrderCount}</strong><small>Since 4 May 2026</small></article>
          <article><span>Net revenue</span><strong>{money(snapshot.netRevenue)}</strong><small>Canonical Shopify revenue</small></article>
          <article><span>Average order value</span><strong>{money(snapshot.averageOrderValue)}</strong><small>Net revenue / order</small></article>
          <article><span>Items per order</span><strong>{snapshot.averageItemsPerOrder.toFixed(2)}</strong><small>{percent(snapshot.twoItemOrderShare)} are exactly 2 items</small></article>
          <article><span>Refund rate</span><strong>{percent(snapshot.refundRate)}</strong><small>Refund value / gross value</small></article>
        </section>

        <section className="trend-grid">
          {snapshot.trends.map((trend) => (
            <article className="intelligence-panel trend-card" key={trend.label}>
              <div className="trend-heading">
                <div><span>{trend.label.toUpperCase()} MOMENTUM</span><h2>{money(trend.currentRevenue)}</h2></div>
                <span className={`confidence-badge is-${trend.confidence}`}>{trend.confidence} confidence</span>
              </div>
              <div className="trend-metrics">
                <div><small>Revenue</small><strong className={(trend.revenueChange ?? 0) >= 0 ? "is-up" : "is-down"}>{signedPercent(trend.revenueChange)}</strong><span>vs {money(trend.previousRevenue)}</span></div>
                <div><small>Orders</small><strong className={(trend.orderChange ?? 0) >= 0 ? "is-up" : "is-down"}>{signedPercent(trend.orderChange)}</strong><span>{trend.currentOrders} vs {trend.previousOrders}</span></div>
                <div><small>AOV</small><strong className={(trend.aovChange ?? 0) >= 0 ? "is-up" : "is-down"}>{signedPercent(trend.aovChange)}</strong><span>{money(trend.currentAov)} vs {money(trend.previousAov)}</span></div>
              </div>
            </article>
          ))}
        </section>

        <section className="intelligence-grid">
          <article className="intelligence-panel intelligence-panel-wide">
            <div className="intelligence-panel-heading">
              <div><span>WEEKDAY PERFORMANCE</span><h2>{snapshot.bestWeekday?.day ?? "—"} is currently strongest</h2></div>
              {snapshot.bestWeekday ? <strong>{money(snapshot.bestWeekday.averageRevenue)} / day</strong> : null}
            </div>
            <div className="weekday-table-wrap">
              <table className="weekday-table">
                <thead><tr><th>Day</th><th>Orders</th><th>Avg orders/day</th><th>Avg revenue/day</th><th>AOV</th></tr></thead>
                <tbody>
                  {snapshot.weekdays.map((day) => (
                    <tr key={day.day} className={day.day === snapshot.bestWeekday?.day ? "is-best" : undefined}>
                      <td><strong>{day.day}</strong>{day.day === snapshot.bestWeekday?.day ? <span className="best-badge">BEST</span> : null}</td>
                      <td>{day.orders}</td>
                      <td>{day.averageOrders.toFixed(2)}</td>
                      <td>{money(day.averageRevenue)}</td>
                      <td>{money(day.aov)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {snapshot.weakestWeekday ? <p className="weakest-note">Current weakest revenue day: <strong>{snapshot.weakestWeekday.day}</strong> at {money(snapshot.weakestWeekday.averageRevenue)} / observed day.</p> : null}
          </article>

          <article className="intelligence-panel">
            <div className="intelligence-panel-heading"><div><span>BEST SUNDAY WINDOW</span><h2>{snapshot.bestSundayWindow?.label ?? "No data"}</h2></div></div>
            {snapshot.bestSundayWindow ? (
              <div className="window-stat"><strong>{snapshot.bestSundayWindow.orders}</strong><span>orders</span><strong>{money(snapshot.bestSundayWindow.revenue)}</strong><span>net revenue</span></div>
            ) : <p className="intelligence-muted">No Sunday orders are available yet.</p>}
          </article>

          <article className="intelligence-panel">
            <div className="intelligence-panel-heading"><div><span>META EFFICIENCY</span><h2>Waiting for trusted ad data</h2></div><span className="pending-badge">PENDING</span></div>
            <p className="intelligence-muted">Vault OS will not recommend budget changes until Meta spend, purchase value and Shopify revenue can be compared by day.</p>
            <div className="meta-lock">Budget recommendations locked</div>
          </article>
        </section>

        <section className="intelligence-panel intelligence-insights-panel">
          <div className="intelligence-panel-heading"><div><span>VAULT OS FINDINGS</span><h2>Detected automatically</h2></div></div>
          <div className="insight-list">
            {snapshot.insights.map((insight) => (
              <article className={`insight-card is-${insight.severity}`} key={insight.id}>
                <div><span className="insight-dot" /><strong>{insight.title}</strong>{insight.confidence ? <span className={`confidence-badge is-${insight.confidence}`}>{insight.confidence}</span> : null}</div>
                <p>{insight.summary}</p>
                <small>{insight.evidence}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="intelligence-panel intelligence-insights-panel">
          <div className="intelligence-panel-heading"><div><span>PRODUCT MOMENTUM</span><h2>Last 14 days vs previous 14 days</h2></div></div>
          <div className="momentum-grid">
            {snapshot.productMomentum.map((product) => (
              <article key={product.title} className={`momentum-card is-${product.status}`}>
                <div className="momentum-title"><strong>{product.title}</strong><span className={`confidence-badge is-${product.confidence}`}>{product.confidence}</span></div>
                <div className="momentum-value"><b>{product.currentUnits}</b><small>net units</small><em>{signedPercent(product.unitChange)}</em></div>
                <p>{product.previousUnits} units in prior 14 days · {money(product.currentRevenue)} current revenue</p>
                <div className="momentum-recommendation"><strong>{product.status.replaceAll("_", " ")}</strong><span>{product.recommendedAction}</span><small>{product.evidence}</small></div>
                <div className={`momentum-stock is-${product.inventory.priority}`}>
                  <strong>{product.inventory.state === "mapping_incomplete" ? "Inventory mapping incomplete" : product.inventory.state === "inventory_unavailable" ? "Inventory unavailable" : `${product.inventory.priority.toUpperCase()} reorder priority`}</strong>
                  {product.inventory.state === "available" ? <span>{product.inventory.sold14} units / 14d · {product.inventory.stock} available · {product.inventory.daysCover === null ? "cover unavailable" : `~${product.inventory.daysCover} days cover`}</span> : null}
                  <small>{product.inventory.action}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="intelligence-panel">
          <div className="intelligence-panel-heading"><div><span>PRODUCT LEADERS</span><h2>Highest net units sold</h2></div></div>
          <div className="product-grid">
            {snapshot.topProducts.map((product, index) => (
              <article key={product.title}>
                <span>#{index + 1}</span>
                <div><strong>{product.title}</strong><small>{money(product.revenue)} net revenue</small></div>
                <b>{product.units} units</b>
              </article>
            ))}
          </div>
        </section>

        <footer className="intelligence-footer">
          Calculated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(snapshot.generatedAt))}. Insights are rule-based and grounded in canonical store data.
        </footer>
      </main>
      <IntelligenceStyles />
    </VaultAppShell>
  );
}

function IntelligenceStyles() {
  return <style>{`
    .intelligence-page{padding:30px;max-width:1500px;margin:0 auto;color:#f2f1ec}.intelligence-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}.intelligence-header h1{margin:6px 0 8px;font-size:30px;max-width:780px}.intelligence-header p{margin:0;color:#929895;max-width:760px;line-height:1.6}.intelligence-source-chip{display:flex;align-items:center;gap:8px;border:1px solid rgba(97,208,138,.2);border-radius:999px;padding:9px 12px;background:rgba(97,208,138,.05);color:#a9d9b9;font-size:11px;white-space:nowrap}.intelligence-source-dot{width:7px;height:7px;border-radius:50%;background:#61d08a;box-shadow:0 0 12px rgba(97,208,138,.55)}
    .intelligence-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:12px}.intelligence-kpis article,.intelligence-panel{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.008)),#0b0d0c}.intelligence-kpis article{padding:17px}.intelligence-kpis span{display:block;color:#858b88;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.intelligence-kpis strong{display:block;margin:9px 0 5px;font-size:22px}.intelligence-kpis small{color:#c59d3e;font-size:9px}.trend-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}.trend-card{padding:18px}.trend-heading{display:flex;justify-content:space-between;gap:12px}.trend-heading span{color:#b48d35;font-size:9px;letter-spacing:.12em}.trend-heading h2{margin:6px 0 0;font-size:22px}.trend-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}.trend-metrics>div{padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#090b0a}.trend-metrics small,.trend-metrics span{display:block;color:#737976;font-size:8px}.trend-metrics strong{display:block;margin:5px 0;font-size:15px}.is-up{color:#61d08a}.is-down{color:#d98270}.confidence-badge{display:inline-flex!important;width:max-content;padding:3px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.08);font-size:7px!important;line-height:1;text-transform:uppercase;letter-spacing:.06em;color:#8d9490!important;background:rgba(255,255,255,.03)}.confidence-badge.is-high{color:#72d997!important;border-color:rgba(97,208,138,.2)}.confidence-badge.is-medium{color:#e2bd5b!important;border-color:rgba(214,173,67,.2)}
    .intelligence-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px}.intelligence-panel{padding:20px}.intelligence-panel-wide{grid-row:span 1}.intelligence-panel-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.intelligence-panel-heading span{color:#b48d35;font-size:9px;letter-spacing:.12em}.intelligence-panel-heading h2{font-size:17px;margin:5px 0 0}.intelligence-panel-heading>strong{font-size:17px;color:#e6c25b}.weekday-table-wrap{overflow:auto}.weekday-table{width:100%;border-collapse:collapse;font-size:11px}.weekday-table th,.weekday-table td{text-align:left;padding:10px;border-top:1px solid rgba(255,255,255,.06);white-space:nowrap}.weekday-table th{color:#727875;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.weekday-table tr.is-best{background:rgba(214,173,67,.06)}.best-badge,.pending-badge{display:inline-flex;margin-left:7px;padding:3px 5px;border-radius:5px;border:1px solid rgba(214,173,67,.28);font-size:7px!important;color:#e4b94a!important;background:rgba(214,173,67,.08)}.pending-badge{margin:0}.weakest-note{margin:12px 0 0;color:#747a77;font-size:9px}.weakest-note strong{color:#c5c9c6}.window-stat{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:baseline;padding-top:8px}.window-stat strong{font-size:22px}.window-stat span{color:#747a77;font-size:10px}.intelligence-muted{color:#8a918d;font-size:11px;line-height:1.6}.meta-lock{margin-top:15px;padding:10px;border:1px dashed rgba(255,255,255,.1);border-radius:8px;color:#777e7a;font-size:9px;text-align:center;text-transform:uppercase;letter-spacing:.08em}.intelligence-insights-panel{margin-bottom:12px}.insight-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.insight-card{padding:14px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#090b0a}.insight-card>div{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.insight-card strong{font-size:11px}.insight-card p{margin:10px 0 8px;font-size:11px;line-height:1.55;color:#d4d7d4}.insight-card small{color:#747a77;line-height:1.5}.insight-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:#d9ad43}.insight-card.is-positive .insight-dot{background:#61d08a}.insight-card.is-watch .insight-dot{background:#d5a24b}.momentum-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.momentum-card{padding:13px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#090b0a}.momentum-title{display:flex;justify-content:space-between;gap:8px;align-items:center}.momentum-title strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.momentum-value{display:flex;align-items:baseline;gap:6px;margin-top:10px}.momentum-value b{font-size:20px}.momentum-value small{color:#747a77;font-size:8px}.momentum-value em{margin-left:auto;font-style:normal;font-size:11px;color:#aeb3b0}.momentum-card.is-up .momentum-value em,.momentum-card.is-new .momentum-value em{color:#61d08a}.momentum-card.is-down .momentum-value em{color:#d98270}.momentum-card p{margin:6px 0 0;color:#686e6b;font-size:8px}.product-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.product-grid article{display:grid;grid-template-columns:28px 1fr auto;gap:9px;align-items:center;padding:11px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:#090b0a}.product-grid article>span{color:#a88638;font-size:9px}.product-grid strong,.product-grid small{display:block}.product-grid strong{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.product-grid small{margin-top:3px;color:#686e6b;font-size:8px}.product-grid b{font-size:10px;color:#d9ad43}.intelligence-footer{padding:14px 3px;color:#626865;font-size:9px}.intelligence-error{margin:40px auto;max-width:760px;padding:25px;border:1px solid rgba(255,100,100,.18);border-radius:12px;background:#0d0b0b}.intelligence-error h1{margin:7px 0}.intelligence-error p{color:#a29a98}
    .momentum-recommendation{display:grid;gap:4px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.06)}.momentum-recommendation strong{color:#d9ad43;font-size:8px;letter-spacing:.08em;text-transform:uppercase}.momentum-card.is-accelerating .momentum-value em,.momentum-card.is-accelerating .momentum-recommendation strong{color:#61d08a}.momentum-card.is-cooling .momentum-value em,.momentum-card.is-cooling .momentum-recommendation strong{color:#d98270}.momentum-recommendation span{font-size:9px;line-height:1.35;color:#c7cbc8}.momentum-recommendation small{font-size:8px;line-height:1.35;color:#686e6b}
    .momentum-stock{display:grid;gap:3px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)}.momentum-stock strong{font-size:8px;letter-spacing:.08em;text-transform:uppercase;color:#d9ad43}.momentum-stock.is-high strong,.momentum-stock.is-critical strong{color:#d98270}.momentum-stock.is-none strong{color:#61d08a}.momentum-stock span{font-size:9px;color:#c7cbc8}.momentum-stock small{font-size:8px;color:#686e6b}
    @media(max-width:1100px){.intelligence-kpis{grid-template-columns:repeat(3,1fr)}.intelligence-grid{grid-template-columns:1fr 1fr}.intelligence-panel-wide{grid-column:1/-1}.insight-list,.product-grid,.momentum-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.intelligence-page{padding:18px 12px}.intelligence-header{display:block}.intelligence-source-chip{margin-top:16px;width:max-content}.intelligence-kpis,.trend-grid,.intelligence-grid,.insight-list,.product-grid,.momentum-grid,.trend-metrics{grid-template-columns:1fr}.intelligence-panel-wide{grid-column:auto}.intelligence-header h1{font-size:23px}}
  `}</style>;
}
