import type { ModelSizeReplenishmentEvidence } from "@/lib/model-size-replenishment-evidence";
import type { TradingEvidenceState } from "@/lib/brain/TradingEvidencePolicy";

export type SizeDemandEvidence = {
  canonicalStyleId: string;
  parentProductId: string;
  modelDesign: string;
  tradingEvidenceMaturity: TradingEvidenceState | null;
  sizeEvidenceAvailable: boolean;
  sizeEvidenceUnavailableReason: string | null;
  totalSizeAttributableUnits: number | null;
  sizes: Array<{
    canonicalSize: string;
    availableQuantity: number;
    attributableObservedUnits: number | null;
    observedDemandShare: number | null;
    currentlyServiceable: boolean;
  }>;
  demandServiceableShare: number | null;
  demandExposedShare: number | null;
  unavailableDemandedSizes: string[];
};

function unavailableReason(rows: ModelSizeReplenishmentEvidence[]): string | null {
  if (!rows.length) return "No canonical size evidence is available.";
  if (rows.some((row) => !row.normalized_size.trim())) return "Canonical size identity is unavailable.";
  if (new Set(rows.map((row) => row.normalized_size)).size !== rows.length) return "Canonical size identity is ambiguous.";
  const untrusted = rows.find((row) => !row.trusted || row.sales_30_day_units === null);
  if (untrusted) return untrusted.missing_requirements[0] ?? "Size-attributable observed demand is unavailable.";
  return null;
}

/** Read-only projection of canonical model-size inventory and attributable observed sales. */
export function projectSizeDemandEvidence(
  rows: ModelSizeReplenishmentEvidence[],
  tradingEvidenceByStyle: ReadonlyMap<string, TradingEvidenceState> = new Map(),
): SizeDemandEvidence[] {
  const grouped = new Map<string, ModelSizeReplenishmentEvidence[]>();
  for (const row of rows) grouped.set(row.style_id, [...(grouped.get(row.style_id) ?? []), row]);
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([canonicalStyleId, styleRows]) => {
    const reason = unavailableReason(styleRows);
    const available = reason === null;
    const total = available
      ? styleRows.reduce((sum, row) => sum + (row.sales_30_day_units ?? 0), 0)
      : null;
    const sizes = [...styleRows].sort((left, right) => left.normalized_size.localeCompare(right.normalized_size)).map((row) => {
      const units = available ? row.sales_30_day_units : null;
      return {
        canonicalSize: row.normalized_size,
        availableQuantity: row.available_stock,
        attributableObservedUnits: units,
        observedDemandShare: total && total > 0 && units !== null ? units / total : null,
        currentlyServiceable: row.available_stock > 0,
      };
    });
    const serviceableUnits = total && total > 0 ? sizes.filter((size) => size.currentlyServiceable).reduce((sum, size) => sum + (size.attributableObservedUnits ?? 0), 0) : null;
    return {
      canonicalStyleId,
      parentProductId: styleRows[0].parent_product_id,
      modelDesign: styleRows[0].model_design,
      tradingEvidenceMaturity: tradingEvidenceByStyle.get(canonicalStyleId) ?? null,
      sizeEvidenceAvailable: available,
      sizeEvidenceUnavailableReason: reason,
      totalSizeAttributableUnits: total,
      sizes,
      demandServiceableShare: serviceableUnits === null || total === null ? null : serviceableUnits / total,
      demandExposedShare: serviceableUnits === null || total === null ? null : (total - serviceableUnits) / total,
      unavailableDemandedSizes: sizes
        .filter((size) => (size.attributableObservedUnits ?? 0) > 0 && !size.currentlyServiceable)
        .map((size) => size.canonicalSize),
    };
  });
}
