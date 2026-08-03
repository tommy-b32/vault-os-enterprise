export const CASH_DIRECTIONS = ["money_in", "money_out"] as const;

export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export const CASH_CATEGORIES = {
  money_in: [
    "Shopify payout",
    "Customer payment",
    "Refund received",
    "Owner contribution",
    "Other income",
  ],
  money_out: [
    "Stock purchase",
    "Meta Ads",
    "Shipping",
    "Packaging",
    "Software",
    "Refund",
    "Operating expense",
    "Owner withdrawal",
    "Other expense",
  ],
} as const;

export function parsePositiveAmountToPence(value: string): number {
  const trimmed = value.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
    throw new Error("Enter a positive amount with no more than two decimal places.");
  }

  const [pounds, pennies = ""] = trimmed.split(".");
  const pence = Number.parseInt(pounds, 10) * 100 +
    Number.parseInt(pennies.padEnd(2, "0") || "0", 10);

  if (!Number.isSafeInteger(pence) || pence <= 0) {
    throw new Error("Amount must be greater than zero.");
  }

  return pence;
}

export function signedPence(
  direction: CashDirection,
  amountPence: number,
): number {
  if (!Number.isSafeInteger(amountPence) || amountPence <= 0) {
    throw new Error("Amount must be a positive number of pence.");
  }

  return direction === "money_in" ? amountPence : -amountPence;
}

export function purchasingPowerPence(
  businessCashPence: number,
  reservePence: number,
  commitmentsPence: number,
): number {
  return Math.max(
    businessCashPence - reservePence - commitmentsPence,
    0,
  );
}

export function poundsToPence(value: number | string): number {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error("The ledger contains an invalid amount.");
  }

  return Math.round(amount * 100);
}

export function penceToDatabaseAmount(pence: number): string {
  if (!Number.isSafeInteger(pence) || pence === 0) {
    throw new Error("A non-zero integer pence amount is required.");
  }

  return (pence / 100).toFixed(2);
}

export function cashLedgerExternalId(submissionId: string): string {
  return `cash-ledger-form:${submissionId}`;
}
