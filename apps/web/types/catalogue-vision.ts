export type CatalogueVisionData = {
  brand: string | null;

  productName: string | null;

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

  confidence: number;

  extractedText: string[];

  visualFingerprint: string[];

  reviewed: boolean;
};