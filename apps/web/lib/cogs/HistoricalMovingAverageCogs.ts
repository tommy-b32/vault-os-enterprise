/**
 * Pure, deterministic historical weighted-average COGS calculation.
 *
 * Callers must supply already-authorised canonical evidence. This module has
 * no database, network, or clock dependencies.
 */
export type HistoricalReceiptInput = Readonly<{ id: string; receivedDate: string; quantity: number; landedGbp: string | number }>;
export type HistoricalSaleLineInput = Readonly<{ id: string; saleTimestamp: string; quantity: number; mapped: boolean; refundedQuantity?: number; orderRefundsGbp?: string | number; existingPolicyCogsGbp?: string | number | null }>;
export type HistoricalRefundDispositionInput = Readonly<{ disposition: "retained_sale" | "returned_restocked"; refundObservationIds?: readonly string[]; shopifyRefundEvidence?: string; ownerRestockEvidence?: string }>;
export type HistoricalMovingAverageInput = Readonly<{ receipts: readonly HistoricalReceiptInput[]; sales: readonly HistoricalSaleLineInput[]; refundDispositions?: Readonly<Record<string, HistoricalRefundDispositionInput>> }>;
export type HistoricalCalculationFlag = "SAME_DAY_RECEIPT_ORDER_AMBIGUOUS" | "MISSING_PRODUCT_MAPPING" | "NON_POSITIVE_NET_SALE_QUANTITY" | "UNVERIFIED_RETURN_OR_ADJUSTMENT" | "INSUFFICIENT_STOCK";

type Fraction = Readonly<{ n: bigint; d: bigint }>;
type Balance = Readonly<{ units: number; landedGbp: string }>;
export type HistoricalCalculationLine = Readonly<{ id: string; status: "CALCULATED" | "CALCULATED_WITH_WARNING" | "EXCLUDED_RETURNED_RESTOCKED" | "UNRESOLVED"; flags: readonly HistoricalCalculationFlag[]; simulatedCogsGbp: string | null; existingPolicyCogsGbp: string | number | null; returnDisposition: "retained_sale" | "returned_restocked" | null; stockBefore: Balance; stockAfter: Balance; receiptEvidence: readonly string[] }>;
export type HistoricalMovingAverageResult = Readonly<{ eligibilityRule: "date_only_receipts_eligible_following_europe_london_calendar_day_v1"; receiptCount: number; saleLineCount: number; calculatedLineCount: number; returnedRestockedLineCount: number; comparedLineCount: number; unresolvedLineCount: number; simulatedCogsGbp: string; existingPolicyCogsGbp: string; varianceGbp: string; closingInventoryUnits: number; closingInventoryLandedGbp: string; flagCounts: Readonly<Partial<Record<HistoricalCalculationFlag, number>>>; exceptions: readonly Readonly<{ id: string; flags: readonly HistoricalCalculationFlag[] }>[]; lines: readonly HistoricalCalculationLine[] }>;

const ZERO = BigInt(0), ONE = BigInt(1), HUNDRED = BigInt(100);
const DECIMAL = /^-?\d+(?:\.\d+)?$/, GBP_CENTS = /^\d+(?:\.\d{1,2})?$/, ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const londonDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });

function identity(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label} identity`); }
function gcd(a: bigint, b: bigint): bigint { a = a < ZERO ? -a : a; b = b < ZERO ? -b : b; while (b !== ZERO) [a, b] = [b, a % b]; return a; }
function fraction(n: bigint, d: bigint = ONE): Fraction { if (d === ZERO) throw new Error("Zero denominator"); if (d < ZERO) [n, d] = [-n, -d]; const g = gcd(n, d); return { n: n / g, d: d / g }; }
function add(a: Fraction, b: Fraction): Fraction { return fraction(a.n * b.d + b.n * a.d, a.d * b.d); }
function subtract(a: Fraction, b: Fraction): Fraction { return fraction(a.n * b.d - b.n * a.d, a.d * b.d); }
function multiply(a: Fraction, b: Fraction): Fraction { return fraction(a.n * b.n, a.d * b.d); }
function decimal(value: Fraction, places = 6): string { const negative = value.n < ZERO; const n = negative ? -value.n : value.n; const integer = n / value.d; let remainder = n % value.d, out = ""; for (let i = 0; i < places; i += 1) { remainder *= BigInt(10); out += String(remainder / value.d); remainder %= value.d; } return `${negative ? "-" : ""}${integer}.${out}`; }
function gbp(value: Fraction): string { return decimal(fraction(value.n, value.d * HUNDRED)); }
function exactGbp(value: string | number): Fraction { const source = String(value); if (!DECIMAL.test(source)) throw new Error(`Invalid GBP amount: ${value}`); const negative = source.startsWith("-"); const [whole, decimals = ""] = (negative ? source.slice(1) : source).split("."); return fraction(BigInt(`${whole}${decimals}`) * (negative ? -ONE : ONE), BigInt(10) ** BigInt(decimals.length)); }
function landedPence(value: string | number): bigint { const source = String(value); if (!GBP_CENTS.test(source)) throw new Error(`Invalid landed GBP amount: ${value}`); const [whole, decimals = ""] = source.split("."); return BigInt(whole) * HUNDRED + BigInt((decimals + "00").slice(0, 2)); }

export function europeLondonDate(timestamp: string): string { const instant = new Date(timestamp); if (Number.isNaN(instant.getTime())) throw new Error(`Invalid sale timestamp: ${timestamp}`); const parts = Object.fromEntries(londonDateFormatter.formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`; }
function nextDate(date: string): string { if (!ISO_DATE.test(date)) throw new Error("Invalid receipt received date"); const [year, month, day] = date.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10); }
function unique(items: readonly { id: string }[], label: string): void { const ids = new Set<string>(); for (const item of items) { identity(item.id, label); if (ids.has(item.id)) throw new Error(`Duplicate ${label} identity: ${item.id}`); ids.add(item.id); } }
function retained(disposition: HistoricalRefundDispositionInput | undefined): boolean { return disposition?.disposition === "retained_sale" && ((disposition.refundObservationIds?.length ?? 0) > 0 || (typeof disposition.shopifyRefundEvidence === "string" && typeof disposition.ownerRestockEvidence === "string")); }
function returned(disposition: HistoricalRefundDispositionInput | undefined): boolean { return disposition?.disposition === "returned_restocked" && ((disposition.refundObservationIds?.length ?? 0) > 0 || typeof disposition.shopifyRefundEvidence === "string"); }

/** Date-only receipts become eligible on the following Europe/London day. */
export function calculateHistoricalMovingAverageCogs(input: HistoricalMovingAverageInput): HistoricalMovingAverageResult {
  unique(input.receipts, "receipt"); unique(input.sales, "sale line");
  const saleIds = new Set(input.sales.map((sale) => sale.id));
  for (const sale of input.sales) {
    if (!Number.isSafeInteger(sale.quantity)) throw new Error(`Invalid sale quantity for ${sale.id}`);
    if (sale.refundedQuantity !== undefined && (!Number.isSafeInteger(sale.refundedQuantity) || sale.refundedQuantity < 0)) throw new Error(`Invalid refunded quantity for ${sale.id}`);
  }
  for (const [saleId, disposition] of Object.entries(input.refundDispositions ?? {})) {
    if (!saleIds.has(saleId)) throw new Error(`Refund disposition references unknown sale line: ${saleId}`);
    const observationIds = disposition.refundObservationIds ?? [];
    if (new Set(observationIds).size !== observationIds.length || observationIds.some((id) => typeof id !== "string" || !id.trim())) throw new Error(`Invalid refund observation identities for ${saleId}`);
  }
  const receiptsByEligibleDay = new Map<string, Array<HistoricalReceiptInput & { pence: bigint }>>();
  const originalReceiptDays = new Set<string>();
  for (const receipt of input.receipts) {
    if (!ISO_DATE.test(receipt.receivedDate) || !Number.isSafeInteger(receipt.quantity) || receipt.quantity <= 0) throw new Error("Invalid receipt evidence");
    const eligible = nextDate(receipt.receivedDate); originalReceiptDays.add(receipt.receivedDate);
    receiptsByEligibleDay.set(eligible, [...(receiptsByEligibleDay.get(eligible) ?? []), { ...receipt, pence: landedPence(receipt.landedGbp) }]);
  }
  const salesByDay = new Map<string, HistoricalSaleLineInput[]>();
  for (const sale of input.sales) { const day = europeLondonDate(sale.saleTimestamp); salesByDay.set(day, [...(salesByDay.get(day) ?? []), sale]); }
  const days = [...new Set([...receiptsByEligibleDay.keys(), ...salesByDay.keys()])].sort();
  let units = ZERO, value = fraction(ZERO), simulated = fraction(ZERO);
  const appliedReceiptIds: string[] = [], lines: HistoricalCalculationLine[] = [], exceptions: Array<{ id: string; flags: HistoricalCalculationFlag[] }> = [];
  for (const day of days) {
    for (const receipt of (receiptsByEligibleDay.get(day) ?? []).sort((a, b) => a.id.localeCompare(b.id))) { value = add(value, fraction(receipt.pence)); units += BigInt(receipt.quantity); appliedReceiptIds.push(receipt.id); }
    for (const sale of (salesByDay.get(day) ?? []).sort((a, b) => a.saleTimestamp.localeCompare(b.saleTimestamp) || a.id.localeCompare(b.id))) {
      const flags: HistoricalCalculationFlag[] = [], disposition = input.refundDispositions?.[sale.id];
      const isRetained = retained(disposition), isReturned = returned(disposition);
      const refundedQuantity = sale.refundedQuantity ?? null;
      if (isRetained && (refundedQuantity ?? 0) > 0) throw new Error(`Retained-sale disposition contradicts refunded quantity for ${sale.id}`);
      if (isReturned && (refundedQuantity === null || !Number.isSafeInteger(refundedQuantity) || refundedQuantity <= 0)) throw new Error(`Returned-restocked disposition lacks verified refunded quantity for ${sale.id}`);
      if (!sale.mapped) flags.push("MISSING_PRODUCT_MAPPING");
      if ((!Number.isSafeInteger(sale.quantity) || sale.quantity <= 0) && !isReturned) flags.push("NON_POSITIVE_NET_SALE_QUANTITY");
      if (((refundedQuantity ?? 0) > 0 || Number(sale.orderRefundsGbp ?? 0) > 0) && !isRetained && !isReturned) flags.push("UNVERIFIED_RETURN_OR_ADJUSTMENT");
      if (originalReceiptDays.has(day)) flags.push("SAME_DAY_RECEIPT_ORDER_AMBIGUOUS");
      const before: Balance = { units: Number(units), landedGbp: gbp(value) }, existingPolicyCogsGbp = sale.existingPolicyCogsGbp ?? null, receiptEvidence = [...appliedReceiptIds];
      if (isReturned) { lines.push({ id: sale.id, status: "EXCLUDED_RETURNED_RESTOCKED", flags, simulatedCogsGbp: null, existingPolicyCogsGbp, returnDisposition: "returned_restocked", stockBefore: before, stockAfter: before, receiptEvidence }); continue; }
      const quantity = BigInt(Number.isSafeInteger(sale.quantity) && sale.quantity > 0 ? sale.quantity : 0);
      if (flags.some((flag) => flag === "MISSING_PRODUCT_MAPPING" || flag === "NON_POSITIVE_NET_SALE_QUANTITY" || flag === "UNVERIFIED_RETURN_OR_ADJUSTMENT")) { lines.push({ id: sale.id, status: "UNRESOLVED", flags, simulatedCogsGbp: null, existingPolicyCogsGbp, returnDisposition: null, stockBefore: before, stockAfter: before, receiptEvidence }); exceptions.push({ id: sale.id, flags }); continue; }
      if (quantity > units) { flags.push("INSUFFICIENT_STOCK"); lines.push({ id: sale.id, status: "UNRESOLVED", flags, simulatedCogsGbp: null, existingPolicyCogsGbp, returnDisposition: null, stockBefore: before, stockAfter: before, receiptEvidence }); exceptions.push({ id: sale.id, flags }); continue; }
      const cost = multiply(value, fraction(quantity, units)); value = subtract(value, cost); units -= quantity; simulated = add(simulated, cost);
      lines.push({ id: sale.id, status: flags.length ? "CALCULATED_WITH_WARNING" : "CALCULATED", flags, simulatedCogsGbp: gbp(cost), existingPolicyCogsGbp, returnDisposition: isRetained ? "retained_sale" : null, stockBefore: before, stockAfter: { units: Number(units), landedGbp: gbp(value) }, receiptEvidence });
    }
  }
  const comparable = lines.filter((line) => line.status.startsWith("CALCULATED") && line.existingPolicyCogsGbp !== null);
  const existing = comparable.reduce((total, line) => add(total, exactGbp(line.existingPolicyCogsGbp as string | number)), fraction(ZERO));
  const flagCounts: Partial<Record<HistoricalCalculationFlag, number>> = {};
  for (const line of lines) for (const flag of line.flags) flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
  return { eligibilityRule: "date_only_receipts_eligible_following_europe_london_calendar_day_v1", receiptCount: input.receipts.length, saleLineCount: input.sales.length, calculatedLineCount: lines.filter((line) => line.status.startsWith("CALCULATED")).length, returnedRestockedLineCount: lines.filter((line) => line.status === "EXCLUDED_RETURNED_RESTOCKED").length, comparedLineCount: comparable.length, unresolvedLineCount: lines.filter((line) => line.status === "UNRESOLVED").length, simulatedCogsGbp: gbp(simulated), existingPolicyCogsGbp: decimal(existing), varianceGbp: decimal(subtract(fraction(simulated.n, simulated.d * HUNDRED), existing)), closingInventoryUnits: Number(units), closingInventoryLandedGbp: gbp(value), flagCounts, exceptions, lines };
}

/** JSON-safe, stable-key-order output for callers that SHA-256 hash a result. */
export function canonicalHistoricalMovingAverageOutput(result: HistoricalMovingAverageResult): string { return JSON.stringify(result); }
