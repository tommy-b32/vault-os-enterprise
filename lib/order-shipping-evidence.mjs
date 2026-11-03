/**
 * Conservative shipping evidence decision for Sales Workbook eligibility.
 * Pure logic: no writes, no Shopify calls, no inferred costs.
 * Amounts are integer GBP pennies.
 */
export function resolveOrderShippingEvidence({ shopify, external }) {
  const validAmount = (value) => Number.isSafeInteger(value) && value >= 0;
  const verifiedShopify = shopify?.sourceState === "covered" &&
    shopify?.currency === "GBP" && validAmount(shopify?.amountPence) &&
    Number.isSafeInteger(shopify?.labelCount) && shopify.labelCount > 0;
  const verifiedExternal = external?.status === "approved" &&
    external?.currency === "GBP" && validAmount(external?.amountPence) &&
    external?.source === "manual_external";

  // Both records may describe the same shipment. Never silently sum or select one.
  if (verifiedShopify && verifiedExternal) {
    return { state: "conflict", amountPence: null, source: null };
  }
  if (verifiedShopify) {
    return { state: "covered", amountPence: shopify.amountPence, source: "shopify" };
  }
  if (verifiedExternal) {
    return { state: "covered", amountPence: external.amountPence, source: "manual_external" };
  }
  return { state: "pending", amountPence: null, source: null };
}

export function parseExternalPostagePence(input) {
  if (typeof input !== "string" || !/^(?:0|[1-9]\\d{0,7})(?:\\.\\d{1,2})?$/.test(input)) {
    throw new Error("Invalid GBP postage amount");
  }
  const [pounds, fraction = ""] = input.split(".");
  const pennies = Number(pounds) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(pennies)) throw new Error("Invalid GBP postage amount");
  return pennies;
}
