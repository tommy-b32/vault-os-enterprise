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