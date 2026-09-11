"use client";

import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import { addFixedPackRecommendationToDraftAction } from "@/app/purchase-orders/actions";
import type { FixedPackPurchaseRecommendationServiceResult, FixedPackPurchaseRecommendationTransport } from "@/lib/fixed-pack-purchase-recommendations";

type PresentedFixedPackRecommendation = FixedPackPurchaseRecommendationTransport & { productName: string | null; supplierName: string | null; draftMatch: { purchaseOrderId: string } | null };
type PresentedFixedPackRecommendationResult = Exclude<FixedPackPurchaseRecommendationServiceResult, { kind: "recommendation" }> | { kind: "recommendation"; recommendation: PresentedFixedPackRecommendation };
type Props = { results: PresentedFixedPackRecommendationResult[] };

const REASON_EXPLANATIONS: Readonly<Record<string, string>> = {
  ALL_SIZES_ABOVE_TARGET: "Stock is already above target across the size range, so no pack is needed.",
  SINGLE_SIZE_NEED_WAIT: "Only one size currently needs stock. A full pack would create unnecessary excess in other sizes.",
  TWO_SIZE_NEED_WAIT: "Only two sizes currently need stock. Wait until demand is broader before buying another full pack.",
  RESTOCK_DISABLED: "This style is intentionally set to do not restock.",
  PACK_COMPOSITION_MISSING: "No approved supplier pack composition is configured for this style.",
  PACK_SIZE_EVIDENCE_MISSING: "Canonical size evidence is incomplete or ambiguous, so Vault OS will not make a purchase recommendation.",
  SEMANTIC_IDENTITY_UNRESOLVED: "Product model or size identity is unresolved, so Vault OS has failed closed.",
  SUPPLIER_MISSING: "No supplier is assigned to this style.",
};

const SAFE_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  refresh_required: "This recommendation has changed. Refresh and try again.",
  changed_recommendation: "This recommendation has changed. Refresh and review it before adding.",
  invalid_target_draft: "That draft PO can no longer be used.",
  multiple_eligible_drafts: "Multiple eligible draft POs exist. Open Purchase Orders and choose a draft.",
  canonical_data_incomplete: "Required purchasing data is incomplete. Review this recommendation before continuing.",
  operation_failed: "We couldn’t add this recommendation to a draft PO. Please try again.",
};

function ReasonList({ reasons }: { reasons: readonly string[] }) {
  if (reasons.length === 0) return <>—</>;
  return <div>{reasons.map((reason) => <div key={reason}><strong>{REASON_EXPLANATIONS[reason] ?? reason}</strong><small>{reason}</small></div>)}</div>;
}

function AddToDraftButton({ styleId, parentProductId, draftMatch }: { styleId: string; parentProductId: string; draftMatch: { purchaseOrderId: string } | null }) {
  const idempotencyKey = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [purchaseOrderId, setPurchaseOrderId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const addToDraft = async () => {
    if (pending || purchaseOrderId) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true);
    setFailure(null);
    try {
      const result = await addFixedPackRecommendationToDraftAction({ styleId, parentProductId, idempotencyKey: idempotencyKey.current, targetDraftId: null });
      if (result.success) setPurchaseOrderId(result.purchaseOrderId);
      else setFailure(SAFE_FAILURE_MESSAGES[result.code] ?? SAFE_FAILURE_MESSAGES.operation_failed);
    } catch {
      setFailure(SAFE_FAILURE_MESSAGES.operation_failed);
    } finally {
      setPending(false);
    }
  };

  const matchedPurchaseOrderId = draftMatch?.purchaseOrderId ?? purchaseOrderId;
  if (matchedPurchaseOrderId) return <div aria-live="polite"><strong>{draftMatch ? "In Draft PO" : "Added to Draft PO"}</strong><Link className="vault-secondary-button" href={`/purchase-orders/${matchedPurchaseOrderId}`}>View Draft PO →</Link></div>;
  return <div aria-live="polite"><button className="vault-primary-button" type="button" disabled={pending} onClick={addToDraft}>{pending ? "Adding…" : "Add to Draft PO"}</button>{failure ? <p role="alert">{failure}</p> : null}</div>;
}

export default function PurchaseRecommendationsPanel({ results }: Props) {
  const [expandedEvidence, setExpandedEvidence] = useState<ReadonlySet<string>>(new Set());
  const recommendations = results.filter((result) => result.kind === "recommendation");
  const buyNow = recommendations.filter((result) => result.recommendation.trusted && (result.recommendation.recommendedPackCount ?? 0) > 0 && (result.recommendation.recommendedTotalUnits ?? 0) > 0).sort((left, right) => {
    const a = left.recommendation; const b = right.recommendation;
    return (b.recommendedPackCount ?? 0) - (a.recommendedPackCount ?? 0) || (b.recommendedTotalUnits ?? 0) - (a.recommendedTotalUnits ?? 0) || `${a.styleId}\u0000${a.modelDesign}`.localeCompare(`${b.styleId}\u0000${b.modelDesign}`);
  });
  const buyNothing = recommendations.filter((result) => result.recommendation.recommendedPackCount === 0);
  const unavailable = results.filter((result) => result.kind === "unavailable");
  const notApplicable = results.filter((result) => result.kind === "not_applicable");
  const packs = buyNow.reduce((total, result) => total + (result.recommendation.recommendedPackCount ?? 0), 0);
  const units = buyNow.reduce((total, result) => total + (result.recommendation.recommendedTotalUnits ?? 0), 0);
  const metrics = [["BUY NOW", buyNow.length], ["BUY NOTHING", buyNothing.length], ["NEEDS ATTENTION", unavailable.length], ["DO NOT RESTOCK", notApplicable.length], ["PACKS TO BUY", packs], ["UNITS TO BUY", units]];

  return <section className="purchase-intelligence-diagnostics" aria-labelledby="fixed-pack-recommendations">
    <div className="purchase-intelligence-diagnostics-heading"><div><p className="vault-eyebrow">FIXED-PACK RECOMMENDATIONS</p><h2 id="fixed-pack-recommendations">Purchase Recommendations</h2><p>Read-only recommendations from the fixed-pack service.</p></div><span>Advisory only</span></div>
    <div className="purchase-intelligence-metrics">{metrics.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="purchase-intelligence-supplier"><div className="purchase-intelligence-supplier-heading"><div><p className="vault-eyebrow">BUY NOW</p><h2>{buyNow.length} actionable recommendations</h2></div><span>Whole packs only</span></div>
      {buyNow.length === 0 ? <p>No fixed-pack purchases are currently recommended.</p> : <div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Product</th><th>Model / Design</th><th>Supplier</th><th>Packs</th><th>Units</th><th>Pack composition</th><th>Reason codes</th><th>Evidence</th><th>Draft PO</th></tr></thead><tbody>{buyNow.map(({ recommendation }) => {
        const expanded = expandedEvidence.has(recommendation.recommendationId);
        const composition = recommendation.sizes.map((size) => `${size.normalizedSize} ×${size.unitsPerPack}`).join(" · ");
        const toggleEvidence = () => setExpandedEvidence((current) => { const next = new Set(current); if (next.has(recommendation.recommendationId)) next.delete(recommendation.recommendationId); else next.add(recommendation.recommendationId); return next; });
        return <Fragment key={recommendation.recommendationId}><tr><td><strong>{recommendation.productName ?? "Identity unavailable"}</strong></td><td>{recommendation.modelDesign}</td><td>{recommendation.supplierName ?? "Identity unavailable"}</td><td><strong>{recommendation.recommendedPackCount}</strong></td><td><strong>{recommendation.recommendedTotalUnits}</strong></td><td>{composition || "—"}</td><td><ReasonList reasons={recommendation.reasonCodes} /></td><td><button className="vault-secondary-button" type="button" aria-expanded={expanded} onClick={toggleEvidence}>View size evidence</button></td><td><AddToDraftButton styleId={recommendation.styleId} parentProductId={recommendation.parentProductId} draftMatch={recommendation.draftMatch} /></td></tr>{expanded ? <tr><td colSpan={9}><div className="purchase-intelligence-table-wrap"><table><thead><tr><th>Size</th><th>Stock now</th><th>Incoming</th><th>Sold 7d</th><th>Sold 14d</th><th>Sold 30d</th><th>Target</th><th>Ideal need</th><th>Units/pack</th><th>Buying</th><th>Projected stock</th><th>Shortage</th><th>Excess</th></tr></thead><tbody>{recommendation.sizes.map((size) => <tr key={size.normalizedSize}><td>{size.normalizedSize}</td><td>{size.netAvailableStock ?? "—"}</td><td>{size.incomingStock ?? "—"}</td><td>{size.sales7DayUnits ?? "—"}</td><td>{size.sales14DayUnits ?? "—"}</td><td>{size.sales30DayUnits ?? "—"}</td><td>{size.targetStockUnits ?? "—"}</td><td>{size.idealSizeNeed ?? "—"}</td><td>{size.unitsPerPack ?? "—"}</td><td>{size.purchasedUnits ?? "—"}</td><td>{size.projectedStock ?? "—"}</td><td>{size.remainingShortage ?? "—"}</td><td>{size.projectedExcess ?? "—"}</td></tr>)}</tbody></table></div></td></tr> : null}</Fragment>;
      })}</tbody></table></div>}</section>
    <div className="purchase-intelligence-diagnostic-grid"><article className="purchase-intelligence-diagnostic"><header><div><span>Buy Nothing</span><h3>{buyNothing.length}</h3></div></header><p>Valid calculations with zero packs required.</p><ReasonList reasons={buyNothing.flatMap((result) => result.recommendation.reasonCodes)} /></article><article className="purchase-intelligence-diagnostic is-blocked"><header><div><span>Needs Attention</span><h3>{unavailable.length}</h3></div></header><ReasonList reasons={[...new Set(unavailable.flatMap((result) => result.reasons))]} /></article><article className="purchase-intelligence-diagnostic"><header><div><span>Do Not Restock</span><h3>{notApplicable.length}</h3></div></header><p>Valid calculations with zero packs required.</p><ReasonList reasons={[...new Set(notApplicable.flatMap((result) => result.reasons))]} /></article></div>
  </section>;
}
