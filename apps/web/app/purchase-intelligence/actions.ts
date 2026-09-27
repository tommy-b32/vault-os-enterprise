"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { addAllocatedStockPurchasingPlanRecommendation, type Stage4HandoffResult } from "@/lib/stock-purchasing-plan-handoff";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function addAllocatedStockPurchasingPlanRecommendationAction(input: { styleId: string; parentProductId: string; idempotencyKey: string }): Promise<Stage4HandoffResult> {
  try {
    const styleId = typeof input?.styleId === "string" ? input.styleId.trim() : "";
    const parentProductId = typeof input?.parentProductId === "string" ? input.parentProductId.trim() : "";
    const idempotencyKey = typeof input?.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!styleId || !UUID_PATTERN.test(parentProductId) || !idempotencyKey || idempotencyKey.length > 200) return { success: false, code: "stage4_plan_not_allocated", message: "Refresh and review the purchasing plan before adding this recommendation." };
    const operator = await requireAuthenticatedOperator();
    const result = await addAllocatedStockPurchasingPlanRecommendation(operator.id, { styleId, parentProductId, idempotencyKey, targetDraftId: null });
    if (result.success) { revalidatePath("/purchase-intelligence"); revalidatePath("/purchase-orders"); revalidatePath(`/purchase-orders/${result.purchaseOrderId}`); }
    return result;
  } catch { return { success: false, code: "stage4_plan_not_allocated", message: "Current planning evidence is unavailable. Refresh and review the purchasing plan." }; }
}
