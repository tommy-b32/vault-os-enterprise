import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import { PurchaseIntelligenceEngine } from "@/lib/brain/PurchaseIntelligenceEngine";
import { getCatalogueData } from "@/lib/catalogue";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import {
  createSupplierOrderText,
  readSupplierImageSnapshot,
  type PreparedSupplierOrder,
} from "@/lib/purchase-orders/SupplierOrderPreparation";

export type PurchaseOrderDraftLineInput = {
  styleId: string;
  productName: string;
  supplierId: string;
  recommendedPacks: number;
  recommendedUnits: number | null;
  unitsPerPack: number | null;
  productMoqPacks: number | null;
  packCostGbp: number | null;
  lineCostGbp: number | null;
  expectedProfitGbp: number | null;
  recommendationConfidence: number | null;
  recommendationPriority: string | null;
  sourceRecommendationType: string;
  sourceSnapshot: Record<string, unknown>;
};

export type CreatePurchaseOrderDraftInput = {
  supplierId: string;
  operatorId: string;
  idempotencyKey: string;
  currency: string;
  estimatedTotalGbp: number | null;
  totalPacks: number;
  recommendationConfidence: number | null;
  reasoning: string | null;
  sourceSnapshot: Record<string, unknown>;
  lines: PurchaseOrderDraftLineInput[];
};

export type SavedPurchaseOrderDraft = {
  id: string;
  supplierId: string;
  status: string;
  estimatedTotalGbp: number | null;
  totalPacks: number | null;
  createdAt: string;
};

export type PurchaseOrderApprovalResult = {
  purchaseOrderId: string;
  status: "approved";
  approvedByOperatorId: string;
  approvedAt: string;
  transitioned: boolean;
};

export type PurchaseOrderOrderedResult = {
  purchaseOrderId: string;
  status: "ordered";
  orderedByOperatorId: string;
  orderedAt: string;
  transitioned: boolean;
};

export type PurchaseOrderShippedResult = {
  purchaseOrderId: string;
  status: "shipped" | "received";
  shippedAt: string;
  dispatchDate: string;
  carrier: string | null;
  trackingReference: string | null;
  shippedByOperatorId: string;
  transitioned: boolean;
};

export type PurchaseOrderCancellationResult = {
  purchaseOrderId: string;
  status: "cancelled";
  cancelledAt: string;
  cancelledByOperatorId: string;
  cancellationReason: string;
  transitioned: boolean;
};

export type PurchaseOrderPaymentResult = {
  paymentId: string;
  purchaseOrderId: string;
  cashTransactionId: string;
  status: "part_paid" | "paid" | "shipped" | "received";
  paidAmountGbp: number;
  outstandingAmountGbp: number;
  paymentDate: string;
  transitioned: boolean;
};

export type PurchaseOrderReceiptResult = {
  receiptId: string;
  purchaseOrderId: string;
  status: "ordered" | "part_paid" | "paid" | "shipped" | "received";
  receivedAt: string | null;
  fullyReceived: boolean;
  transitioned: boolean;
};

export type PurchaseOrderInventoryPostingResult = {
  success: boolean;
  postingId: string | null;
  transitioned?: boolean;
  inventorySyncRequested?: boolean;
  warning?: string | null;
  error?: string;
};

const APPROVAL_REASON_LABELS: Record<string, string> = {
  reorder_approval_missing: "Required product purchasing authorisation is missing.",
  supplier_minimum_packs_not_satisfied: "The supplier minimum pack quantity is not satisfied by current qualified demand.",
  supplier_minimum_value_not_satisfied: "The supplier minimum order value is not satisfied.",
  supplier_minimum_value_not_evaluated: "The supplier minimum order value cannot be evaluated with trusted currency evidence.",
  insufficient_reserve_safe_capacity: "The draft exceeds current reserve-safe purchasing capacity.",
  wallet_freshness_unknown: "Wallet freshness is unknown.",
  wallet_stale: "Wallet evidence is stale.",
  wallet_unavailable: "The purchasing wallet is unavailable.",
  supplier_basket_cost_unavailable: "Trusted supplier basket cost is unavailable.",
  commercial_data_missing: "Trusted commercial evidence is incomplete.",
};

async function getCurrentApprovalBlockers(purchaseOrderId: string): Promise<string[]> {
  const [order, catalogue, freshness, walletResult, suppliersResult, rulesResult] = await Promise.all([
    supabaseAdmin.from("vault_purchase_orders").select(`
      id, supplier_id, status, estimated_total_gbp, total_packs,
      vault_purchase_order_lines(style_id, recommended_packs)
    `).eq("id", purchaseOrderId).maybeSingle(),
    getCatalogueData(),
    InventorySyncRepository.getFreshness(),
    supabaseAdmin.from("vault_purchasing_wallet").select(`
      ledger_balance_gbp, protected_reserve_gbp, committed_orders_gbp,
      calculated_purchasing_power_gbp, available_purchasing_power_gbp,
      manual_spending_limit_gbp, reserve_override_allowed, wallet_last_updated,
      wallet_freshness_threshold_minutes, purchasing_power_state
    `).single(),
    supabaseAdmin.from("vault_suppliers").select(
      "id, supplier_name, is_active, minimum_order_value, currency_code",
    ),
    supabaseAdmin.from("vault_supplier_purchasing_rules").select(
      "supplier_id, minimum_order_packs",
    ),
  ]);

  const sourceError = order.error ?? walletResult.error ?? suppliersResult.error ?? rulesResult.error;
  if (sourceError) throw sourceError;
  if (!order.data) throw new Error("Purchase order was not found.");
  const orderData = order.data;
  if (orderData.status === "approved") return [];
  if (orderData.status !== "draft") {
    return [`Purchase order cannot be approved from status '${orderData.status}'.`];
  }

  const minimumPacks = new Map((rulesResult.data ?? []).map((rule) => [rule.supplier_id, rule.minimum_order_packs]));
  const suppliers = (suppliersResult.data ?? []).map((supplier) => ({
    id: supplier.id,
    name: supplier.supplier_name,
    active: supplier.is_active,
    currency: supplier.currency_code,
    minimumOrderValue: supplier.minimum_order_value,
    minimumOrderPacks: minimumPacks.get(supplier.id) ?? null,
  }));
  const evaluation = PurchaseIntelligenceEngine.evaluate({
    products: catalogue.products,
    suppliers,
    wallet: walletResult.data as PurchasingWalletData,
    inventoryTrusted: freshness.syncStatus === "current",
  });
  const qualification = evaluation.qualifications.find((entry) => entry.supplier.id === orderData.supplier_id);
  const basket = evaluation.baskets.find((entry) => entry.supplier.id === orderData.supplier_id);
  const blockers = [...(qualification?.blockers ?? ["Current supplier purchasing qualification is unavailable."])];

  if (basket?.purchasing_state !== "READY_TO_ORDER") {
    blockers.push("supplier_minimum_packs_not_satisfied");
  }

  const allowedPacks = new Map([
    ...(basket?.top_products ?? []),
    ...(basket?.additional_qualifying_products ?? []),
  ].map((line) => [line.style_id, line.required_packs]));
  for (const line of orderData.vault_purchase_order_lines ?? []) {
    if (allowedPacks.get(line.style_id) !== line.recommended_packs) {
      blockers.push(`Draft line '${line.style_id}' no longer matches current demand-qualified packs.`);
    }
  }

  const draftSpend = orderData.estimated_total_gbp;
  if (draftSpend === null) {
    blockers.push("supplier_basket_cost_unavailable");
  } else {
    const wallet = walletResult.data as PurchasingWalletData;
    const capital = CapitalEngine.reviewPosition({
      ledgerBalanceGbp: wallet.ledger_balance_gbp,
      protectedReserveGbp: wallet.protected_reserve_gbp,
      committedOrdersGbp: wallet.committed_orders_gbp,
      manualSpendingLimitGbp: wallet.manual_spending_limit_gbp,
      proposedPurchaseGbp: draftSpend,
      walletAvailable: true,
      walletLastUpdated: wallet.wallet_last_updated,
    });
    // reserve_override_allowed remains intentionally non-operative until a
    // separately authorised and audited override workflow exists.
    if (!capital.affordable || !capital.reserveProtected) {
      blockers.push("insufficient_reserve_safe_capacity");
    }
  }

  return Array.from(new Set(blockers));
}

type SupplierNameRow = {
  id: string;
  supplier_name: string;
};

type StyleProductRow = {
  style_id: string;
  parent_product_id: string;
};

type SupplierCatalogueArchiveRow = {
  id: string;
};

type SupplierCatalogueReviewItemRow = {
  id: string;
  linked_product_id: string;
  supplier_product_evidence: unknown;
  decision_metadata: Record<string, unknown>;
  decided_at: string;
};

async function getCanonicalSupplierImageSnapshots(
  supplierId: string,
  styleIds: string[],
  capturedAt: string,
): Promise<Map<string, Record<string, string | null>>> {
  const styles = await supabaseAdmin
    .from("vault_style_catalogue_intelligence")
    .select("style_id, parent_product_id")
    .in("style_id", Array.from(new Set(styleIds)));

  if (styles.error) {
    throw styles.error;
  }

  const styleRows = (styles.data ?? []) as StyleProductRow[];
  const productIds = Array.from(
    new Set(styleRows.map((style) => style.parent_product_id)),
  );
  if (productIds.length === 0) {
    return new Map();
  }

  const archives = await supabaseAdmin
    .from("vault_supplier_catalogue_archives")
    .select("id")
    .eq("supplier_id", supplierId);

  if (archives.error) {
    throw archives.error;
  }

  const archiveIds = ((archives.data ?? []) as SupplierCatalogueArchiveRow[])
    .map((archive) => archive.id);
  if (archiveIds.length === 0) {
    return new Map();
  }

  const reviewItems = await supabaseAdmin
    .from("vault_supplier_catalogue_review_items")
    .select(`
      id,
      linked_product_id,
      supplier_product_evidence,
      decision_metadata,
      decided_at
    `)
    .in("archive_id", archiveIds)
    .eq("review_status", "matched")
    .in("linked_product_id", productIds)
    .order("decided_at", { ascending: false })
    .order("id", { ascending: false });

  if (reviewItems.error) {
    throw reviewItems.error;
  }

  const parentProductByStyle = new Map(
    styleRows.map((style) => [style.style_id, style.parent_product_id]),
  );
  const snapshots = new Map<string, Record<string, string | null>>();

  for (const item of (reviewItems.data ?? []) as SupplierCatalogueReviewItemRow[]) {
    const styleId = item.decision_metadata.style_id;
    if (
      typeof styleId !== "string" ||
      snapshots.has(styleId) ||
      parentProductByStyle.get(styleId) !== item.linked_product_id
    ) {
      continue;
    }

    const evidence = item.supplier_product_evidence as {
      images?: Array<{ id?: unknown; url?: unknown; role?: unknown }>;
    };
    const images = Array.isArray(evidence?.images) ? evidence.images : [];
    const rolePriority = [
      "supplier",
      "official",
      "detail",
      "back",
      "label",
      "other",
    ];
    const image =
      rolePriority
        .map((role) => images.find((candidate) => candidate.role === role))
        .find(Boolean) ?? images[0];
    const imageUrl = typeof image?.url === "string" ? image.url : null;
    const imageId = typeof image?.id === "string" ? image.id : null;

    snapshots.set(styleId, {
      supplierImageUrl: imageUrl,
      supplierImageSource:
        imageUrl && imageId
          ? `vault_supplier_catalogue_review_items:${item.id}:supplier_product_evidence.images:${imageId}`
          : null,
      supplierImageCapturedAt: capturedAt,
    });
  }

  return snapshots;
}

function assertDraftInput(
  input: CreatePurchaseOrderDraftInput,
) {
  if (!input.supplierId) {
    throw new Error("Supplier is required.");
  }

  if (!input.operatorId) {
    throw new Error("Operator is required.");
  }

  if (!input.idempotencyKey) {
    throw new Error(
      "Draft idempotency key is required.",
    );
  }

  if (input.lines.length === 0) {
    throw new Error(
      "A purchase-order draft must contain at least one line.",
    );
  }

  if (
    !Number.isInteger(input.totalPacks) ||
    input.totalPacks <= 0
  ) {
    throw new Error(
      "Purchase-order draft packs must be positive.",
    );
  }

  for (const line of input.lines) {
    if (line.supplierId !== input.supplierId) {
      throw new Error(
        "Every purchase-order line must use the draft supplier.",
      );
    }

    if (
      !Number.isInteger(line.recommendedPacks) ||
      line.recommendedPacks <= 0
    ) {
      throw new Error(
        "Every purchase-order line must contain positive packs.",
      );
    }

    if (
      line.productMoqPacks !== null &&
      line.recommendedPacks < line.productMoqPacks
    ) {
      throw new Error(
        `${line.productName} is below its canonical product MOQ.`,
      );
    }
  }
}

async function getSupplierNames(
  supplierIds: string[],
): Promise<Map<string, string>> {
  const uniqueSupplierIds =
    Array.from(new Set(supplierIds.filter(Boolean)));

  if (uniqueSupplierIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("vault_suppliers")
    .select("id, supplier_name")
    .in("id", uniqueSupplierIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as SupplierNameRow[]).map(
      (supplier) => [
        supplier.id,
        supplier.supplier_name,
      ],
    ),
  );
}

export async function createPurchaseOrderDraft(
  input: CreatePurchaseOrderDraftInput,
): Promise<SavedPurchaseOrderDraft> {
  assertDraftInput(input);

  const existing = await supabaseAdmin
    .from("vault_purchase_orders")
    .select(`
      id,
      supplier_id,
      status,
      estimated_total_gbp,
      total_packs,
      created_at
    `)
    .eq(
      "created_by_operator_id",
      input.operatorId,
    )
    .eq(
      "idempotency_key",
      input.idempotencyKey,
    )
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data) {
    return {
      id: existing.data.id,
      supplierId: existing.data.supplier_id,
      status: existing.data.status,
      estimatedTotalGbp: existing.data.estimated_total_gbp,
      totalPacks: existing.data.total_packs,
      createdAt: existing.data.created_at,
    };
  }

  const imageSnapshots = await getCanonicalSupplierImageSnapshots(
    input.supplierId,
    input.lines.map((line) => line.styleId),
    new Date().toISOString(),
  );

  const header = await supabaseAdmin
    .from("vault_purchase_orders")
    .insert({
      supplier_id: input.supplierId,
      status: "draft",
      currency: input.currency,
      estimated_total_gbp: input.estimatedTotalGbp,
      total_packs: input.totalPacks,
      recommended_by_vault_brain: true,
      recommendation_confidence: input.recommendationConfidence,
      reasoning: input.reasoning,
      created_by_operator_id: input.operatorId,
      idempotency_key: input.idempotencyKey,
      source_snapshot: input.sourceSnapshot,
    })
    .select(`
      id,
      supplier_id,
      status,
      estimated_total_gbp,
      total_packs,
      created_at
    `)
    .single();

  if (header.error || !header.data) {
    throw (
      header.error ??
      new Error(
        "Purchase-order draft could not be created.",
      )
    );
  }

  const lineRows = input.lines.map((line) => {
    const {
      productImageUrl: _ignoredProductImageUrl,
      productImageSource: _ignoredProductImageSource,
      productImageCapturedAt: _ignoredProductImageCapturedAt,
      supplierImageUrl: _ignoredSupplierImageUrl,
      supplierImageSource: _ignoredSupplierImageSource,
      supplierImageCapturedAt: _ignoredSupplierImageCapturedAt,
      ...trustedSourceSnapshot
    } = line.sourceSnapshot;
    void _ignoredProductImageUrl;
    void _ignoredProductImageSource;
    void _ignoredProductImageCapturedAt;
    void _ignoredSupplierImageUrl;
    void _ignoredSupplierImageSource;
    void _ignoredSupplierImageCapturedAt;

    return {
      purchase_order_id: header.data.id,
      supplier_id: line.supplierId,
      style_id: line.styleId,
      product_name: line.productName,
      recommended_packs: line.recommendedPacks,
      recommended_units: line.recommendedUnits,
      units_per_pack: line.unitsPerPack,
      product_moq_packs: line.productMoqPacks,
      pack_cost_gbp: line.packCostGbp,
      line_cost_gbp: line.lineCostGbp,
      expected_profit_gbp: line.expectedProfitGbp,
      recommendation_confidence: line.recommendationConfidence,
      recommendation_priority: line.recommendationPriority,
      source_recommendation_type: line.sourceRecommendationType,
      source_snapshot: {
        ...trustedSourceSnapshot,
        ...(imageSnapshots.get(line.styleId) ?? {
          supplierImageUrl: null,
          supplierImageSource: null,
          supplierImageCapturedAt: null,
        }),
      },
    };
  });

  const lines = await supabaseAdmin
    .from("vault_purchase_order_lines")
    .insert(lineRows);

  if (lines.error) {
    await supabaseAdmin
      .from("vault_purchase_orders")
      .delete()
      .eq("id", header.data.id);

    throw lines.error;
  }

  return {
    id: header.data.id,
    supplierId: header.data.supplier_id,
    status: header.data.status,
    estimatedTotalGbp: header.data.estimated_total_gbp,
    totalPacks: header.data.total_packs,
    createdAt: header.data.created_at,
  };
}

export async function getPurchaseOrders() {
  const { data, error } =
    await supabaseAdmin
      .from("vault_purchase_orders")
      .select(`
        id,
        supplier_id,
        status,
        currency,
        estimated_total_gbp,
        total_packs,
        recommendation_confidence,
        created_by_operator_id,
        approved_by_operator_id,
        approved_at,
        reasoning,
        source_snapshot,
        created_at,
        updated_at,
        vault_purchase_order_lines (
          id,
          style_id,
          product_name,
          recommended_packs,
          recommended_units,
          units_per_pack,
          pack_cost_gbp,
          line_cost_gbp,
          source_recommendation_type
        )
      `)
      .in("status", ["draft", "approved", "ordered", "part_paid", "paid", "shipped", "received", "cancelled"])
      .order("created_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  const drafts = data ?? [];

  const supplierNames =
    await getSupplierNames(
      drafts.map((draft) => draft.supplier_id),
    );

  return drafts.map((draft) => ({
    ...draft,
    vault_suppliers: [
      {
        supplier_name:
          supplierNames.get(draft.supplier_id) ??
          "Unknown supplier",
      },
    ],
  }));
}

export async function getPurchaseOrder(
  id: string,
) {
  const { data, error } =
    await supabaseAdmin
      .from("vault_purchase_orders")
      .select(`
        *,
        vault_purchase_order_lines (
          *
        ),
        vault_purchase_order_payments (
          id,
          amount_gbp,
          payment_date,
          created_by_operator_id,
          cash_transaction_id,
          created_at
        ),
        vault_purchase_order_receipts (
          id,
          received_date,
          created_by_operator_id,
          created_at,
          vault_purchase_order_receipt_lines (
            id,
            purchase_order_line_id,
            quantity_received,
            non_sellable_quantity,
            discrepancy_note,
            created_at,
            vault_purchase_order_receipt_allocations (
              id,
              variant_id,
              shopify_variant_id_snapshot,
              shopify_inventory_item_id_snapshot,
              quantity_received,
              created_at
            )
          ),
          vault_locations (
            id,
            name,
            source_location_id
          )
        )
      `)
      .eq("id", id)
      .in("status", ["draft", "approved", "ordered", "part_paid", "paid", "shipped", "received", "cancelled"])
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const receiptAllocationIds = (data.vault_purchase_order_receipts ?? []).flatMap(
    (receipt: { vault_purchase_order_receipt_lines?: Array<{ vault_purchase_order_receipt_allocations?: Array<{ id: string }> }> }) =>
      (receipt.vault_purchase_order_receipt_lines ?? []).flatMap((line) =>
        (line.vault_purchase_order_receipt_allocations ?? []).map((allocation) => allocation.id)),
  );
  const inventoryPostings = receiptAllocationIds.length
    ? await supabaseAdmin.from("vault_purchase_order_inventory_posting_lines")
        .select(`receipt_allocation_id, quantity, vault_purchase_order_inventory_postings (
          id, idempotency_key, created_at, vault_purchase_order_inventory_posting_events (
            event_type, shopify_reference, response_payload, created_at
          )
        )`).in("receipt_allocation_id", receiptAllocationIds)
    : { data: [], error: null };
  if (inventoryPostings.error) throw inventoryPostings.error;

  const productIds = Array.from(new Set(
    (data.vault_purchase_order_lines ?? [])
      .map((line: { style_id: string }) => line.style_id.split("::")[0])
      .filter(Boolean),
  ));
  const [supplierNames, approvingOperator, orderingOperator, shippingOperator, cancellingOperator, receivingVariants, receivingLocations] = await Promise.all([
    getSupplierNames([data.supplier_id]),
    data.approved_by_operator_id
      ? supabaseAdmin
          .from("vault_operators")
          .select("display_name, email")
          .eq("id", data.approved_by_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.ordered_by_operator_id
      ? supabaseAdmin
          .from("vault_operators")
          .select("display_name, email")
          .eq("id", data.ordered_by_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.shipped_by_operator_id
      ? supabaseAdmin
          .from("vault_operators")
          .select("display_name, email")
          .eq("id", data.shipped_by_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    data.cancelled_by_operator_id
      ? supabaseAdmin
          .from("vault_operators")
          .select("display_name, email")
          .eq("id", data.cancelled_by_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    productIds.length
      ? supabaseAdmin
          .from("vault_variants")
          .select("id, product_id, source_variant_id, source_inventory_item_id, title, option_1, option_2")
          .eq("source", "shopify")
          .eq("source_active", true)
          .not("source_variant_id", "is", null)
          .not("source_inventory_item_id", "is", null)
          .in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("vault_locations")
      .select("id, name, source_location_id")
      .eq("source", "shopify")
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);

  if (approvingOperator.error) throw approvingOperator.error;
  if (orderingOperator.error) throw orderingOperator.error;
  if (shippingOperator.error) throw shippingOperator.error;
  if (cancellingOperator.error) throw cancellingOperator.error;
  if (receivingVariants.error) throw receivingVariants.error;
  if (receivingLocations.error) throw receivingLocations.error;

  return {
    ...data,
    vault_suppliers: [
      {
        supplier_name:
          supplierNames.get(data.supplier_id) ??
          "Unknown supplier",
      },
    ],
    approving_operator: approvingOperator.data,
    ordering_operator: orderingOperator.data,
    shipping_operator: shippingOperator.data,
    cancelling_operator: cancellingOperator.data,
    receiving_variants: receivingVariants.data ?? [],
    receiving_locations: receivingLocations.data ?? [],
    inventory_posting_lines: inventoryPostings.data ?? [],
  };
}

export async function postReceivedInventory(input: {
  purchaseOrderId: string;
  receiptId: string;
  operatorId: string;
  idempotencyKey: string;
  allocations: Array<{ receiptAllocationId: string; quantity: number }>;
}): Promise<PurchaseOrderInventoryPostingResult> {
  const { data, error } = await supabaseAdmin.functions.invoke(
    "shopify-post-received-inventory", { body: input },
  );
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response) {
      const payload = await response.clone().json().catch(() => null) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message);
  }
  return data as PurchaseOrderInventoryPostingResult;
}

export async function approvePurchaseOrderDraft(input: {
  purchaseOrderId: string;
  operatorId: string;
  approvedAt?: string;
}): Promise<PurchaseOrderApprovalResult> {
  const approvedAt = input.approvedAt ?? new Date().toISOString();

  const blockers = await getCurrentApprovalBlockers(input.purchaseOrderId);
  if (blockers.length > 0) {
    throw new Error(`Purchase order approval blocked: ${blockers.map(
      (reason) => APPROVAL_REASON_LABELS[reason] ?? reason,
    ).join(" ")}`);
  }

  const transition = await supabaseAdmin
    .from("vault_purchase_orders")
    .update({
      status: "approved",
      approved_by_operator_id: input.operatorId,
      approved_at: approvedAt,
    })
    .eq("id", input.purchaseOrderId)
    .eq("status", "draft")
    .select("id, status, approved_by_operator_id, approved_at")
    .maybeSingle();

  if (transition.error) {
    throw transition.error;
  }

  if (transition.data) {
    return {
      purchaseOrderId: transition.data.id,
      status: "approved",
      approvedByOperatorId: transition.data.approved_by_operator_id,
      approvedAt: transition.data.approved_at,
      transitioned: true,
    };
  }

  const current = await supabaseAdmin
    .from("vault_purchase_orders")
    .select("id, status, approved_by_operator_id, approved_at")
    .eq("id", input.purchaseOrderId)
    .maybeSingle();

  if (current.error) {
    throw current.error;
  }

  if (!current.data) {
    throw new Error("Purchase order was not found.");
  }

  if (
    current.data.status === "approved" &&
    current.data.approved_by_operator_id &&
    current.data.approved_at
  ) {
    return {
      purchaseOrderId: current.data.id,
      status: "approved",
      approvedByOperatorId: current.data.approved_by_operator_id,
      approvedAt: current.data.approved_at,
      transitioned: false,
    };
  }

  throw new Error(
    `Purchase order cannot be approved from status '${current.data.status}'.`,
  );
}

export async function markPurchaseOrderOrdered(input: {
  purchaseOrderId: string;
  operatorId: string;
  orderedAt?: string;
}): Promise<PurchaseOrderOrderedResult> {
  const orderedAt = input.orderedAt ?? new Date().toISOString();
  const transition = await supabaseAdmin
    .from("vault_purchase_orders")
    .update({
      status: "ordered",
      ordered_by_operator_id: input.operatorId,
      ordered_at: orderedAt,
    })
    .eq("id", input.purchaseOrderId)
    .eq("status", "approved")
    .select("id, status, ordered_by_operator_id, ordered_at")
    .maybeSingle();

  if (transition.error) throw transition.error;
  if (transition.data) {
    return {
      purchaseOrderId: transition.data.id,
      status: "ordered",
      orderedByOperatorId: transition.data.ordered_by_operator_id,
      orderedAt: transition.data.ordered_at,
      transitioned: true,
    };
  }

  const current = await supabaseAdmin
    .from("vault_purchase_orders")
    .select("id, status, ordered_by_operator_id, ordered_at")
    .eq("id", input.purchaseOrderId)
    .maybeSingle();

  if (current.error) throw current.error;
  if (!current.data) throw new Error("Purchase order was not found.");
  if (
    current.data.status === "ordered" &&
    current.data.ordered_by_operator_id &&
    current.data.ordered_at
  ) {
    return {
      purchaseOrderId: current.data.id,
      status: "ordered",
      orderedByOperatorId: current.data.ordered_by_operator_id,
      orderedAt: current.data.ordered_at,
      transitioned: false,
    };
  }

  throw new Error(
    `Purchase order cannot be marked ordered from status '${current.data.status}'.`,
  );
}

export async function markPurchaseOrderShipped(input: {
  purchaseOrderId: string;
  operatorId: string;
  dispatchDate: string;
  carrier: string | null;
  trackingReference: string | null;
}): Promise<PurchaseOrderShippedResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "mark_vault_purchase_order_shipped",
    {
      target_purchase_order_id: input.purchaseOrderId,
      target_operator_id: input.operatorId,
      target_dispatch_date: input.dispatchDate,
      target_carrier: input.carrier,
      target_tracking_reference: input.trackingReference,
    },
  );
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("Purchase-order shipping did not return canonical evidence.");
  return {
    purchaseOrderId: result.purchase_order_id,
    status: result.status,
    shippedAt: result.shipped_at,
    dispatchDate: result.dispatch_date,
    carrier: result.carrier,
    trackingReference: result.tracking_reference,
    shippedByOperatorId: result.shipped_by_operator_id,
    transitioned: result.transitioned,
  };
}

export async function cancelPurchaseOrder(input: {
  purchaseOrderId: string;
  operatorId: string;
  cancellationReason: string;
}): Promise<PurchaseOrderCancellationResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "cancel_vault_purchase_order",
    {
      target_purchase_order_id: input.purchaseOrderId,
      target_operator_id: input.operatorId,
      target_cancellation_reason: input.cancellationReason,
    },
  );
  if (error) throw error;
  const result = data?.[0];
  if (!result) throw new Error("Purchase-order cancellation did not return canonical evidence.");
  return {
    purchaseOrderId: result.purchase_order_id,
    status: result.status,
    cancelledAt: result.cancelled_at,
    cancelledByOperatorId: result.cancelled_by_operator_id,
    cancellationReason: result.cancellation_reason,
    transitioned: result.transitioned,
  };
}

export async function recordPurchaseOrderPayment(input: {
  purchaseOrderId: string;
  operatorId: string;
  amountGbp: number;
  paymentDate: string;
  idempotencyKey: string;
}): Promise<PurchaseOrderPaymentResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "record_vault_purchase_order_payment",
    {
      target_purchase_order_id: input.purchaseOrderId,
      target_operator_id: input.operatorId,
      target_amount_gbp: input.amountGbp,
      target_payment_date: input.paymentDate,
      target_idempotency_key: input.idempotencyKey,
    },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Purchase-order payment did not return canonical evidence.");
  return {
    paymentId: result.payment_id,
    purchaseOrderId: result.purchase_order_id,
    cashTransactionId: result.cash_transaction_id,
    status: result.status,
    paidAmountGbp: Number(result.paid_amount_gbp),
    outstandingAmountGbp: Number(result.outstanding_amount_gbp),
    paymentDate: result.payment_date,
    transitioned: result.transitioned,
  };
}

export async function recordPurchaseOrderReceipt(input: {
  purchaseOrderId: string;
  operatorId: string;
  receivedDate: string;
  receivedLocationId: string;
  idempotencyKey: string;
  lines: Array<{
    purchaseOrderLineId: string;
    discrepancyNote: string | null;
    nonSellableQuantity: number;
    allocations: Array<{
      variantId: string;
      quantityReceived: number;
    }>;
  }>;
}): Promise<PurchaseOrderReceiptResult> {
  const { data, error } = await supabaseAdmin.rpc(
    "record_vault_purchase_order_receipt",
    {
      target_purchase_order_id: input.purchaseOrderId,
      target_operator_id: input.operatorId,
      target_received_date: input.receivedDate,
      target_received_location_id: input.receivedLocationId,
      target_idempotency_key: input.idempotencyKey,
      target_lines: input.lines.map((line) => ({
        purchase_order_line_id: line.purchaseOrderLineId,
        discrepancy_note: line.discrepancyNote,
        non_sellable_quantity: line.nonSellableQuantity,
        allocations: line.allocations.map((allocation) => ({
          variant_id: allocation.variantId,
          quantity_received: allocation.quantityReceived,
        })),
      })),
    },
  );
  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) throw new Error("Purchase-order receipt did not return canonical evidence.");
  return {
    receiptId: result.receipt_id,
    purchaseOrderId: result.purchase_order_id,
    status: result.status,
    receivedAt: result.received_at,
    fullyReceived: result.fully_received,
    transitioned: result.transitioned,
  };
}

export async function prepareApprovedPurchaseOrder(
  purchaseOrderId: string,
): Promise<PreparedSupplierOrder> {
  const order = await supabaseAdmin
    .from("vault_purchase_orders")
    .select(`
      id,
      supplier_id,
      status,
      vault_purchase_order_lines (
        id,
        style_id,
        product_name,
        recommended_packs,
        recommended_units,
        units_per_pack,
        created_at,
        source_snapshot
      )
    `)
    .eq("id", purchaseOrderId)
    .maybeSingle();

  if (order.error) {
    throw order.error;
  }

  if (!order.data) {
    throw new Error("Purchase order was not found.");
  }

  if (!(["approved", "ordered", "part_paid", "paid", "shipped", "received"] as string[]).includes(order.data.status)) {
    throw new Error(
      `Supplier order preparation requires an approved purchasing state; found '${order.data.status}'.`,
    );
  }

  const supplier = await supabaseAdmin
    .from("vault_suppliers")
    .select("supplier_name")
    .eq("id", order.data.supplier_id)
    .maybeSingle();

  if (supplier.error) {
    throw supplier.error;
  }

  if (!supplier.data) {
    throw new Error("The persisted supplier could not be found.");
  }

  return createSupplierOrderText({
    supplierName: supplier.data.supplier_name,
    lines: [...(order.data.vault_purchase_order_lines ?? [])]
      .sort(
        (left, right) =>
          left.created_at.localeCompare(right.created_at) ||
          left.id.localeCompare(right.id),
      )
      .map((line) => ({
        styleId: line.style_id,
        productName: line.product_name,
        recommendedPacks: line.recommended_packs,
        recommendedUnits: line.recommended_units,
        unitsPerPack: line.units_per_pack,
        ...readSupplierImageSnapshot(line.source_snapshot),
      })),
  });
}
