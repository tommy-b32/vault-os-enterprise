"use client";

import type { FixedPackPurchaseRecommendationServiceResult } from "@/lib/fixed-pack-purchase-recommendations";

type Props = { results: FixedPackPurchaseRecommendationServiceResult[] };

export default function PurchaseRecommendationsPanel({ results }: Props) {
  const recommendations = results.filter((result) => result.kind === "recommendation");
  const buyNow = recommendations
    .filter((result) => (result.recommendation.recommendedPackCount ?? 0) > 0)
    .sort((left, right) => {
      const a = left.recommendation;
      const b = right.recommendation;
      return (b.recommendedPackCount ?? 0) - (a.recommendedPackCount ?? 0)
        || (b.recommendedTotalUnits ?? 0) - (a.recommendedTotalUnits ?? 0)
        || `${a.styleId}\u0000${a.modelDesign}`.localeCompare(`${b.styleId}\u0000${b.modelDesign}`);
    });
  const buyNothing = recommendations.filter((result) => result.recommendation.recommendedPackCount === 0);
  const unavailable = results.filter((result) => result.kind === "unavailable");
  const notApplicable = results.filter((result) => result.kind === "not_applicable");
  const packs = buyNow.reduce((total, result) => total + (result.recommendation.recommendedPackCount ?? 0), 0);
  const units = buyNow.reduce((total, result) => total + (result.recommendation.recommendedTotalUnits ?? 0), 0);

  const metrics = [
    ["BUY NOW", buyNow.length], ["BUY NOTHING", buyNothing.length], ["NEEDS ATTENTION", unavailable.length],
    ["DO NOT RESTOCK", notApplicable.length], ["PACKS TO BUY", packs], ["UNITS TO BUY", units],
  ];

  return <section className="purchase-intelligence-diagnostics" aria-labelledby="fixed-pack-recommendations">
    <div className="purchase-intelligence-diagnostics-heading"><div><p className="vault-eyebrow">FIXED-PACK RECOMMENDATIONS</p><h2 id="fixed-pack-recommendations">Purchase Recommendations</h2><p>Read-only recommendations from the fixed-pack service.</p></div><span>Advisory only</span></div>
    <div className="purchase-intelligence-metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="purchase-intelligence-supplier">
      <div className="purchase-intelligence-supplier-heading"><div><p className="vault-eyebrow">BUY NOW</p><h2>{buyNow.length} actionable recommendations</h2></div><span>Whole packs only</span></div>
      {buyNow.length === 0 ? <p>No fixed-pack purchases are currently recommended.</p> : <div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Product</th><th>Model / Design</th><th>Supplier</th><th>Packs</th><th>Units</th><th>Reason codes</th></tr></thead><tbody>{buyNow.map(({ recommendation }) => <tr key={recommendation.recommendationId}><td><strong>{recommendation.parentProductId}</strong><small>{recommendation.styleId}</small></td><td>{recommendation.modelDesign}</td><td>{recommendation.supplierId}</td><td><strong>{recommendation.recommendedPackCount}</strong></td><td><strong>{recommendation.recommendedTotalUnits}</strong></td><td>{recommendation.reasonCodes.join(", ") || "—"}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="purchase-intelligence-diagnostic-grid">
      <article className="purchase-intelligence-diagnostic"><header><div><span>Buy Nothing</span><h3>{buyNothing.length}</h3></div></header><p>Valid calculations with zero packs required.</p></article>
      <article className="purchase-intelligence-diagnostic is-blocked"><header><div><span>Needs Attention</span><h3>{unavailable.length}</h3></div></header><p>{[...new Set(unavailable.flatMap((result) => result.reasons))].join(", ") || "No blockers"}</p></article>
      <article className="purchase-intelligence-diagnostic"><header><div><span>Do Not Restock</span><h3>{notApplicable.length}</h3></div></header><p>Intentionally excluded from replenishment.</p></article>
    </div>
  </section>;
}
