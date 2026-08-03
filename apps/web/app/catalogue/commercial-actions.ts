"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOperatorRole } from "@/lib/auth/operators";

export type ProductCommercialActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateCommercialCosts(
  previousState: ProductCommercialActionState,
  formData: FormData,
): Promise<ProductCommercialActionState> {
  await requireOperatorRole("owner", "operator");

  const productId = String(formData.get("product_id"));

  const packCost =
    Number(formData.get("pack_cost")) || null;

  const shipping =
    Number(formData.get("shipping_cost_per_pack")) || 0;

  const importCost =
    Number(formData.get("import_cost_per_pack")) || 0;

  const averageSelling =
    Number(formData.get("average_selling_price")) || null;

  const lastSupplierUpdate =
    String(formData.get("last_supplier_price_update")) || null;

  const { error } =
    await supabaseAdmin
      .from("vault_product_costs")
      .upsert({
        product_id: productId,

        pack_cost: packCost,

        shipping_cost_per_pack: shipping,

        import_cost_per_pack: importCost,

        average_selling_price: averageSelling,

        last_supplier_price_update:
          lastSupplierUpdate,
      });

  if (error) {
    return {
      status: "error",
      message: error.message,
    };
  }

  revalidatePath("/catalogue");

  return {
    status: "success",
    message: "Commercial costs saved.",
  };
}
