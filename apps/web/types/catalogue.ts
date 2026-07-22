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

  estimated_gross_profit_per_unit: number | null;
  estimated_margin_percent: number | null;

  estimated_return_on_pack_capital_percent:
    | number
    | null;

  commercial_cost_trusted: boolean;
  missing_commercial_requirements: string[];

  last_supplier_price_update: string | null;
  commercial_notes: string | null;
};

export type InventoryStrategy =
  | "stocked"
  | "dropship"
  | "do_not_restock"
  | "discontinued"
  | "service";

export type PackProfile =
  | "single"
  | "pack"
  | "mixed"
  | null;

export type CatalogueSupplier = {
  id: string;
  supplier_name: string;
};

export type CatalogueProduct = {
  product_id: string;
  product_name: string;

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

  complete_packs: number;

  loose_units: number;

  configuration_score: number;

  configuration_state: ConfigurationState;

  missing_requirements: string[];

  missing_requirement_count: number;

  configuration_trusted: boolean;

  trusted_for_reorder: boolean;

  brain_confidence: string;

  commercial_cost: ProductCommercialCost;
};

export type ConfigurationState =
  | "ready"
  | "almost_ready"
  | "needs_configuration"
  | "dropship_ready"
  | "do_not_restock"
  | "discontinued"
  | "service";