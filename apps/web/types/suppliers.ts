export type SupplierMoqScope =
  | "per_order"
  | "per_product";

export type SupplierStatus =
  | "active"
  | "paused"
  | "inactive";

export type SupplierProfile = {
  id: string;
  supplierName: string;

  status: SupplierStatus;

  currency: string;

  minimumOrderPacks: number | null;
  moqScope: SupplierMoqScope;

  leadTimeDays: number | null;

  shippingCostPerOrder: number | null;
  importCostPerOrder: number | null;

  paymentTerms: string | null;

  reliabilityScore: number | null;

  notes: string | null;
};

export type ProductSupplierSource = {
  id: string;

  productId: string;
  supplierId: string;

  supplierName: string;

  supplierReference: string | null;

  packCost: number | null;
  unitsPerPack: number | null;

  currency: string;

  leadTimeDays: number | null;

  isPreferred: boolean;
  isActive: boolean;

  notes: string | null;
};

export type ProductSupplierComparison = {
  productId: string;

  sources: ProductSupplierSource[];

  preferredSource:
    | ProductSupplierSource
    | null;

  cheapestSource:
    | ProductSupplierSource
    | null;

  fastestSource:
    | ProductSupplierSource
    | null;
};