export type MomentumConfidence = "low" | "medium" | "high";
export type MomentumOrder = { shopify_created_at: string };
export type MomentumLine = { order_id: string; title: string; quantity: number; refunded_quantity: number; net_line_revenue: number | string };
export type ProductMomentumRecommendation = {
  title: string; currentUnits: number; previousUnits: number; currentRevenue: number; previousRevenue: number;
  unitChange: number | null; direction: "up" | "down" | "flat" | "new"; confidence: MomentumConfidence;
  status: "accelerating" | "emerging" | "stable" | "cooling" | "insufficient_data"; evidence: string; recommendedAction: string;
};

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const amount = (value: number | string) => Number.isFinite(Number(value)) ? Number(value) : 0;
const percentageChange = (current: number, previous: number) => previous <= 0 ? current > 0 ? null : 0 : round((current - previous) / previous, 4);
const merchandise = (title: string) => !/vault\s*care|return\s*protection/i.test(title);
const confidence = (current: number, previous: number): MomentumConfidence => current + previous >= 24 && Math.min(current, previous) >= 6 ? "high" : current + previous >= 12 && Math.min(current, previous) >= 3 ? "medium" : "low";

function recommend(currentUnits: number, previousUnits: number, currentRevenue: number, previousRevenue: number, unitChange: number | null): Pick<ProductMomentumRecommendation, "status" | "confidence" | "evidence" | "recommendedAction"> {
  const sampleConfidence = confidence(currentUnits, previousUnits);
  const evidence = `Net units: ${currentUnits} vs ${previousUnits}; net revenue: £${currentRevenue.toFixed(2)} vs £${previousRevenue.toFixed(2)}.`;
  if (previousUnits === 0 && currentUnits > 0) return { status: "emerging", confidence: currentUnits >= 12 ? "medium" : "low", evidence: `${evidence} New demand has no prior 14-day unit baseline.`, recommendedAction: "Monitor another 7–14 days before increasing purchasing." };
  if (currentUnits + previousUnits < 6 || sampleConfidence === "low") return { status: "insufficient_data", confidence: sampleConfidence, evidence: `${evidence} Too few net units across both periods for a reliable decision.`, recommendedAction: "Monitor another 7–14 days before increasing purchasing." };
  if (unitChange !== null && unitChange >= .25) return { status: "accelerating", confidence: sampleConfidence, evidence: `${evidence} Net-unit demand is up ${round(unitChange * 100, 0)}% period over period.`, recommendedAction: "Protect stock / consider increasing reorder quantity. Consider prioritising this product for promotion; Meta spend remains locked." };
  if (unitChange !== null && unitChange <= -.25) return { status: "cooling", confidence: sampleConfidence, evidence: `${evidence} Net-unit demand is down ${round(Math.abs(unitChange) * 100, 0)}% period over period.`, recommendedAction: "Review declining demand before reordering." };
  return { status: "stable", confidence: sampleConfidence, evidence: `${evidence} Net-unit demand is broadly unchanged period over period.`, recommendedAction: "Maintain current stock level." };
}

export function buildProductMomentum(lines: MomentumLine[], orderById: Map<string, MomentumOrder>, now: Date): ProductMomentumRecommendation[] {
  const currentStart = now.getTime() - 14 * 86400000, previousStart = now.getTime() - 28 * 86400000;
  const products = new Map<string, { currentUnits: number; previousUnits: number; currentRevenue: number; previousRevenue: number }>();
  for (const line of lines) {
    if (!merchandise(line.title)) continue;
    const order = orderById.get(line.order_id); if (!order) continue;
    const time = new Date(order.shopify_created_at).getTime(); if (time < previousStart || time > now.getTime()) continue;
    const product = products.get(line.title) ?? { currentUnits: 0, previousUnits: 0, currentRevenue: 0, previousRevenue: 0 };
    const units = Math.max(0, Number(line.quantity ?? 0) - Number(line.refunded_quantity ?? 0));
    if (time >= currentStart) { product.currentUnits += units; product.currentRevenue += amount(line.net_line_revenue); } else { product.previousUnits += units; product.previousRevenue += amount(line.net_line_revenue); }
    products.set(line.title, product);
  }
  return [...products.entries()].map(([title, value]) => {
    const unitChange = percentageChange(value.currentUnits, value.previousUnits);
    const direction: ProductMomentumRecommendation["direction"] = value.previousUnits === 0 && value.currentUnits > 0 ? "new" : unitChange !== null && unitChange >= .2 ? "up" : unitChange !== null && unitChange <= -.2 ? "down" : "flat";
    const currentRevenue = round(value.currentRevenue), previousRevenue = round(value.previousRevenue);
    return { title, ...value, currentRevenue, previousRevenue, unitChange, direction, ...recommend(value.currentUnits, value.previousUnits, currentRevenue, previousRevenue, unitChange) };
  }).filter((item) => item.currentUnits + item.previousUnits >= 3).sort((a, b) => Math.abs(b.unitChange ?? (b.direction === "new" ? 1 : 0)) * (b.currentUnits + b.previousUnits) - Math.abs(a.unitChange ?? (a.direction === "new" ? 1 : 0)) * (a.currentUnits + a.previousUnits)).slice(0, 8);
}
