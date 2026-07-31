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

export type SupplierCatalogueVision = {
  garmentType: string | null;

  secondaryColours: string[];

  chestLogo: string | null;
  frontGraphic: string | null;
  backGraphic: string | null;
  sleeveDetail: string | null;
  neckLabel: string | null;

  fit: string | null;
  collection: string | null;

  visualFingerprint: string[];
  rawVisibleText: string[];

  confidence: number;
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

  vision: SupplierCatalogueVision;

  notes: string | null;
};