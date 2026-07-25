export type SupplierCatalogueCardStatus =
  | "new"
  | "linked"
  | "unlinked"
  | "review"
  | "archived";

export type SupplierCatalogueImage = {
  id: string;
  url: string;
  alt: string;
  role:
    | "official"
    | "supplier"
    | "detail"
    | "label"
    | "back"
    | "other";
};

export type SupplierCatalogueCardData = {
  id: string;

  supplierId: string;
  supplierName: string;

  catalogueId: string;
  catalogueName: string;

  pageNumber: number | null;

  brand: string | null;
  officialProductName: string | null;
  internalReference: string | null;

  colour: string | null;

  packCost: number | null;
  packSize: number | null;
  currency: string;

  leadTimeDays: number | null;

  status: SupplierCatalogueCardStatus;

  linkedProductId: string | null;
  linkedProductName: string | null;

  isPreferredSource: boolean;

  images: SupplierCatalogueImage[];

  notes: string | null;
};