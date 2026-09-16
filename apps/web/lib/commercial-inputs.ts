const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORTED_CURRENCIES = new Set(["GBP", "EUR", "USD", "TRY"]);

function parseParentProductId(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    value.includes("::") ||
    !UUID_PATTERN.test(value.trim())
  ) {
    throw new Error("Select a valid parent product identifier before saving");
  }

  return value.trim();
}

export type ParsedCommercialInputs = {
  parentProductId: string;
  supplierId: string;
  currency: string;
  exchangeRateToGbp: number;
  packCost: number;
  unitsPerPack: number;
  shippingCostPerPack: number;
  importCostPerPack: number;
  lastSupplierPriceUpdate: string | null;
  profileId: string | null;
  costTypeId: string | null;
  inheritPackCost: boolean;
  inheritShippingCost: boolean;
  inheritImportCost: boolean;
  inheritUnitsPerPack: boolean;
  inheritFx: boolean;
};

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "true";
}

function optionalProfileId(value: FormDataEntryValue | null): string | null {
  if (value === null || value === "") return null;
  return parseSupplierId(value);
}

function optionalCostTypeId(value: FormDataEntryValue | null): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-z0-9_]+$/.test(value.trim())) throw new Error("Choose a governed canonical cost type");
  return value.trim();
}

function requiredPositiveNumber(
  value: FormDataEntryValue | null,
  label: string,
): number {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required`);
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be greater than zero`);
  }

  return parsed;
}

function optionalNonNegativeNumber(
  value: FormDataEntryValue | null,
  label: string,
): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} cannot be negative`);
  }

  return parsed;
}

function parseSupplierId(value: FormDataEntryValue | null): string {
  if (
    typeof value !== "string" ||
    value.includes("::") ||
    !UUID_PATTERN.test(value.trim())
  ) {
    throw new Error("An active supplier assignment is required");
  }

  return value.trim();
}

function parseSupplierDate(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const date = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Supplier price date is invalid");
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Supplier price date is invalid");
  }

  return date;
}

export function parseCommercialInputs(
  formData: FormData,
): ParsedCommercialInputs {
  const parentProductId = parseParentProductId(
    formData.get("parent_product_id"),
  );
  const supplierId = parseSupplierId(formData.get("supplier_id"));
  const rawCurrency = formData.get("currency");
  const currency =
    typeof rawCurrency === "string"
      ? rawCurrency.trim().toUpperCase()
      : "";

  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new Error("Select a supported supplier currency");
  }

  const exchangeRateToGbp =
    currency === "GBP"
      ? 1
      : requiredPositiveNumber(
          formData.get("exchange_rate_to_gbp"),
          "Exchange rate",
        );
  const unitsPerPack = requiredPositiveNumber(
    formData.get("units_per_pack"),
    "Units per pack",
  );

  if (!Number.isInteger(unitsPerPack)) {
    throw new Error("Units per pack must be a whole number");
  }

  return {
    parentProductId,
    supplierId,
    currency,
    exchangeRateToGbp,
    packCost: requiredPositiveNumber(
      formData.get("pack_cost"),
      "Pack cost",
    ),
    unitsPerPack,
    shippingCostPerPack: optionalNonNegativeNumber(
      formData.get("shipping_cost_per_pack"),
      "Shipping cost",
    ),
    importCostPerPack: optionalNonNegativeNumber(
      formData.get("import_cost_per_pack"),
      "Import cost",
    ),
    lastSupplierPriceUpdate: parseSupplierDate(
      formData.get("last_supplier_price_update"),
    ),
    profileId: optionalProfileId(formData.get("profile_id")),
    costTypeId: optionalCostTypeId(formData.get("cost_type_id")),
    inheritPackCost: checked(formData, "inherit_pack_cost"),
    inheritShippingCost: checked(formData, "inherit_shipping_cost"),
    inheritImportCost: checked(formData, "inherit_import_cost"),
    inheritUnitsPerPack: checked(formData, "inherit_units_per_pack"),
    inheritFx: checked(formData, "inherit_fx"),
  };
}
