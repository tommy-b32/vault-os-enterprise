"use server";

import { revalidatePath } from "next/cache";

import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { parsePositiveAmountToPence, penceToDatabaseAmount } from "@/lib/business/CashLedgerRules";
import {
  approvePurchaseOrderDraft,
  cancelPurchaseOrder,
  createPurchaseOrderDraft,
  markPurchaseOrderOrdered,
  markPurchaseOrderShipped,
  prepareApprovedPurchaseOrder,
  postReceivedInventory,
  recordPurchaseOrderPayment,
  recordPurchaseOrderReceipt,
  type CreatePurchaseOrderDraftInput,
} from "@/lib/purchase-orders/PurchaseOrderRepository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CancelPurchaseOrderState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function cancelPurchaseOrderAction(
  _previousState: CancelPurchaseOrderState,
  formData: FormData,
): Promise<CancelPurchaseOrderState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const cancellationReason = formData.get("cancellation_reason");
    const confirmed = formData.get("cancellation_confirmed") === "yes";
    if (typeof purchaseOrderId !== "string" || !UUID_PATTERN.test(purchaseOrderId)) {
      return { status: "error", message: "Invalid purchase order." };
    }
    if (typeof cancellationReason !== "string" || !cancellationReason.trim()) {
      return { status: "error", message: "Cancellation reason is required." };
    }
    if (cancellationReason.trim().length > 1000) {
      return { status: "error", message: "Cancellation reason must be 1000 characters or fewer." };
    }
    if (!confirmed) {
      return { status: "error", message: "Confirm that this purchase order should be cancelled." };
    }

    const result = await cancelPurchaseOrder({
      purchaseOrderId,
      operatorId: operator.id,
      cancellationReason: cancellationReason.trim(),
    });
    revalidatePath("/commercial");
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return {
      status: "success",
      message: result.transitioned
        ? "Purchase order cancelled."
        : "Purchase order was already cancelled.",
    };
  } catch (error) {
    console.error("Unable to cancel purchase order", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Purchase order could not be cancelled.",
    };
  }
}

export type PostReceivedInventoryState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function postReceiptInventoryToShopify(
  _previousState: PostReceivedInventoryState,
  formData: FormData,
): Promise<PostReceivedInventoryState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const receiptId = formData.get("receipt_id");
    const idempotencyKey = formData.get("posting_idempotency_key");
    if (typeof purchaseOrderId !== "string" || !UUID_PATTERN.test(purchaseOrderId) ||
      typeof receiptId !== "string" || !UUID_PATTERN.test(receiptId) ||
      typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
      return { status: "error", message: "Exact receipt posting identity is invalid." };
    }
    const allocations: Array<{ receiptAllocationId: string; quantity: number }> = [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("post_allocation:") || typeof value !== "string") continue;
      const receiptAllocationId = key.slice("post_allocation:".length);
      const quantity = Number(value);
      if (!UUID_PATTERN.test(receiptAllocationId) || !Number.isInteger(quantity) || quantity < 0) {
        return { status: "error", message: "Posting quantities must be whole, non-negative units." };
      }
      if (quantity > 0) allocations.push({ receiptAllocationId, quantity });
    }
    if (!allocations.length) return { status: "error", message: "Enter at least one unit to post." };
    const result = await postReceivedInventory({ purchaseOrderId, receiptId, operatorId: operator.id, idempotencyKey, allocations });
    if (!result.success) return { status: "error", message: result.error ?? "Shopify inventory posting failed safely." };
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return { status: "success", message: result.transitioned
      ? `Received stock posted to Shopify.${result.warning ? ` ${result.warning}` : " Inventory reconciliation was requested."}`
      : "This received-stock posting was already completed." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Shopify inventory posting failed safely." };
  }
}

export type RecordPurchaseOrderReceiptState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function recordReceiptAgainstPurchaseOrder(
  _previousState: RecordPurchaseOrderReceiptState,
  formData: FormData,
): Promise<RecordPurchaseOrderReceiptState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const receivedDate = formData.get("received_date");
    const receivedLocationId = formData.get("received_location_id");
    const idempotencyKey = formData.get("idempotency_key");
    const parsedReceivedDate = typeof receivedDate === "string"
      ? new Date(`${receivedDate}T00:00:00Z`)
      : null;

    if (typeof purchaseOrderId !== "string" || !UUID_PATTERN.test(purchaseOrderId)) {
      return { status: "error", message: "Invalid purchase order." };
    }
    if (typeof receivedDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) ||
      !parsedReceivedDate || Number.isNaN(parsedReceivedDate.getTime()) ||
      parsedReceivedDate.toISOString().slice(0, 10) !== receivedDate) {
      return { status: "error", message: "Enter a valid received date." };
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
      return { status: "error", message: "Receipt operation identity is missing." };
    }
    if (typeof receivedLocationId !== "string" || !UUID_PATTERN.test(receivedLocationId)) {
      return { status: "error", message: "Select a valid Shopify receiving location." };
    }

    const linesById = new Map<string, {
      purchaseOrderLineId: string;
      discrepancyNote: string | null;
      nonSellableQuantity: number;
      allocations: Array<{ variantId: string; quantityReceived: number }>;
    }>();
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("allocation:") || typeof value !== "string" || value.trim() === "") continue;
      const [purchaseOrderLineId, variantId, extra] = key.slice("allocation:".length).split(":");
      const quantityReceived = Number(value);
      if (extra !== undefined || !UUID_PATTERN.test(purchaseOrderLineId) || !UUID_PATTERN.test(variantId) ||
        !Number.isInteger(quantityReceived) || quantityReceived < 0) {
        return { status: "error", message: "Received quantities must be whole, non-negative units." };
      }
      if (quantityReceived === 0) continue;
      const note = formData.get(`note:${purchaseOrderLineId}`);
      const line = linesById.get(purchaseOrderLineId) ?? {
        purchaseOrderLineId,
        discrepancyNote: typeof note === "string" && note.trim() ? note.trim() : null,
        nonSellableQuantity: 0,
        allocations: [],
      };
      line.allocations.push({ variantId, quantityReceived });
      linesById.set(purchaseOrderLineId, line);
    }
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith("non_sellable:") || typeof value !== "string" || value.trim() === "") continue;
      const purchaseOrderLineId = key.slice("non_sellable:".length);
      const parsed = Number(value);
      if (!UUID_PATTERN.test(purchaseOrderLineId)) {
        return { status: "error", message: "Invalid purchase-order line identity." };
      }
      if (!Number.isInteger(parsed) || parsed < 0) {
        return { status: "error", message: "Non-sellable quantities must be whole, non-negative units." };
      }
      if (parsed === 0) continue;
      const note = formData.get(`note:${purchaseOrderLineId}`);
      const discrepancyNote = typeof note === "string" && note.trim() ? note.trim() : null;
      if (!discrepancyNote) {
        return { status: "error", message: "Describe damaged, wrong, or otherwise non-sellable units." };
      }
      const line = linesById.get(purchaseOrderLineId) ?? {
        purchaseOrderLineId,
        discrepancyNote,
        nonSellableQuantity: 0,
        allocations: [],
      };
      line.nonSellableQuantity = parsed;
      linesById.set(purchaseOrderLineId, line);
    }
    const lines = Array.from(linesById.values());
    if (lines.length === 0) {
      return { status: "error", message: "Enter at least one positive received quantity." };
    }

    const result = await recordPurchaseOrderReceipt({
      purchaseOrderId,
      operatorId: operator.id,
      receivedDate,
      receivedLocationId,
      idempotencyKey,
      lines,
    });
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return {
      status: "success",
      message: result.transitioned
        ? result.fullyReceived
          ? "Receipt recorded. Purchase order is fully received."
          : "Partial receipt recorded."
        : "This receipt was already recorded.",
    };
  } catch (error) {
    console.error("Unable to record purchase-order receipt", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Purchase-order receipt could not be recorded.",
    };
  }
}

export type RecordPurchaseOrderPaymentState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function recordPaymentAgainstPurchaseOrder(
  _previousState: RecordPurchaseOrderPaymentState,
  formData: FormData,
): Promise<RecordPurchaseOrderPaymentState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const amount = formData.get("amount_gbp");
    const paymentDate = formData.get("payment_date");
    const idempotencyKey = formData.get("idempotency_key");
    if (typeof purchaseOrderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseOrderId)) {
      return { status: "error", message: "Invalid purchase order." };
    }
    if (typeof amount !== "string") return { status: "error", message: "Payment amount is required." };
    const parsedPaymentDate = typeof paymentDate === "string"
      ? new Date(`${paymentDate}T00:00:00Z`)
      : null;
    if (typeof paymentDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
      !parsedPaymentDate || Number.isNaN(parsedPaymentDate.getTime()) ||
      parsedPaymentDate.toISOString().slice(0, 10) !== paymentDate) {
      return { status: "error", message: "Enter a valid payment date." };
    }
    if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
      return { status: "error", message: "Payment operation identity is missing." };
    }
    const amountPence = parsePositiveAmountToPence(amount);
    const result = await recordPurchaseOrderPayment({
      purchaseOrderId,
      operatorId: operator.id,
      amountGbp: Number(penceToDatabaseAmount(amountPence)),
      paymentDate,
      idempotencyKey,
    });
    revalidatePath("/commercial");
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return {
      status: "success",
      message: result.transitioned
        ? `Payment recorded. Purchase order is ${result.status.replace("_", " ")}.`
        : "This payment was already recorded.",
    };
  } catch (error) {
    console.error("Unable to record purchase-order payment", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Purchase-order payment could not be recorded.",
    };
  }
}

export type MarkPurchaseOrderOrderedState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type MarkPurchaseOrderShippedState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function markPurchaseOrderAsShipped(
  _previousState: MarkPurchaseOrderShippedState,
  formData: FormData,
): Promise<MarkPurchaseOrderShippedState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const dispatchDate = formData.get("dispatch_date");
    const carrier = formData.get("carrier");
    const trackingReference = formData.get("tracking_reference");
    const confirmed = formData.get("dispatch_confirmed") === "yes";
    const parsedDispatchDate = typeof dispatchDate === "string"
      ? new Date(`${dispatchDate}T00:00:00Z`)
      : null;

    if (typeof purchaseOrderId !== "string" || !UUID_PATTERN.test(purchaseOrderId)) {
      return { status: "error", message: "Invalid purchase order." };
    }
    if (typeof dispatchDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dispatchDate) ||
      !parsedDispatchDate || Number.isNaN(parsedDispatchDate.getTime()) ||
      parsedDispatchDate.toISOString().slice(0, 10) !== dispatchDate) {
      return { status: "error", message: "Enter a valid dispatch date." };
    }
    if (!confirmed) {
      return { status: "error", message: "Confirm that the supplier has genuinely dispatched this order." };
    }
    if (typeof carrier !== "string" || carrier.trim().length > 200 ||
      typeof trackingReference !== "string" || trackingReference.trim().length > 200) {
      return { status: "error", message: "Carrier and tracking reference must each be 200 characters or fewer." };
    }

    const result = await markPurchaseOrderShipped({
      purchaseOrderId,
      operatorId: operator.id,
      dispatchDate,
      carrier: carrier.trim() || null,
      trackingReference: trackingReference.trim() || null,
    });
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return {
      status: "success",
      message: result.transitioned
        ? "Supplier dispatch recorded. Purchase order marked as shipped."
        : "Supplier dispatch was already recorded.",
    };
  } catch (error) {
    console.error("Unable to mark purchase order as shipped", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Supplier dispatch could not be recorded.",
    };
  }
}

export async function markPurchaseOrderAsOrdered(
  _previousState: MarkPurchaseOrderOrderedState,
  formData: FormData,
): Promise<MarkPurchaseOrderOrderedState> {
  try {
    const operator = await requireAuthenticatedOperator();
    const purchaseOrderId = formData.get("purchase_order_id");
    const confirmed = formData.get("placement_confirmed") === "yes";

    if (
      typeof purchaseOrderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchaseOrderId)
    ) return { status: "error", message: "Invalid purchase order." };
    if (!confirmed) {
      return { status: "error", message: "Confirm that the order was actually placed with the supplier." };
    }

    const result = await markPurchaseOrderOrdered({
      purchaseOrderId,
      operatorId: operator.id,
    });
    revalidatePath("/purchase-orders");
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    return {
      status: "success",
      message: result.transitioned
        ? "Purchase order marked as ordered."
        : "Purchase order was already marked as ordered.",
    };
  } catch (error) {
    console.error("Unable to mark purchase order as ordered", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Purchase order could not be marked as ordered.",
    };
  }
}

export type PrepareSupplierOrderState = {
  status: "idle" | "success" | "error";
  message: string;
  preparedOrder: {
    supplierName: string;
    orderText: string;
    totalPacks: number;
    totalUnits: number | null;
    lines: Array<{
      styleId: string;
      productName: string;
      recommendedPacks: number;
      recommendedUnits: number | null;
      unitsPerPack: number | null;
      supplierImageUrl: string | null;
      supplierImageSource: string | null;
      supplierImageCapturedAt: string | null;
    }>;
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

    revalidatePath("/purchase-orders");

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
