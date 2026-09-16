"use server";

import { revalidatePath } from "next/cache";

import { requireOperatorRole } from "@/lib/auth/operators";
import {
  INITIAL_COMMERCIAL_ACTION_STATE,
  type ProductCommercialActionState,
} from "@/lib/commercial-action-state";
import { parseCommercialInputs } from "@/lib/commercial-inputs";
import { emitCommandCentreRefreshEvent } from "@/lib/command-centre/emitCommandCentreRefreshEvent";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  const [parentResponse, settingsResponse, supplierResponse, existingCostResponse] =
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
      supabaseAdmin
        .from("vault_product_costs")
        .select("currency, exchange_rate_to_gbp, pack_cost, units_per_pack, shipping_cost_per_pack, import_cost_per_pack")
        .eq("product_id", inputs.parentProductId)
        .maybeSingle(),
    ]);

  if (
    parentResponse.error ||
    settingsResponse.error ||
    supplierResponse.error ||
    existingCostResponse.error
  ) {
    return {
      ...INITIAL_COMMERCIAL_ACTION_STATE,
      status: "error",
      message: "Commercial data could not be validated.",
    };
  }

  const inheritanceRequested = inputs.inheritPackCost || inputs.inheritShippingCost ||
    inputs.inheritImportCost || inputs.inheritUnitsPerPack || inputs.inheritFx;
  if (inheritanceRequested && !inputs.profileId) {
    return { ...INITIAL_COMMERCIAL_ACTION_STATE, status: "error", message: "Choose a matching supplier cost profile before enabling inheritance." };
  }
  if (inheritanceRequested) {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("vault_supplier_product_type_cost_profiles")
      .select("id, supplier_id, cost_type_id, supplier_currency, exchange_rate_to_gbp, pack_cost, shipping_cost_per_pack, import_cost_per_pack, units_per_pack, active")
      .eq("id", inputs.profileId!)
      .maybeSingle();
    const profileFxIsSafe = profile?.supplier_currency === "GBP"
      ? Number(profile.exchange_rate_to_gbp) === 1
      : Number.isFinite(Number(profile?.exchange_rate_to_gbp)) && Number(profile?.exchange_rate_to_gbp) > 0 && Number(profile?.exchange_rate_to_gbp) !== 1;
    const inheritedValuesAreValid =
      (!inputs.inheritPackCost || Number(profile?.pack_cost) > 0) &&
      (!inputs.inheritShippingCost || Number.isFinite(Number(profile?.shipping_cost_per_pack)) && Number(profile?.shipping_cost_per_pack) >= 0) &&
      (!inputs.inheritImportCost || Number.isFinite(Number(profile?.import_cost_per_pack)) && Number(profile?.import_cost_per_pack) >= 0) &&
      (!inputs.inheritUnitsPerPack || Number.isInteger(Number(profile?.units_per_pack)) && Number(profile?.units_per_pack) > 0) &&
      (!inputs.inheritFx || profileFxIsSafe);
    if (profileError || !profile?.active || profile.supplier_id !== inputs.supplierId || !inputs.costTypeId || profile.cost_type_id !== inputs.costTypeId || !inheritedValuesAreValid) {
      return { ...INITIAL_COMMERCIAL_ACTION_STATE, status: "error", message: "The supplier cost profile must be active and match this parent’s assigned supplier and canonical cost type, with safe complete values for each inherited field." };
    }
  }
  if (inputs.costTypeId) {
    const { data: costType, error: costTypeError } = await supabaseAdmin.from("vault_cost_types").select("id, active").eq("id", inputs.costTypeId).maybeSingle();
    if (costTypeError || !costType?.active) return { ...INITIAL_COMMERCIAL_ACTION_STATE, status: "error", message: "Choose an active governed canonical cost type." };
    const { error: assignmentError } = await supabaseAdmin.from("vault_product_cost_type_assignments").upsert({ product_id: inputs.parentProductId, cost_type_id: inputs.costTypeId }, { onConflict: "product_id" });
    if (assignmentError) return { ...INITIAL_COMMERCIAL_ACTION_STATE, status: "error", message: "The canonical cost type could not be saved." };
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
        currency: inputs.inheritFx ? existingCostResponse.data?.currency ?? inputs.currency : inputs.currency,
        exchange_rate_to_gbp: inputs.inheritFx ? existingCostResponse.data?.exchange_rate_to_gbp ?? null : inputs.exchangeRateToGbp,
        pack_cost: inputs.inheritPackCost ? existingCostResponse.data?.pack_cost ?? null : inputs.packCost,
        units_per_pack: inputs.inheritUnitsPerPack ? existingCostResponse.data?.units_per_pack ?? null : inputs.unitsPerPack,
        shipping_cost_per_pack: inputs.inheritShippingCost ? existingCostResponse.data?.shipping_cost_per_pack ?? null : inputs.shippingCostPerPack,
        import_cost_per_pack: inputs.inheritImportCost ? existingCostResponse.data?.import_cost_per_pack ?? null : inputs.importCostPerPack,
        last_supplier_price_update: inputs.lastSupplierPriceUpdate,
      },
      { onConflict: "product_id" },
    );

  const { error: inheritanceError } = await supabaseAdmin
    .from("vault_product_cost_profile_inheritance")
    .upsert({
      product_id: inputs.parentProductId,
      profile_id: inheritanceRequested ? inputs.profileId : null,
      inherit_pack_cost: inputs.inheritPackCost,
      inherit_shipping_cost: inputs.inheritShippingCost,
      inherit_import_cost: inputs.inheritImportCost,
      inherit_units_per_pack: inputs.inheritUnitsPerPack,
      inherit_fx: inputs.inheritFx,
    }, { onConflict: "product_id" });

  if (saveError || inheritanceError) {
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
  await emitCommandCentreRefreshEvent({
    domain: "catalogue",
    eventType: "commercial-costs-updated",
    entityId: inputs.parentProductId,
    source: "commercial-cost-action",
  });

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
