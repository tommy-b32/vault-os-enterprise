"use server";

import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import {
  createPurchaseOrderDraft,
  type CreatePurchaseOrderDraftInput,
} from "@/lib/purchase-orders/PurchaseOrderRepository";

export type SavePurchaseOrderDraftResult =
  | {
      success: true;
      draftId: string;
    }
  | {
      success: false;
      error: string;
    };

export async function savePurchaseOrderDraft(
  input: Omit<CreatePurchaseOrderDraftInput, "operatorId">,
): Promise<SavePurchaseOrderDraftResult> {
  try {
    const operator = await requireAuthenticatedOperator();

    const draft = await createPurchaseOrderDraft({
      ...input,
      operatorId: operator.id,
    });

    return {
      success: true,
      draftId: draft.id,
    };
  } catch (error) {
    console.error("Unable to save purchase-order draft", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Purchase-order draft could not be saved.",
    };
  }
}