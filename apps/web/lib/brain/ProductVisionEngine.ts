import type {
  LogoFingerprint,
} from "@/types/logo-fingerprint";

export type ProductVisionData = {
  brand: string | null;

  category: string | null;

  subcategory: string | null;

  primaryColour: string | null;

  secondaryColours: string[];

  fit: string | null;

  neckType: string | null;

  sleeveType: string | null;

  logoPresent: boolean;

  logoType: string | null;

  logoPosition: string | null;

  logoSize: string | null;

  logoFingerprint:
    LogoFingerprint | null;

  pattern: string | null;

  materialAppearance: string | null;

  styleClassification: string[];

  seasonality: string[];

  genderPresentation: string | null;

  frontDescription: string | null;

  backDescription: string | null;

  keyFeatures: string[];

  matchingKeywords: string[];

  visualFingerprint: string[];

  confidence: number;
};

export type ProductVisionInput = {
  productId: string;
  productName: string;
  imageUrl: string;
};

export const ProductVisionEngine = {
  createEmptyVision(): ProductVisionData {
    return {
      brand: null,

      category: null,

      subcategory: null,

      primaryColour: null,

      secondaryColours: [],

      fit: null,

      neckType: null,

      sleeveType: null,

      logoPresent: false,

      logoType: null,

      logoPosition: null,

      logoSize: null,

      logoFingerprint: null,

      pattern: null,

      materialAppearance: null,

      styleClassification: [],

      seasonality: [],

      genderPresentation: null,

      frontDescription: null,

      backDescription: null,

      keyFeatures: [],

      matchingKeywords: [],

      visualFingerprint: [],

      confidence: 0,
    };
  },
} as const;