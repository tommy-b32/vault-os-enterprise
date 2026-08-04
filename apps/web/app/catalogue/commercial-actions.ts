"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorRole } from "@/lib/auth/operators";
import { parseCommercialInputs } from "@/lib/commercial-inputs";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ProductCommercialActionState = {
  status: "idle" | "success" | "error";
  message: string;
  commercialState: "trusted" | "untrusted" | null;
  landedCostAvailable: boolean;
  grossProfitAvailable: boolean;
  marginAvailable: boolean;
  returnAvailable: boolean;
  missingRequirements: string[];
};

export const INITIAL_COMMERCIAL_ACTION_STATE:
  ProductCommercialActionState = {
    status: "idle",
    message: "",
    commercialState: null,
    landedCostAvailable: false,
    grossProfitAvailable: false,
    marginAvailable: false,
    returnAvailable: false,
    missingRequirements: [],
  };

export async function updateCommercialCosts(
  _previousState: ProductCommercialActionState,
  formData: FormData,
): Promise<ProductCommercialActionState> {
  await requireOperatorRole("owner", "operator");

  let inputs;

  try {
    inputs = parseCommercialInputs(formData);
  } catch (error) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Check the commercial inputs and try again.",
    };
  }

  const [parentResponse, settingsResponse, supplierResponse] =
    await Promise.all([
      supabaseAdmin
        .from("vault_products")
        .select("id")
        .eq("id", inputs.parentProductId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_product_settings")
        .select("supplier_id")
        .eq("product_id", inputs.parentProductId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_suppliers")
        .select("id")
        .eq("id", inputs.supplierId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

  if (
    parentResponse.error ||
    settingsResponse.error ||
    supplierResponse.error
  ) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message: "Commercial data could not be validated.",
    };
  }

  if (!parentResponse.data) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message: "The canonical product record is unavailable.",
    };
  }

  if (
    !supplierResponse.data ||
    settingsResponse.data?.supplier_id !== inputs.supplierId
  ) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message: "Assign an active canonical supplier before saving commercial data.",
    };
  }

  const { error: saveError } = await supabaseAdmin
    .from("vault_product_costs")
    .upsert(
      {
        product_id: inputs.parentProductId,
        supplier_id: inputs.supplierId,
        currency: inputs.currency,
        exchange_rate_to_gbp: inputs.exchangeRateToGbp,
        pack_cost: inputs.packCost,
        units_per_pack: inputs.unitsPerPack,
        shipping_cost_per_pack: inputs.shippingCostPerPack,
        import_cost_per_pack: inputs.importCostPerPack,
        average_selling_price: inputs.averageSellingPrice,
        last_supplier_price_update: inputs.lastSupplierPriceUpdate,
      },
      { onConflict: "product_id" },
    );

  if (saveError) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message: "Commercial data could not be saved.",
    };
  }

  const { data: canonical, error: canonicalError } =
    await supabaseAdmin
      .from("vault_product_commercial_intelligence")
      .select(`
        landed_cost_per_pack_gbp,
        estimated_gross_profit_per_unit,
        estimated_margin_percent,
        estimated_return_on_pack_capital_percent,
        commercial_cost_trusted,
        missing_commercial_requirements
      `)
      .eq("product_id", inputs.parentProductId)
      .maybeSingle();

  revalidatePath("/catalogue");
  revalidatePath("/advisor");
  revalidatePath("/purchase-orders");
  revalidatePath("/commercial");

  if (canonicalError || !canonical) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "success",
      message:
        "Commercial inputs were saved, but canonical metrics are temporarily unavailable.",
      commercialState: "untrusted",
    };
  }

  const commercialState = canonical.commercial_cost_trusted
    ? "trusted"
    : "untrusted";

  return {
    status: "success",
    message:
      commercialState === "trusted"
        ? "Commercial data saved and canonical metrics are trusted."
        : "Commercial data saved, but canonical requirements remain incomplete.",
    commercialState,
    landedCostAvailable:
      typeof canonical.landed_cost_per_pack_gbp === "number" &&
      canonical.landed_cost_per_pack_gbp > 0,
    grossProfitAvailable:
      canonical.estimated_gross_profit_per_unit !== null,
    marginAvailable:
      canonical.estimated_margin_percent !== null,
    returnAvailable:
      canonical.estimated_return_on_pack_capital_percent !== null,
    missingRequirements:
      canonical.missing_commercial_requirements ?? [],
  };
}
