import "server-only";

export type SemanticSample = { orderNumber: string; cost: string; costAndShip: string; postage: string; cardFee: string; salePrice: string; profit: string; payout: string; governedCogs: number | null; completedPayoutLinked: boolean | null };
const tolerance = .01;
const money = (value: string) => { const normalized = value.trim().replace(/[£,\s]/g, ""); return /^-?\d+(?:\.\d{1,2})?$/.test(normalized) ? Number(normalized) : null; };
const close = (left: number, right: number) => Math.abs(left - right) <= tolerance;
const examples = (samples: SemanticSample[], value: (sample: SemanticSample) => unknown) => samples.slice(0, 5).map(sample => ({ orderNumber: sample.orderNumber, value: value(sample) }));
type Hypothesis = { meaning: string; samples: SemanticSample[]; matches: number };
const confidence = (sampleCount: number, matches: number) => sampleCount ? matches / sampleCount : 0;
const status = (sampleCount: number, matches: number): "likely" | "unresolved" => sampleCount >= 20 && confidence(sampleCount, matches) >= .95 ? "likely" : "unresolved";
export type LandedCostSample={orderNumber:string;product:string;cost:string;costAndShip:string;goodsCost:number|null;inboundShipping:number|null;landedUnitCost:number|null};
export function analyzeCostAndShipLandedEvidence(samples:LandedCostSample[]){const eligible=samples.filter(s=>money(s.cost)!==null&&money(s.costAndShip)!==null);const governed=eligible.filter(s=>s.landedUnitCost!==null);const matches=governed.filter(s=>close(money(s.costAndShip)!,s.landedUnitCost!));const rate=confidence(governed.length,matches.length);const resultStatus: "proven"|"likely"|"unresolved"=governed.length>=20&&matches.length===governed.length?"proven":governed.length>=20&&rate>=.95?"likely":"unresolved";const deltas=eligible.map(s=>money(s.costAndShip)!-money(s.cost)!);return {status:resultStatus,inferredMeaning:"Cost & Ship equals governed sale-time landed unit cost",sampleCount:eligible.length,governedEvidenceSampleCount:governed.length,exactMatches:matches.length,toleranceMatches:matches.length,mismatches:governed.length-matches.length,matchRate:rate,deltaSummary:{count:deltas.length,min:deltas.length?Math.min(...deltas):null,max:deltas.length?Math.max(...deltas):null},groupedEvidence:[...new Map(governed.map(s=>[s.product,(governed.filter(x=>x.product===s.product))])).entries()].slice(0,20).map(([product,rows])=>({product,sampleCount:rows.length,matches:rows.filter(s=>close(money(s.costAndShip)!,s.landedUnitCost!)).length})),canonicalSourcesUsed:["vault_shopify_order_lines.unit_cogs_gbp","vault_shopify_order_lines.cogs_history_id"],examples:governed.slice(0,5).map(s=>({orderNumber:s.orderNumber,product:s.product,workbookCost:s.cost,workbookCostAndShip:s.costAndShip,workbookDelta:money(s.costAndShip)!-money(s.cost)!,governedGoodsCost:s.goodsCost,governedInboundShippingAllocation:s.inboundShipping,governedLandedUnitCost:s.landedUnitCost,matchResult:close(money(s.costAndShip)!,s.landedUnitCost!)})),safeForBackfill:resultStatus==="proven"};}

export function analyzeWorkbookSemantics(samples: SemanticSample[]) {
  const costHypotheses: Hypothesis[] = [
    { meaning: "Cost & Ship equals workbook Cost", samples: samples.filter(s => money(s.costAndShip) !== null && money(s.cost) !== null), matches: 0 },
    { meaning: "Cost & Ship equals governed sale-time COGS", samples: samples.filter(s => money(s.costAndShip) !== null && s.governedCogs !== null), matches: 0 },
    { meaning: "Cost & Ship equals workbook Cost plus Postage fee", samples: samples.filter(s => money(s.costAndShip) !== null && money(s.cost) !== null && money(s.postage) !== null), matches: 0 },
  ];
  costHypotheses[0].matches = costHypotheses[0].samples.filter(s => close(money(s.costAndShip)!, money(s.cost)!)).length;
  costHypotheses[1].matches = costHypotheses[1].samples.filter(s => close(money(s.costAndShip)!, s.governedCogs!)).length;
  costHypotheses[2].matches = costHypotheses[2].samples.filter(s => close(money(s.costAndShip)!, money(s.cost)! + money(s.postage)!)).length;
  const strongestCost = [...costHypotheses].sort((a, b) => confidence(b.samples.length, b.matches) - confidence(a.samples.length, a.matches))[0];
  const payoutValues = new Map<string, number>(); for (const sample of samples) payoutValues.set(sample.payout, (payoutValues.get(sample.payout) ?? 0) + 1);
  const nonBlankPayouts = samples.filter(s => s.payout.trim());
  const numericPayouts = nonBlankPayouts.filter(s => money(s.payout) !== null);
  const payoutType = !nonBlankPayouts.length ? "blank" : numericPayouts.length === nonBlankPayouts.length ? "numeric" : numericPayouts.length ? "mixed" : "text";
  const completeRows = samples.filter(s => s.payout.trim().toLowerCase() === "complete");
  const completedPayoutLinkedRows = completeRows.filter(s => s.completedPayoutLinked === true);
  const profitSamples = samples.filter(s => [s.salePrice, s.costAndShip, s.postage, s.cardFee, s.profit].every(value => money(value) !== null));
  const profitMatches = profitSamples.filter(s => close(money(s.profit)!, money(s.salePrice)! - money(s.costAndShip)! - money(s.postage)! - money(s.cardFee)!)).length;
  return {
    costAndShip: { status: status(strongestCost.samples.length, strongestCost.matches), inferredMeaning: strongestCost.meaning, confidence: confidence(strongestCost.samples.length, strongestCost.matches), sampleCount: strongestCost.samples.length, exactMatches: strongestCost.matches, toleranceMatches: strongestCost.matches, mismatches: strongestCost.samples.length - strongestCost.matches, examples: examples(strongestCost.samples, s => ({ cost: s.cost, costAndShip: s.costAndShip, governedCogs: s.governedCogs })) },
    payout: { status: completedPayoutLinkedRows.length >= 20 && completedPayoutLinkedRows.length === completeRows.length ? "likely" : "unresolved", inferredMeaning: "Complete requires a canonical order/transaction link to a completed Shopify payout", confidence: completeRows.length ? completedPayoutLinkedRows.length / completeRows.length : 0, distinctValues: [...payoutValues].map(([value, count]) => ({ value, count })), dataType: payoutType, sampleCount: completeRows.length, completedPayoutLinkedRows: completedPayoutLinkedRows.length, completedPayoutNotLinkedRows: completeRows.length - completedPayoutLinkedRows.length, canonicalSource: "No canonical order-to-completed-payout linkage is currently stored", safeForBackfill: false, examples: examples(completeRows, s => ({ payout: s.payout, completedPayoutLinked: s.completedPayoutLinked })) },
    profitRelationship: { status: status(profitSamples.length, profitMatches), formula: "Sale Price - Cost & Ship - Postage fee - Card Fee", sampleCount: profitSamples.length, matches: profitMatches, mismatches: profitSamples.length - profitMatches },
  };
}
