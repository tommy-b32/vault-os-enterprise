import type { CatalogueProduct } from "@/types/catalogue";

export function remediationInitialTab(attention: string | null): "business" | "commercial" {
  return attention === "invalid_or_missing_commercial_cost" ? "commercial" : "business";
}

export function getWorkspaceProducts(
  products: CatalogueProduct[],
  attention: string | null,
  affectedParentProductIds: string[],
): CatalogueProduct[] {
  return attention
    ? products.filter((product) => affectedParentProductIds.includes(product.parent_product_id))
    : products;
}

export function filterWorkspaceProducts(
  products: CatalogueProduct[],
  search: string,
): CatalogueProduct[] {
  const query = search.trim().toLowerCase();
  if (!query) return products;

  return products.filter((product) => [
    product.product_name,
    product.supplier_company,
    product.inventory_strategy,
    product.pack_profile,
    product.status,
  ].filter(Boolean).join(" ").toLowerCase().includes(query));
}

export function selectedWorkspaceProduct(
  products: CatalogueProduct[],
  selectedStyleId: string | null,
): CatalogueProduct | null {
  return products.find((product) => product.style_id === selectedStyleId) ?? products[0] ?? null;
}
