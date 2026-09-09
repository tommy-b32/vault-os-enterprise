"use client";

import { Fragment, useState } from "react";
import type { FixedPackPurchaseRecommendationServiceResult } from "@/lib/fixed-pack-purchase-recommendations";

type Props = { results: FixedPackPurchaseRecommendationServiceResult[] };

export default function PurchaseRecommendationsPanel({ results }: Props) {
  const [expandedEvidence, setExpandedEvidence] = useState<ReadonlySet<string>>(new Set());
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
      {buyNow.length === 0 ? <p>No fixed-pack purchases are currently recommended.</p> : <div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Product</th><th>Model / Design</th><th>Supplier</th><th>Packs</th><th>Units</th><th>Pack composition</th><th>Reason codes</th><th>Evidence</th></tr></thead><tbody>{buyNow.map(({ recommendation }) => {
        const expanded = expandedEvidence.has(recommendation.recommendationId);
        const composition = recommendation.sizes.map((size) => `${size.normalizedSize} ×${size.unitsPerPack}`).join(" · ");
        const toggleEvidence = () => setExpandedEvidence((current) => {
          const next = new Set(current);
          if (next.has(recommendation.recommendationId)) next.delete(recommendation.recommendationId);
          else next.add(recommendation.recommendationId);
          return next;
        });
        return <Fragment key={recommendation.recommendationId}><tr><td><strong>{recommendation.parentProductId}</strong><small>{recommendation.styleId}</small></td><td>{recommendation.modelDesign}</td><td>{recommendation.supplierId}</td><td><strong>{recommendation.recommendedPackCount}</strong></td><td><strong>{recommendation.recommendedTotalUnits}</strong></td><td>{composition || "—"}</td><td>{recommendation.reasonCodes.join(", ") || "—"}</td><td><button type="button" aria-expanded={expanded} onClick={toggleEvidence}>View size evidence</button></td></tr>{expanded ? <tr><td colSpan={8}><div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Size</th><th>Stock now</th><th>Incoming</th><th>Sold 7d</th><th>Sold 14d</th><th>Sold 30d</th><th>Target</th><th>Ideal need</th><th>Units/pack</th><th>Buying</th><th>Projected stock</th><th>Shortage</th><th>Excess</th></tr></thead><tbody>{recommendation.sizes.map((size) => <tr key={size.normalizedSize}><td>{size.normalizedSize}</td><td>{size.netAvailableStock ?? "—"}</td><td>{size.incomingStock ?? "—"}</td><td>{size.sales7DayUnits ?? "—"}</td><td>{size.sales14DayUnits ?? "—"}</td><td>{size.sales30DayUnits ?? "—"}</td><td>{size.targetStockUnits ?? "—"}</td><td>{size.idealSizeNeed ?? "—"}</td><td>{size.unitsPerPack ?? "—"}</td><td>{size.purchasedUnits ?? "—"}</td><td>{size.projectedStock ?? "—"}</td><td>{size.remainingShortage ?? "—"}</td><td>{size.projectedExcess ?? "—"}</td></tr>)}</tbody></table></div></td></tr> : null}</Fragment>;
      })}</tbody></table></div>}
    </section>
    <div className="purchase-intelligence-diagnostic-grid">
      <article className="purchase-intelligence-diagnostic"><header><div><span>Buy Nothing</span><h3>{buyNothing.length}</h3></div></header><p>Valid calculations with zero packs required.</p></article>
      <article className="purchase-intelligence-diagnostic is-blocked"><header><div><span>Needs Attention</span><h3>{unavailable.length}</h3></div></header><p>{[...new Set(unavailable.flatMap((result) => result.reasons))].join(", ") || "No blockers"}</p></article>
      <article className="purchase-intelligence-diagnostic"><header><div><span>Do Not Restock</span><h3>{notApplicable.length}</h3></div></header><p>Intentionally excluded from replenishment.</p></article>
    </div>
  </section>;
}
