import type { BrainSnapshot } from "./BrainSnapshot";

export type BrainMemoryChange = {
  key:
    | "catalogueCompletion"
    | "commercialTrust"
    | "supplierCoverage"
    | "lowStock"
    | "opportunities"
    | "confidence";

  label: string;
  previousValue: number;
  currentValue: number;
  difference: number;
  direction: "up" | "down" | "unchanged";
  isPositive: boolean;
};

export type BrainMemory = {
  previous: BrainSnapshot | null;
  current: BrainSnapshot;
  changes: BrainMemoryChange[];
};

function getDirection(
  difference: number,
): BrainMemoryChange["direction"] {
  if (difference > 0) {
    return "up";
  }

  if (difference < 0) {
    return "down";
  }

  return "unchanged";
}

function createChange({
  key,
  label,
  previousValue,
  currentValue,
  higherIsBetter = true,
}: {
  key: BrainMemoryChange["key"];
  label: string;
  previousValue: number;
  currentValue: number;
  higherIsBetter?: boolean;
}): BrainMemoryChange {
  const difference = currentValue - previousValue;

  return {
    key,
    label,
    previousValue,
    currentValue,
    difference,
    direction: getDirection(difference),
    isPositive:
      difference === 0
        ? true
        : higherIsBetter
          ? difference > 0
          : difference < 0,
  };
}

export const MemoryEngine = {
  create(
    current: BrainSnapshot,
    previous: BrainSnapshot | null = null,
  ): BrainMemory {
    if (!previous) {
      return {
        previous: null,
        current,
        changes: [],
      };
    }

    return {
      previous,
      current,
      changes: [
        createChange({
          key: "catalogueCompletion",
          label: "Catalogue completion",
          previousValue:
            previous.catalogueCompletion,
          currentValue:
            current.catalogueCompletion,
        }),

        createChange({
          key: "commercialTrust",
          label: "Commercial trust",
          previousValue:
            previous.commercialTrust,
          currentValue:
            current.commercialTrust,
        }),

        createChange({
          key: "supplierCoverage",
          label: "Supplier coverage",
          previousValue:
            previous.supplierCoverage,
          currentValue:
            current.supplierCoverage,
        }),

        createChange({
          key: "lowStock",
          label: "Low-stock exposure",
          previousValue: previous.lowStock,
          currentValue: current.lowStock,
          higherIsBetter: false,
        }),

        createChange({
          key: "opportunities",
          label: "Active opportunities",
          previousValue:
            previous.opportunities,
          currentValue:
            current.opportunities,
        }),

        createChange({
          key: "confidence",
          label: "Vault Brain confidence",
          previousValue:
            previous.confidence,
          currentValue:
            current.confidence,
        }),
      ],
    };
  },
};