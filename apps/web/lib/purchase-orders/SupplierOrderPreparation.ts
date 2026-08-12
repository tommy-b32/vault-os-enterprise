export type SupplierOrderPreparationLine = {
  productName: string;
  recommendedPacks: number;
  recommendedUnits: number | null;
  unitsPerPack: number | null;
};

export type PreparedSupplierOrder = {
  supplierName: string;
  orderText: string;
  totalPacks: number;
  totalUnits: number | null;
};

export function createSupplierOrderText(input: {
  supplierName: string;
  lines: SupplierOrderPreparationLine[];
}): PreparedSupplierOrder {
  if (!input.supplierName.trim()) {
    throw new Error("Supplier identity is unavailable.");
  }

  if (input.lines.length === 0) {
    throw new Error("The approved purchase order has no persisted lines.");
  }

  const totalPacks = input.lines.reduce(
    (total, line) => total + line.recommendedPacks,
    0,
  );
  const unitsAvailable = input.lines.every(
    (line) => line.recommendedUnits !== null,
  );
  const totalUnits = unitsAvailable
    ? input.lines.reduce(
        (total, line) => total + (line.recommendedUnits ?? 0),
        0,
      )
    : null;

  const itemText = input.lines
    .map((line, index) => {
      const packs = `${line.recommendedPacks} ${
        line.recommendedPacks === 1 ? "pack" : "packs"
      }`;
      const units =
        line.recommendedUnits === null
          ? "units unavailable"
          : `${line.recommendedUnits} ${
              line.recommendedUnits === 1 ? "unit" : "units"
            }`;
      const packSize =
        line.unitsPerPack === null
          ? ""
          : ` (${line.unitsPerPack} per pack)`;

      return `${index + 1}. ${line.productName}\n   ${packs} / ${units}${packSize}`;
    })
    .join("\n\n");

  return {
    supplierName: input.supplierName,
    totalPacks,
    totalUnits,
    orderText: [
      "Purchase Order",
      `Supplier: ${input.supplierName}`,
      "",
      "Please supply:",
      "",
      itemText,
      "",
      `Total packs: ${totalPacks}`,
      `Total units: ${totalUnits ?? "Unavailable"}`,
    ].join("\n"),
  };
}
