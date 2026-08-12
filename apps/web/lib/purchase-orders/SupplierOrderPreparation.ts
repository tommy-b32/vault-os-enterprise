export type SupplierOrderPreparationLine = {
  styleId?: string;
  productName: string;
  recommendedPacks: number;
  recommendedUnits: number | null;
  unitsPerPack: number | null;
  supplierImageUrl?: string | null;
  supplierImageSource?: string | null;
  supplierImageCapturedAt?: string | null;
};

export type PreparedSupplierOrderLine = SupplierOrderPreparationLine & {
  styleId: string;
  supplierImageUrl: string | null;
  supplierImageSource: string | null;
  supplierImageCapturedAt: string | null;
};

export type PreparedSupplierOrder = {
  supplierName: string;
  orderText: string;
  totalPacks: number;
  totalUnits: number | null;
  lines: PreparedSupplierOrderLine[];
};

export function readSupplierImageSnapshot(
  sourceSnapshot: unknown,
): Pick<
  PreparedSupplierOrderLine,
  "supplierImageUrl" | "supplierImageSource" | "supplierImageCapturedAt"
> {
  if (
    !sourceSnapshot ||
    typeof sourceSnapshot !== "object" ||
    Array.isArray(sourceSnapshot)
  ) {
    return {
      supplierImageUrl: null,
      supplierImageSource: null,
      supplierImageCapturedAt: null,
    };
  }

  const snapshot = sourceSnapshot as Record<string, unknown>;
  const imageUrl =
    typeof snapshot.supplierImageUrl === "string"
      ? snapshot.supplierImageUrl
      : null;
  const trustedUrl = imageUrl
    ? (() => {
        if (
          /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\r\n]+$/i.test(
            imageUrl,
          )
        ) {
          return imageUrl;
        }

        try {
          const url = new URL(imageUrl);
          return url.protocol === "https:" || url.protocol === "http:"
            ? url.toString()
            : null;
        } catch {
          return null;
        }
      })()
    : null;

  return {
    supplierImageUrl: trustedUrl,
    supplierImageSource:
      trustedUrl && typeof snapshot.supplierImageSource === "string"
        ? snapshot.supplierImageSource
        : null,
    supplierImageCapturedAt:
      trustedUrl && typeof snapshot.supplierImageCapturedAt === "string"
        ? snapshot.supplierImageCapturedAt
        : null,
  };
}

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
    lines: input.lines.map((line) => ({
      ...line,
      styleId: line.styleId ?? "",
      supplierImageUrl: line.supplierImageUrl ?? null,
      supplierImageSource: line.supplierImageSource ?? null,
      supplierImageCapturedAt: line.supplierImageCapturedAt ?? null,
    })),
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
