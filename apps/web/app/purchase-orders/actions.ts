"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import {
  approvePurchaseOrderDraft,
  createPurchaseOrderDraft,
  prepareApprovedPurchaseOrder,
  type CreatePurchaseOrderDraftInput,
} from "@/lib/purchase-orders/PurchaseOrderRepository";

export type PrepareSupplierOrderState = {
  status: "idle" | "success" | "error";
  message: string;
  preparedOrder: {
    supplierName: string;
    orderText: string;
    totalPacks: number;
    totalUnits: number | null;
  } | null;
};

export async function prepareSupplierOrder(
  _previousState: PrepareSupplierOrderState,
  formData: FormData,
): Promise<PrepareSupplierOrderState> {
  try {
    await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");

    if (
      typeof purchaseOrderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseOrderId)
    ) {
      return {
        status: "error",
        message: "Invalid purchase order.",
        preparedOrder: null,
      };
    }

    const preparedOrder =
      await prepareApprovedPurchaseOrder(purchaseOrderId);

    return {
      status: "success",
      message: "Supplier order text is ready for review.",
      preparedOrder,
    };
  } catch (error) {
    console.error("Unable to prepare supplier order", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Supplier order could not be prepared.",
      preparedOrder: null,
    };
  }
}

export type ApprovePurchaseOrderState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function approvePurchaseOrder(
  _previousState: ApprovePurchaseOrderState,
  formData: FormData,
): Promise<ApprovePurchaseOrderState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");

    if (
      typeof purchaseOrderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseOrderId)
    ) {
      return { status: "error", message: "Invalid purchase order." };
    }

    const result = await approvePurchaseOrderDraft({
      purchaseOrderId,
      operatorId: operator.id,
    });

    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);

    return {
      status: "success",
      message: result.transitioned
        ? "Purchase order approved."
        : "Purchase order was already approved.",
    };
  } catch (error) {
    console.error("Unable to approve purchase-order draft", error);
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Purchase order could not be approved.",
    };
  }
}

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
