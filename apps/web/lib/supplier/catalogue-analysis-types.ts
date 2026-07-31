import type {
  CataloguePageExtraction,
} from "@/lib/ai/extractCataloguePage";

export type CataloguePageAnalysisStatus =
  | "pending"
  | "analysing"
  | "complete"
  | "failed"
  | "skipped";

export type CataloguePageAnalysisRecord = {
  pageNumber: number;
  status: CataloguePageAnalysisStatus;

  extraction: CataloguePageExtraction | null;

  error: string | null;

  attempts: number;

  analysedAt: string | null;
};

export type CatalogueProductGroupStatus =
  | "draft"
  | "confirmed"
  | "requires-review";

export type CatalogueProductGroup = {
  id: string;

  startPage: number;
  endPage: number;
  pageNumbers: number[];

  brand: string | null;
  productName: string | null;
  productType: string | null;
  garmentType: string | null;

  colour: string | null;
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

  displayedPrice: number | null;
  currency: string | null;

  supplierSku: string | null;
  sizes: string[];
  packQuantity: number | null;

  confidence: number;

  status: CatalogueProductGroupStatus;

  warnings: string[];
};

export type CatalogueBatchAnalysisState =
  | "idle"
  | "running"
  | "paused"
  | "complete"
  | "failed";

export type CatalogueBatchAnalysisProgress = {
  state: CatalogueBatchAnalysisState;

  totalPages: number;
  completedPages: number;
  failedPages: number;
  skippedPages: number;

  currentPageNumber: number | null;

  startedAt: string | null;
  completedAt: string | null;

  error: string | null;
};

export type CatalogueAnalysisSession = {
  documentId: string;
  fileName: string;

  pages: Record<
    number,
    CataloguePageAnalysisRecord
  >;

  productGroups: CatalogueProductGroup[];

  progress: CatalogueBatchAnalysisProgress;
};