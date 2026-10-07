import "server-only";

import { normalizeWorkbookOrderNumber } from "./WorkbookParser";

export type ProposalStatus = "proven" | "unresolved" | "not_applicable";
export type ProposalField<T> = { value: T | null; status: ProposalStatus; source: string };
export type BackfillProposalLineInput = {
  product: ProposalField<string>;
  salePrice: ProposalField<number>;
  cost: ProposalField<number>;
  costAndShip: ProposalField<number>;
  postageFee: ProposalField<number>;
  cardFee: ProposalField<number>;
  tracking: ProposalField<string>;
};
export type BackfillProposalOrderInput = {
  orderNumber: string;
  createdAt: string;
  refunded: boolean;
  cancelled: boolean;
  financiallyUnusual: boolean;
  fulfilmentStatus: string | null;
  lines: BackfillProposalLineInput[];
};
export type ProposedWorkbookRow = {
  product: ProposalField<string>;
  salePrice: ProposalField<number>;
  cost: ProposalField<number>;
  costAndShip: ProposalField<number>;
  postageFee: ProposalField<number>;
  cardFee: ProposalField<number>;
  profit: ProposalField<number>;
  posted: ProposalField<string>;
  tracking: ProposalField<string>;
  blankColumnJ: ProposalField<string>;
  dateOfSale: ProposalField<string>;
  orderNumber: ProposalField<string>;
};
export type BackfillProposalOrder = {
  orderNumber: string;
  classification: "ready" | "requires_review";
  issues: string[];
  proposedRows: ProposedWorkbookRow[];
};

const TARGET_FIRST = 1251;
const TARGET_LAST = 1329;
export const BACKFILL_TARGET_ORDER_RANGE = `${TARGET_FIRST}-${TARGET_LAST}`;
export const BACKFILL_TARGET_ORDER_COUNT = TARGET_LAST - TARGET_FIRST + 1;

const unresolved = <T>(source: string): ProposalField<T> => ({ value: null, status: "unresolved", source });
const proven = <T>(value: T, source: string): ProposalField<T> => ({ value, status: "proven", source });
const dateOfSale = (createdAt: string): ProposalField<string> => {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.valueOf())) return unresolved("canonical_shopify_order_created_at_invalid");
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "numeric", year: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value;
  const day = part("day"), month = part("month"), year = part("year");
  return day && month && year ? proven(`${Number(day)}/${Number(month)}/${year}`, "canonical_shopify_order_created_at_europe_london") : unresolved("canonical_shopify_order_created_at_invalid");
};

function inTargetRange(orderNumber: string) {
  const normalized = normalizeWorkbookOrderNumber(orderNumber);
  return normalized !== null && Number(normalized) >= TARGET_FIRST && Number(normalized) <= TARGET_LAST;
}

function profitFor(row: BackfillProposalLineInput): ProposalField<number> {
  const inputs = [row.salePrice, row.costAndShip, row.postageFee, row.cardFee];
  if (inputs.some(field => field.status !== "proven" || field.value === null)) return unresolved("profit_prerequisites_unresolved");
  // Cost & Ship is the workbook's all-in product-cost column; Cost is retained as a separate source field.
  return proven(row.salePrice.value! - row.costAndShip.value! - row.postageFee.value! - row.cardFee.value!, "derived_from_proven_sales_workbook_inputs");
}
function postedFor(status: string | null): ProposalField<string> { const value=String(status??"").trim().toLowerCase(); if(value==="fulfilled")return proven("Complete","canonical_shopify_fulfilment_status"); if(value==="unfulfilled")return proven("","canonical_shopify_fulfilment_status"); return unresolved("canonical_shopify_fulfilment_status_incomplete_or_unknown"); }

function proposalFor(order: BackfillProposalOrderInput): BackfillProposalOrder {
  const normalizedOrderNumber = normalizeWorkbookOrderNumber(order.orderNumber);
  const date = dateOfSale(order.createdAt);
  const orderNumber: ProposalField<string> = normalizedOrderNumber ? proven(normalizedOrderNumber, "canonical_shopify_order_number") : unresolved("canonical_shopify_order_number_invalid");
  const rows = order.lines.map(line => ({
    product: line.product,
    salePrice: line.salePrice,
    cost: line.cost,
    costAndShip: line.costAndShip,
    postageFee: line.postageFee,
    cardFee: line.cardFee,
    profit: profitFor(line),
    posted: postedFor(order.fulfilmentStatus),
    tracking: line.tracking,
    blankColumnJ: proven("", "managed_sales_workbook_layout_blank_column_j"),
    dateOfSale: date,
    orderNumber,
  }));
  const issues = new Set<string>();
  if (order.cancelled) issues.add("cancelled_order");
  if (order.refunded) issues.add("refunded_order");
  if (order.financiallyUnusual) issues.add("financially_unusual_order");
  if (!rows.length) issues.add("no_canonical_sale_lines");
  for (const row of rows) for (const [field, value] of Object.entries(row)) {
    if ((value as ProposalField<unknown>).status === "unresolved") issues.add(`${field}_unresolved`);
  }
  return { orderNumber: normalizedOrderNumber ?? order.orderNumber, classification: issues.size ? "requires_review" : "ready", issues: [...issues].sort(), proposedRows: rows };
}

export function buildBackfillProposal(orders: BackfillProposalOrderInput[]) {
  const proposals = orders.filter(order => inTargetRange(order.orderNumber)).map(proposalFor).sort((left, right) => Number(left.orderNumber) - Number(right.orderNumber));
  const unresolvedFieldCounts: Record<string, number> = {};
  for (const proposal of proposals) for (const row of proposal.proposedRows) for (const [field, value] of Object.entries(row)) {
    if ((value as ProposalField<unknown>).status === "unresolved") unresolvedFieldCounts[field] = (unresolvedFieldCounts[field] ?? 0) + 1;
  }
  return {
    targetOrderRange: BACKFILL_TARGET_ORDER_RANGE,
    targetOrderCount: BACKFILL_TARGET_ORDER_COUNT,
    proposalOrderCount: proposals.length,
    proposalRowCount: proposals.reduce((total, proposal) => total + proposal.proposedRows.length, 0),
    readyOrderCount: proposals.filter(proposal => proposal.classification === "ready").length,
    reviewOrderCount: proposals.filter(proposal => proposal.classification === "requires_review").length,
    unresolvedFieldCounts,
    proposals,
  };
}
