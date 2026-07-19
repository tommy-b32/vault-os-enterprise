"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type ProductSettingsActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

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