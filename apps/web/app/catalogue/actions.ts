"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOperatorRole } from "@/lib/auth/operators";

export type ProductSettingsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function getParentProductId(formData: FormData): string {
  const value = formData.get("parent_product_id");

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("A canonical parent product ID is required");
  }

  return value.trim();
}

function revalidateReorderApprovalRoutes() {
  revalidatePath("/catalogue");
  revalidatePath("/advisor");
  revalidatePath("/purchase-orders");
}

export async function approveProductForReorder(
  formData: FormData,
): Promise<void> {
  const operator = await requireOperatorRole("owner", "operator");
  const productId = getParentProductId(formData);

  const [productResponse, configurationResponse, approvalResponse] =
    await Promise.all([
      supabaseAdmin
        .from("vault_products")
        .select("id")
        .eq("id", productId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_configuration_intelligence")
        .select("configuration_trusted, inventory_strategy, restock_enabled")
        .eq("product_id", productId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_product_reorder_approvals")
        .select("approval_state")
        .eq("product_id", productId)
        .maybeSingle(),
    ]);

  if (
    productResponse.error ||
    configurationResponse.error ||
    approvalResponse.error
  ) {
    throw new Error("Reorder approval could not be validated");
  }

  if (!productResponse.data || !configurationResponse.data) {
    throw new Error("The selected canonical product does not exist");
  }

  const configuration = configurationResponse.data;

  if (
    configuration.configuration_trusted !== true ||
    configuration.inventory_strategy !== "stocked" ||
    configuration.restock_enabled !== true
  ) {
    throw new Error("Complete the mandatory product configuration before approval");
  }

  if (approvalResponse.data?.approval_state === "approved") {
    revalidateReorderApprovalRoutes();
    return;
  }

  const approvedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("vault_product_reorder_approvals")
    .upsert(
      {
        product_id: productId,
        approval_state: "approved",
        approved_by: operator.id,
        approved_at: approvedAt,
        revoked_by: null,
        revoked_at: null,
      },
      { onConflict: "product_id" },
    );

  if (error) {
    throw new Error("The product could not be approved for reorder");
  }

  revalidateReorderApprovalRoutes();
}

export async function revokeProductReorderApproval(
  formData: FormData,
): Promise<void> {
  const operator = await requireOperatorRole("owner", "operator");
  const productId = getParentProductId(formData);

  const [productResponse, approvalResponse] = await Promise.all([
    supabaseAdmin
      .from("vault_products")
      .select("id")
      .eq("id", productId)
      .maybeSingle(),
    supabaseAdmin
      .from("vault_product_reorder_approvals")
      .select("approval_state")
      .eq("product_id", productId)
      .maybeSingle(),
  ]);

  if (productResponse.error || approvalResponse.error) {
    throw new Error("Reorder approval could not be validated");
  }

  if (!productResponse.data) {
    throw new Error("The selected canonical product does not exist");
  }

  if (!approvalResponse.data || approvalResponse.data.approval_state === "revoked") {
    revalidateReorderApprovalRoutes();
    return;
  }

  const { error } = await supabaseAdmin
    .from("vault_product_reorder_approvals")
    .update({
      approval_state: "revoked",
      revoked_by: operator.id,
      revoked_at: new Date().toISOString(),
    })
    .eq("product_id", productId)
    .eq("approval_state", "approved");

  if (error) {
    throw new Error("The reorder approval could not be revoked");
  }

  revalidateReorderApprovalRoutes();
}

const allowedStrategies = new Set([
  "stocked",
  "do_not_restock",
  "discontinued",
  "dropship",
  "service",
]);

const allowedPackProfiles = new Set([
  "",
  "tee_5_piece",
  "polo_6_piece",
  "hoodie",
  "custom",
]);

function optionalInteger(
  value: FormDataEntryValue | null,
): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      "Numeric settings must be zero or greater",
    );
  }

  return parsed;
}

function optionalText(
  value: FormDataEntryValue | null,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export async function updateProductSettings(
  _previousState: ProductSettingsActionState,
  formData: FormData,
): Promise<ProductSettingsActionState> {
  await requireOperatorRole("owner", "operator");
  const productId = formData.get("product_id");
  const supplierId = formData.get("supplier_id");
  const strategy = formData.get("inventory_strategy");
  const packProfile = formData.get("pack_profile");

  if (
    typeof productId !== "string" ||
    productId.trim().length === 0
  ) {
    throw new Error("A product ID is required");
  }

  if (
    typeof strategy !== "string" ||
    !allowedStrategies.has(strategy)
  ) {
    throw new Error(
      "The selected inventory strategy is invalid",
    );
  }

  if (
    typeof packProfile !== "string" ||
    !allowedPackProfiles.has(packProfile)
  ) {
    throw new Error(
      "The selected pack profile is invalid",
    );
  }

  const restockEnabled =
    formData.get("restock_enabled") === "on";

  const resolvedSupplierId =
    typeof supplierId === "string" &&
    supplierId.trim().length > 0
      ? supplierId
      : null;

  const payload = {
    product_id: productId,
    supplier_id: resolvedSupplierId,
    inventory_strategy: strategy,
    restock_enabled: restockEnabled,
    pack_profile:
      packProfile.length > 0
        ? packProfile
        : null,
    supplier_moq_packs:
      optionalInteger(
        formData.get("supplier_moq_packs"),
      ),
    target_stock_days:
      optionalInteger(
        formData.get("target_stock_days"),
      ),
    decision_reason:
      optionalText(
        formData.get("decision_reason"),
      ),
    notes:
      optionalText(formData.get("notes")),
  };

  const { error } = await supabaseAdmin
    .from("vault_product_settings")
    .upsert(payload, {
      onConflict: "product_id",
    });

  if (error) {
  return {
    status: "error",
    message: `Unable to save product settings: ${error.message}`,
  };
}

  revalidatePath("/catalogue");
  revalidatePath("/");
  revalidatePath("/inventory");
  return {
  status: "success",
  message: "Product settings saved successfully.",
};
}
