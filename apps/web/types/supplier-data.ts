import type {
  ProductSupplierSource,
  SupplierProfile,
} from "@/types/suppliers";

export type SupplierSourceRow = {
  id: string;

  product_id: string;
  supplier_id: string;

  supplier_reference: string | null;

  pack_cost: number | null;
  units_per_pack: number | null;

  currency: string | null;

  lead_time_days: number | null;

  is_preferred: boolean | null;
  is_active: boolean | null;

  notes: string | null;
};

export type SupplierProfileRow = {
  id: string;
  supplier_name: string;

  is_active: boolean | null;

  currency: string | null;

  minimum_order_packs: number | null;
  moq_scope:
    | "per_order"
    | "per_product"
    | null;

  lead_time_days: number | null;

  shipping_cost_per_order: number | null;
  import_cost_per_order: number | null;

  payment_terms: string | null;

  reliability_score: number | null;

  notes: string | null;
};

export type SupplierData = {
  profiles: SupplierProfile[];
  sources: ProductSupplierSource[];
};