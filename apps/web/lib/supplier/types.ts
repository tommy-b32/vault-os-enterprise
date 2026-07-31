export type SupplierDocument = {
  id: string;

  fileName: string;

  pageCount: number;

  uploadedAt: string;
};

export type SupplierDocumentPage = {
  pageNumber: number;

  text: string;

  images: SupplierExtractedImage[];
};

export type SupplierExtractedImage = {
  id: string;

  pageNumber: number;

  width: number;

  height: number;

  mimeType: string;

  dataUrl: string;
};

export type SupplierExtractionResult = {
  document: SupplierDocument;

  pages: SupplierDocumentPage[];

  successful: boolean;

  confidence: number;

  warnings: string[];
};