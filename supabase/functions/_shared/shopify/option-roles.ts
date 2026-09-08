export type ShopifySelectedOption = { name: string; value: string };

export type ShopifyOptionIdentity = {
  optionNames: [string | null, string | null, string | null];
  modelDesign: string | null;
  normalizedSize: string | null;
  resolution: "resolved" | "unresolved";
};

const SIZE_VALUES: Record<string, string> = {
  S: "S", SMALL: "S", M: "M", MEDIUM: "M", L: "L", LARGE: "L",
  XL: "XL", "X-LARGE": "XL", "EXTRA LARGE": "XL", XXL: "2XL", "2XL": "2XL", "2X": "2XL",
  XXXL: "3XL", "3XL": "3XL", "3X": "3XL",
};

export function normalizeShopifySize(value: string | null | undefined): string | null {
  const key = value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
  return SIZE_VALUES[key] ?? null;
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveShopifyOptionIdentity(options: ShopifySelectedOption[]): ShopifyOptionIdentity {
  const optionNames = [0, 1, 2].map((index) => options[index]?.name?.trim() || null) as ShopifyOptionIdentity["optionNames"];
  const models = options.filter((option) => /^(model|design|style|color|colour)$/.test(normalizedName(option.name)));
  const sizes = options.filter((option) => /^size(?:\b| )/.test(normalizedName(option.name)));
  const sizeOnly = options.length === 1 && models.length === 0 && sizes.length === 1;
  const modelDesign = models.length === 1 ? models[0].value.trim() || null : sizeOnly ? "Default" : null;
  const normalizedSize = sizes.length === 1 ? normalizeShopifySize(sizes[0].value) : null;
  return { optionNames, modelDesign, normalizedSize, resolution: modelDesign && normalizedSize ? "resolved" : "unresolved" };
}
