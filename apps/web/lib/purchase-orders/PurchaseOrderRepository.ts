import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
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
      .in("status", ["draft", "approved"])
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
        )
      `)
      .eq("id", id)
      .in("status", ["draft", "approved"])
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const [supplierNames, approvingOperator] = await Promise.all([
    getSupplierNames([data.supplier_id]),
    data.approved_by_operator_id
      ? supabaseAdmin
          .from("vault_operators")
          .select("display_name, email")
          .eq("id", data.approved_by_operator_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (approvingOperator.error) {
    throw approvingOperator.error;
  }

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
  };
}

export async function approvePurchaseOrderDraft(input: {
  purchaseOrderId: string;
  operatorId: string;
  approvedAt?: string;
}): Promise<PurchaseOrderApprovalResult> {
  const approvedAt = input.approvedAt ?? new Date().toISOString();

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

  if (order.data.status !== "approved") {
    throw new Error(
      `Supplier order preparation requires APPROVED status; found '${order.data.status}'.`,
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
