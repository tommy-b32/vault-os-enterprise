import type {
  LogoFingerprint,
} from "@/types/logo-fingerprint";

export type ProductVision = {
  product_id: string;

  analysed_at: string | null;
  image_url: string | null;
  image_hash: string | null;
  model: string | null;
  vision_version: number;

  brand: string | null;

  category: string | null;
  subcategory: string | null;

  primary_colour: string | null;
  secondary_colours: string[];

  fit: string | null;
  neck_type: string | null;
  sleeve_type: string | null;

  logo_present: boolean;
  logo_type: string | null;
  logo_position: string | null;
  logo_size: string | null;

  logo_fingerprint:
    LogoFingerprint | null;

  pattern: string | null;

  material_appearance: string | null;

  style_classification: string | null;

  seasonality: string[];

  gender_presentation: string | null;

  front_description: string | null;
  back_description: string | null;

  key_features: string[];

  matching_keywords: string[];

  visual_fingerprint: string[];

  confidence: number;
};