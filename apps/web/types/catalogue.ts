export type InventoryStrategy =
  | "stocked"
  | "do_not_restock"
  | "discontinued"
  | "dropship"
  | "service";

export type PackProfile =
  | "tee_5_piece"
  | "polo_6_piece"
  | "hoodie"
  | "custom";

export type CatalogueProduct = {
  product_id: string;
  product_name: string;
  product_type: string | null;
  status: string | null;

  supplier_id: string | null;
  supplier_company: string | null;

  inventory_strategy: InventoryStrategy;
  restock_enabled: boolean;

  pack_profile: PackProfile | null;
  supplier_moq_packs: number | null;
  target_stock_days: number | null;

  decision_reason: string | null;
  notes: string | null;

  stock_on_hand?: number;
  complete_packs?: number;
  loose_units?: number;
};

export type CatalogueSupplier = {
  id: string;
  supplier_name: string;
};