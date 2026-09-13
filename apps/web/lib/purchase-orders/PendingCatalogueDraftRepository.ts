import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PendingCatalogueSizeInput = {
  supplierSizeLabel: string;
  normalizedSize: string;
  orderedUnits: number;
};

export type AddPendingCatalogueProductInput = {
  purchaseOrderId: string;
  workingTitle: string;
  supplierReference: string;
  brand: string;
  productCategory: string;
  colourModel: string;
  modelDesign: string;
  notes: string;
  orderedUnits: number;
  unitCostGbp: number;
  sizes: PendingCatalogueSizeInput[];
  idempotencyKey: string;
};

export type PendingCatalogueDraftResult =
  | { success: true; purchaseOrderId: string; purchaseOrderLineId: string; pendingCatalogueProductId: string; idempotent: boolean }
  | { success: false; code: "request_invalid" | "po_not_found" | "po_not_draft" | "supplier_mismatch" | "po_not_pending_compatible" | "idempotency_conflict" | "operation_failed"; message: string };

type Dependencies = { client: typeof supabaseAdmin };
const productionDependencies: Dependencies = { client: supabaseAdmin };

class PendingCatalogueError extends Error {
  constructor(readonly code: Exclude<PendingCatalogueDraftResult, { success: true }> ["code"], message: string) {
    super(message);
  }
}

const fail = (code: PendingCatalogueError["code"], message: string): never => {
  throw new PendingCatalogueError(code, message);
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export async function addPendingCatalogueProductToDraftFrom(
  operatorId: string,
  input: AddPendingCatalogueProductInput,
  dependencies: Dependencies,
): Promise<PendingCatalogueDraftResult> {
  try {
    const purchaseOrderId = clean(input.purchaseOrderId);
    const workingTitle = clean(input.workingTitle);
    const modelDesign = clean(input.modelDesign);
    const idempotencyKey = clean(input.idempotencyKey);
    if (!purchaseOrderId || !workingTitle || !modelDesign || !idempotencyKey || idempotencyKey.length > 200
      || !Number.isSafeInteger(input.orderedUnits) || input.orderedUnits <= 0 || !validMoney(input.unitCostGbp)
      || !Array.isArray(input.sizes) || input.sizes.length === 0) {
      fail("request_invalid", "Enter a product, model/design, positive ordered quantity, and unit cost.");
    }
    const sizes = input.sizes.map((size) => ({
      supplierSizeLabel: clean(size?.supplierSizeLabel),
      normalizedSize: clean(size?.normalizedSize),
      orderedUnits: size?.orderedUnits,
    }));
    if (sizes.some((size) => !size.supplierSizeLabel || !size.normalizedSize || !Number.isSafeInteger(size.orderedUnits) || size.orderedUnits <= 0)
      || new Set(sizes.map((size) => size.normalizedSize)).size !== sizes.length
      || sizes.reduce((total, size) => total + size.orderedUnits, 0) !== input.orderedUnits) {
      fail("request_invalid", "Each size needs a unique normalized size and positive quantity matching the ordered total.");
    }

    const { data: po, error: poError } = await dependencies.client
      .from("vault_purchase_orders")
      .select("id,status,supplier_id,created_by_operator_id,vault_purchase_order_lines(source_recommendation_type)")
      .eq("id", purchaseOrderId)
      .maybeSingle();
    if (poError) throw poError;
    if (!po || po.created_by_operator_id !== operatorId) return fail("po_not_found", "The draft purchase order was not found.");
    const purchaseOrder = po;
    if (purchaseOrder.status !== "draft") return fail("po_not_draft", "The purchase order is no longer a draft.");
    if ((purchaseOrder.vault_purchase_order_lines ?? []).some((line) => line.source_recommendation_type !== "pending_catalogue_purchase")) {
      fail("po_not_pending_compatible", "New catalogue products require an empty or pending-catalogue-only draft.");
    }
    const { data: supplier, error: supplierError } = await dependencies.client
      .from("vault_suppliers")
      .select("id,is_active")
      .eq("id", purchaseOrder.supplier_id)
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier?.is_active || supplier.id !== purchaseOrder.supplier_id) return fail("supplier_mismatch", "The draft supplier is unavailable.");

    const payload = {
      operator_id: operatorId,
      purchase_order_id: purchaseOrder.id,
      supplier_id: purchaseOrder.supplier_id,
      idempotency_key: idempotencyKey,
      working_title: workingTitle,
      supplier_reference: clean(input.supplierReference) || null,
      brand: clean(input.brand) || null,
      product_category: clean(input.productCategory) || null,
      colour_model: clean(input.colourModel) || null,
      model_design: modelDesign,
      notes: clean(input.notes) || null,
      ordered_units: input.orderedUnits,
      unit_cost_gbp: input.unitCostGbp,
      sizes: sizes.map((size) => ({
        supplier_size_label: size.supplierSizeLabel,
        normalized_size: size.normalizedSize,
        ordered_units: size.orderedUnits,
      })),
    };
    const { data, error } = await dependencies.client.rpc("create_pending_catalogue_purchase_line", { authoritative_payload: payload });
    if (error) {
      const code = error.message === "PENDING_CATALOGUE_IDEMPOTENCY_CONFLICT" ? "idempotency_conflict" : "operation_failed";
      fail(code, code === "idempotency_conflict" ? "This request conflicts with the current draft. Refresh and try again." : "The new catalogue product could not be added to this draft.");
    }
    const row = data?.[0] as { purchase_order_id?: string; purchase_order_line_id?: string; pending_catalogue_product_id?: string; idempotent?: boolean } | undefined;
    if (!row?.purchase_order_id || !row.purchase_order_line_id || !row.pending_catalogue_product_id) {
      return fail("operation_failed", "The new catalogue product did not return durable draft evidence.");
    }
    const resultRow = row as { purchase_order_id: string; purchase_order_line_id: string; pending_catalogue_product_id: string; idempotent?: boolean };
    return { success: true, purchaseOrderId: resultRow.purchase_order_id, purchaseOrderLineId: resultRow.purchase_order_line_id, pendingCatalogueProductId: resultRow.pending_catalogue_product_id, idempotent: resultRow.idempotent === true };
  } catch (error) {
    if (error instanceof PendingCatalogueError) return { success: false, code: error.code, message: error.message };
    console.error("Unable to add pending catalogue product to draft", error);
    return { success: false, code: "operation_failed", message: "The new catalogue product could not be added to this draft." };
  }
}

export function addPendingCatalogueProductToDraft(operatorId: string, input: AddPendingCatalogueProductInput) {
  return addPendingCatalogueProductToDraftFrom(operatorId, input, productionDependencies);
}
