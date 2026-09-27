"use server";

import { revalidatePath } from "next/cache";
import { requireOperatorRole } from "@/lib/auth/operators";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type StockBudgetActionState = { status: "idle" | "success" | "error"; message: string };
export async function saveStockPurchasingBudget(_previous: StockBudgetActionState, formData: FormData): Promise<StockBudgetActionState> {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const budget = Number(formData.get("stock_purchasing_budget_gbp"));
    if (!Number.isFinite(budget) || budget < 0 || Math.round(budget * 100) !== budget * 100) return { status: "error", message: "Enter a non-negative GBP amount to two decimal places." };
    const { error } = await supabaseAdmin.from("vault_stock_purchasing_budget").upsert({ id: true, currency_code: "GBP", budget_gbp: budget, updated_by_operator_id: operator.id }, { onConflict: "id" });
    if (error) throw error;
    revalidatePath("/purchase-intelligence");
    return { status: "success", message: "Stock Purchasing Budget saved." };
  } catch { return { status: "error", message: "The Stock Purchasing Budget could not be saved safely." }; }
}
