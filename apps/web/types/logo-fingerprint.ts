export type LogoFingerprintBoundingBox = {
  /**
   * Values are stored from 0 to 1 relative to the full image.
   */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type LogoFingerprintApplication =
  | "embroidery"
  | "print"
  | "woven-badge"
  | "rubber-patch"
  | "metal-hardware"
  | "applique"
  | "debossed"
  | "embossed"
  | "unknown";

export type LogoFingerprintFamily =
  | "lettermark"
  | "wordmark"
  | "monogram"
  | "symbol"
  | "badge"
  | "crest"
  | "emblem"
  | "repeating-pattern"
  | "graphic-logo"
  | "unknown";

export type LogoFingerprint = {
  present: boolean;

  /**
   * AI-predicted brand identity based on visible logo evidence.
   * This is not treated as a guaranteed identity.
   */
  predicted_brand: string | null;

  logo_family: LogoFingerprintFamily | null;

  /**
   * Concise description of the visible logo shape.
   *
   * Examples:
   * "single serif H"
   * "circular compass badge"
   * "bee emblem"
   * "interlocking letter monogram"
   */
  logo_shape: string | null;

  /**
   * Visible letters or wording only.
   */
  logo_text: string | null;

  dominant_colours: string[];

  /**
   * Concise placement such as:
   * Left Chest, Centre Chest, Sleeve or All Over.
   */
  placement: string | null;

  application:
    | LogoFingerprintApplication
    | null;

  estimated_width_percent: number | null;
  estimated_height_percent: number | null;

  bounding_box:
    | LogoFingerprintBoundingBox
    | null;

  /**
   * Stable visual details useful for future matching.
   *
   * Examples:
   * "thin serif letter"
   * "white thread"
   * "small isolated chest mark"
   */
  visual_features: string[];

  confidence: number;
};