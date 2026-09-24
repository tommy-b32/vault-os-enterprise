import type {
  ProductVision,
} from "@/types/product-vision";

export type ProductCommercialCost = {
  currency: string;
  exchange_rate_to_gbp: number;

  pack_cost: number | null;
  shipping_cost_per_pack: number | null;
  import_cost_per_pack: number | null;

  units_per_pack: number | null;

  landed_cost_per_pack: number | null;
  landed_cost_per_pack_gbp: number | null;
  landed_cost_per_unit: number | null;

  average_selling_price: number | null;
  realised_asp: {
    net_revenue_gbp: number;
    net_units_sold: number;
    order_count: number;
    window_start: string | null;
    window_end: string | null;
    latest_sale_at: string | null;
    order_history_freshness: string | null;
    history_complete: boolean;
    mapping_complete: boolean;
    availability: "available" | "unavailable";
    unavailable_reason: string | null;
  };

  estimated_gross_profit_per_unit: number | null;
  estimated_margin_percent: number | null;

  estimated_return_on_pack_capital_percent:
    | number
    | null;

  commercial_cost_trusted: boolean;
  missing_commercial_requirements: string[];

  last_supplier_price_update: string | null;
  commercial_notes: string | null;
  commercial_cost_resolution_mode: "product_override" | "inherited" | "mixed" | "unavailable";
  effective_profile_id: string | null;
  effective_profile_version_id: string | null;
  cost_type_id: string | null;
  pack_cost_source: string;
  shipping_cost_source: string;
  import_cost_source: string;
  units_source: string;
  fx_source: string;
  profile_price_updated_at: string | null;
};

export type ProductSalesIntelligence = {
  average_daily_sales: number | null;

  average_weekly_sales: number | null;

  average_monthly_sales: number | null;

  last_sale_date: string | null;

  days_since_last_sale: number | null;

  sales_velocity:
    | "very_high"
    | "high"
    | "medium"
    | "low"
    | "very_low"
    | "unknown";

  reorder_point: number | null;

  safety_stock: number | null;
};

export type ProductIntelligenceProfile = {
  brand: string | null;

  official_product_name: string | null;

  aliases: string[];

  primary_colour: string | null;

  secondary_colours: string[];

  garment_type: string | null;

  chest_logo: string | null;

  front_graphic: string | null;

  back_graphic: string | null;

  sleeve_detail: string | null;

  neck_label: string | null;

  fit: string | null;

  collection: string | null;

  visual_fingerprint: string[];

  confidence: number;

  reviewed: boolean;
};

export type InventoryStrategy =
  | "stocked"
  | "dropship"
  | "do_not_restock"
  | "discontinued"
  | "service";

export type PackProfile = string | null;

export type GovernedPackProfile = {
  id: string;
  display_name: string;
  units_per_pack: number | null;
  active: boolean;
};

export type CatalogueSupplier = {
  id: string;
  supplier_name: string;
};

export type SupplierCostProfile = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  cost_type_id: string;
  cost_type_name: string;
  active: boolean;
  supplier_currency: string;
  exchange_rate_to_gbp: number;
  pack_cost: number;
  shipping_cost_per_pack: number;
  import_cost_per_pack: number;
  units_per_pack: number;
  price_updated_at: string;
};

export type ReplenishmentIntelligence = {
  styleId: string;
  parentProductId: string;
  stockOnHand: number | null;
  committedStock: number | null;
  incomingStock: number | null;
  netAvailableStock: number | null;
  averageDailySales: number | null;
  averageWeeklySales: number | null;
  sales7Days: number | null;
  sales14Days: number | null;
  sales30Days: number | null;
  lastSaleDate: string | null;
  daysSinceLastSale: number | null;
  salesHistory30Complete: boolean;
  salesHistoryDays: number | null;
  reorderPoint: number | null;
  safetyStock: number | null;
  targetStockDays: number | null;
  supplierLeadTimeDays: number | null;
  unitsPerPack: number | null;
  supplierMoqPacks: number | null;
  freshness: string | null;
  supplierMinimumOrderState: "satisfied" | "not_satisfied" | "unknown" | "not_applicable";
  trusted: boolean;
  missingRequirements: string[];
};

export type TradingEvidence = {
  state: "LEARNING" | "DEVELOPING_EVIDENCE" | "SUFFICIENT_EVIDENCE" | "UNKNOWN";
  reason: string;
  verifiedLiveDays: number | null;
  verifiedCoverageDays: number | null;
  coverageComplete: boolean;
  orderEvidenceFresh: boolean;
  firstPositiveSaleAt: string | null;
  sellingDays: number | null;
  unitsSinceLive: number | null;
};

export type ProductReorderApproval = {
  approval_state: "approved" | "revoked";
  approved_at: string;
  approved_by_display_name: string;
  revoked_at: string | null;
};

export type ConfigurationState =
  | "ready"
  | "almost_ready"
  | "needs_configuration"
  | "dropship_ready"
  | "do_not_restock"
  | "discontinued"
  | "service";

export type CatalogueProduct = {
  style_id: string;
  parent_product_id: string;
  product_name: string;

  /*
   * Legacy catalogue intelligence generated
   * from Shopify and catalogue metadata.
   *
   * This remains available while Vault OS
   * transitions matching to Product Vision V2.
   */
  product_intelligence: ProductIntelligenceProfile;

  /*
   * AI-generated visual profile loaded from
   * vault_product_vision.
   *
   * This can be null when a product has not
   * yet been analysed or no matching vision
   * record exists.
   */
  product_vision: ProductVision | null;

  product_type: string | null;
  status: string | null;

  supplier_id: string | null;
  supplier_company: string | null;

  inventory_strategy: InventoryStrategy;

  restock_enabled: boolean;

  pack_profile: PackProfile;

  supplier_moq_packs: number | null;

  target_stock_days: number | null;

  decision_reason: string | null;

  notes: string | null;

  stock_on_hand: number;

  committed_stock: number | null;
  incoming_stock: number | null;

  complete_packs: number;

  loose_units: number;

  sales_intelligence: ProductSalesIntelligence;

  replenishment_intelligence: ReplenishmentIntelligence;

  trading_evidence?: TradingEvidence;

  configuration_score: number;

  configuration_state: ConfigurationState;

  missing_requirements: string[];

  missing_requirement_count: number;

  configuration_trusted: boolean;

  trusted_for_reorder: boolean;

  reorder_approval: ProductReorderApproval | null;

  brain_confidence: string;

  commercial_cost: ProductCommercialCost;
};
