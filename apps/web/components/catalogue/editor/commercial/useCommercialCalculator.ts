import { useMemo } from "react";

type UseCommercialCalculatorArgs = {
  currency: string;
  exchangeRateToGbp: string;
  packCost: string;
  shippingCost: string;
  importCost: string;
  averageSellingPrice: string;
  unitsPerPack: number | null;
};

export type CommercialCalculations = {
  landedSupplierCurrency: number;
  landedGbp: number;
  costPerUnit: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
  returnOnCapital: number | null;
};

function toNumber(
  value: string,
  fallback = 0,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

export function useCommercialCalculator({
  currency,
  exchangeRateToGbp,
  packCost,
  shippingCost,
  importCost,
  averageSellingPrice,
  unitsPerPack,
}: UseCommercialCalculatorArgs): CommercialCalculations {
  return useMemo(() => {
    const pack = toNumber(packCost);
    const shipping = toNumber(shippingCost);
    const imports = toNumber(importCost);

    const exchangeRate =
      currency === "GBP"
        ? 1
        : toNumber(exchangeRateToGbp, 1);

    const sellingPrice =
      toNumber(averageSellingPrice);

    const landedSupplierCurrency =
      pack + shipping + imports;

    const landedGbp =
      landedSupplierCurrency * exchangeRate;

    const costPerUnit =
      unitsPerPack !== null &&
      unitsPerPack > 0
        ? landedGbp / unitsPerPack
        : null;

    const grossProfit =
      costPerUnit !== null &&
      sellingPrice > 0
        ? sellingPrice - costPerUnit
        : null;

    const marginPercent =
      grossProfit !== null &&
      sellingPrice > 0
        ? (grossProfit / sellingPrice) * 100
        : null;

    const returnOnCapital =
      grossProfit !== null &&
      costPerUnit !== null &&
      costPerUnit > 0
        ? (grossProfit / costPerUnit) * 100
        : null;

    return {
      landedSupplierCurrency,
      landedGbp,
      costPerUnit,
      grossProfit,
      marginPercent,
      returnOnCapital,
    };
  }, [
    averageSellingPrice,
    currency,
    exchangeRateToGbp,
    importCost,
    packCost,
    shippingCost,
    unitsPerPack,
  ]);
}