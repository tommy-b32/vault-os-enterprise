import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import { PurchaseIntelligenceEngine } from "@/lib/brain/PurchaseIntelligenceEngine";
import { getCatalogueData } from "@/lib/catalogue";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import { loadSupplierStylePackCompositionIntelligence } from "@/lib/supplier-style-pack-composition";
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

type CanonicalApprovalQualification = {
  evaluated_at: string;
  supplier_id: string;
  supplier_currency: string | null;
  supplier_minimum_packs: number | null;
  supplier_minimum_value: number | null;
  qualification_state: string;
  qualification_blockers: string[];
  basket_state: string;
  total_packs: number;
  total_units: number;
  total_gbp: number;
  lines: Array<{
    supplier_id: string;
    style_id: string;
    product_name: string;
    recommended_packs: number;
    recommended_units: number;
    units_per_pack: number;
    pack_cost_gbp: number;
    line_cost_gbp: number;
    source_recommendation_type: string;
  }>;
};

export type FixedPackApprovalQualification = {
  source_family: "fixed_pack";
  purchase_order_id: string;
  supplier_id: string;
  currency_code: "GBP";
  expected_total_packs: number;
  expected_total_gbp: number;
  lines: Array<{
    purchase_order_line_id: string;
    source_recommendation_type: "fixed_pack_purchase_recommendation" | "manual_fixed_pack_purchase";
    provenance_fingerprint: string;
  }>;
};
export function classifyPurchaseOrderApprovalSources(sources: string[]): "legacy_pi" | "fixed_pack" {
  const legacy = new Set(["purchase_intelligence_required", "purchase_intelligence_bring_forward"]);
  const fixed = new Set(["fixed_pack_purchase_recommendation", "manual_fixed_pack_purchase"]);
  if (!sources.length || sources.some((source) => !legacy.has(source) && !fixed.has(source))) throw new Error("PO_SOURCE_MIX_INVALID");
  const family = legacy.has(sources[0]) ? legacy : fixed;
  if (sources.some((source) => !family.has(source))) throw new Error("PO_SOURCE_MIX_INVALID");
  return family === legacy ? "legacy_pi" : "fixed_pack";
}

export type FixedPackAllocationConservationLine = {
  id: unknown;
  recommended_packs: unknown;
  recommended_units: unknown;
  units_per_pack: unknown;
  source_recommendation_type: unknown;
};

export type FixedPackAllocationConservationAllocation = {
  purchase_order_line_id: unknown;
  variant_id?: unknown;
  parent_product_id?: unknown;
  model_design?: unknown;
  normalized_size: unknown;
  shopify_variant_id_snapshot?: unknown;
  shopify_inventory_item_id_snapshot?: unknown;
  units_per_pack: unknown;
  ordered_units: unknown;
};

export type FixedPackCurrentPackContractLine = FixedPackAllocationConservationLine & {
  supplier_id: unknown;
  style_id: unknown;
  source_snapshot: unknown;
};

export type FixedPackCurrentPackContractRow = {
  id: unknown;
  supplier_id: unknown;
  style_id: unknown;
  normalized_size: unknown;
  units_per_pack: unknown;
  declared_units_per_pack: unknown;
  composition_units_per_pack: unknown;
  composition_complete: unknown;
  composition_valid: unknown;
  commercial_pack_consistent: unknown;
  active: unknown;
};

export type FixedPackCurrentVariantIdentityRow = {
  id: unknown;
  product_id: unknown;
  model_design: unknown;
  normalized_size: unknown;
  source: unknown;
  source_active: unknown;
  identity_resolution_status: unknown;
  source_variant_id: unknown;
  source_inventory_item_id: unknown;
};

export type FixedPackCommercialPolicyLine = FixedPackAllocationConservationLine & {
  supplier_id: unknown;
  style_id: unknown;
  source_snapshot: unknown;
  pack_cost_gbp: unknown;
  line_cost_gbp: unknown;
};

export type FixedPackCurrentProductCommercial = {
  style_id: unknown;
  supplier_id: unknown;
  supplier_moq_packs: unknown;
  restock_enabled: unknown;
  inventory_strategy: unknown;
  commercial_cost: unknown;
};

export type FixedPackCommercialPolicyOrder = {
  supplier_id: unknown;
  currency: unknown;
  total_packs: unknown;
  estimated_total_gbp: unknown;
};

export type FixedPackCommercialPolicySupplier = {
  id: unknown;
  currency_code: unknown;
  minimum_order_value: unknown;
};

export type FixedPackCommercialPolicyRule = {
  supplier_id: unknown;
  minimum_order_packs: unknown;
};

export type FixedPackProvenanceRecord = {
  fingerprint: unknown;
  style_id: unknown;
  purchase_order_id: unknown;
  purchase_order_line_id: unknown;
};

export type FixedPackProvenanceEvent = {
  purchase_order_line_id: unknown;
  event_type: unknown;
  event_snapshot: unknown;
};

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function validateFixedPackAllocationConservation(
  lines: FixedPackAllocationConservationLine[],
  allocations: FixedPackAllocationConservationAllocation[],
): void {
  const allocationsByLineId = new Map<string, FixedPackAllocationConservationAllocation[]>();
  const lineIds = new Set<string>();

  for (const line of lines) {
    if (typeof line.id !== "string" || !line.id.trim()) {
      throw new Error("FIXED_PACK_ALLOCATION_INVALID");
    }
    lineIds.add(line.id);
  }

  for (const allocation of allocations) {
    if (
      typeof allocation.purchase_order_line_id !== "string" ||
      !lineIds.has(allocation.purchase_order_line_id)
    ) {
      throw new Error("FIXED_PACK_ALLOCATION_INVALID");
    }
    const lineAllocations = allocationsByLineId.get(allocation.purchase_order_line_id) ?? [];
    lineAllocations.push(allocation);
    allocationsByLineId.set(allocation.purchase_order_line_id, lineAllocations);
  }

  for (const line of lines) {
    const lineId = line.id;
    if (
      typeof lineId !== "string" ||
      !isPositiveInteger(line.recommended_packs) ||
      !isPositiveInteger(line.recommended_units) ||
      !isPositiveInteger(line.units_per_pack) ||
      line.recommended_units !== line.recommended_packs * line.units_per_pack
    ) {
      throw new Error("FIXED_PACK_ALLOCATION_INVALID");
    }

    const lineAllocations = allocationsByLineId.get(lineId);
    if (!lineAllocations?.length) {
      throw new Error("FIXED_PACK_ALLOCATION_MISSING");
    }

    let allocatedUnitsPerPack = 0;
    let allocatedOrderedUnits = 0;
    for (const allocation of lineAllocations) {
      if (
        typeof allocation.normalized_size !== "string" ||
        !allocation.normalized_size.trim() ||
        !isPositiveInteger(allocation.units_per_pack) ||
        !isPositiveInteger(allocation.ordered_units) ||
        allocation.ordered_units !== line.recommended_packs * allocation.units_per_pack
      ) {
        throw new Error("FIXED_PACK_ALLOCATION_INVALID");
      }
      allocatedUnitsPerPack += allocation.units_per_pack;
      allocatedOrderedUnits += allocation.ordered_units;
    }

    if (
      allocatedUnitsPerPack !== line.units_per_pack ||
      allocatedOrderedUnits !== line.recommended_units
    ) {
      throw new Error("FIXED_PACK_ALLOCATION_INVALID");
    }
  }
}

function persistedPackDefinitionId(sourceSnapshot: unknown): string | null {
  if (!sourceSnapshot || typeof sourceSnapshot !== "object" || Array.isArray(sourceSnapshot)) {
    return null;
  }
  const packDefinitionId = (sourceSnapshot as Record<string, unknown>).pack_definition_id;
  return typeof packDefinitionId === "string" && packDefinitionId.trim()
    ? packDefinitionId
    : null;
}

export function validateFixedPackCurrentPackContract(
  lines: FixedPackCurrentPackContractLine[],
  allocations: FixedPackAllocationConservationAllocation[],
  contracts: FixedPackCurrentPackContractRow[],
): void {
  const allocationsByLineId = new Map<string, FixedPackAllocationConservationAllocation[]>();
  for (const allocation of allocations) {
    if (typeof allocation.purchase_order_line_id !== "string") {
      throw new Error("PACK_CONTRACT_CHANGED");
    }
    const lineAllocations = allocationsByLineId.get(allocation.purchase_order_line_id) ?? [];
    lineAllocations.push(allocation);
    allocationsByLineId.set(allocation.purchase_order_line_id, lineAllocations);
  }

  for (const line of lines) {
    if (
      typeof line.id !== "string" ||
      typeof line.supplier_id !== "string" || !line.supplier_id.trim() ||
      typeof line.style_id !== "string" || !line.style_id.trim() ||
      !isPositiveInteger(line.units_per_pack)
    ) {
      throw new Error("PACK_CONTRACT_CHANGED");
    }

    const matchingRows = contracts.filter((contract) =>
      contract.supplier_id === line.supplier_id && contract.style_id === line.style_id,
    );
    const definitionIds = new Set(
      matchingRows.filter((contract) => typeof contract.id === "string" && contract.id.trim())
        .map((contract) => contract.id as string),
    );
    const persistedDefinitionId = persistedPackDefinitionId(line.source_snapshot);
    if (
      definitionIds.size !== 1 ||
      (persistedDefinitionId !== null && !definitionIds.has(persistedDefinitionId)) ||
      matchingRows.some((contract) =>
        contract.active !== true ||
        contract.composition_complete !== true ||
        contract.composition_valid !== true ||
        contract.commercial_pack_consistent !== true ||
        !isPositiveInteger(contract.units_per_pack) ||
        typeof contract.normalized_size !== "string" || !contract.normalized_size.trim(),
      )
    ) {
      throw new Error("PACK_CONTRACT_CHANGED");
    }

    const currentComposition = new Map<string, number>();
    for (const contract of matchingRows) {
      if (currentComposition.has(contract.normalized_size as string)) {
        throw new Error("PACK_CONTRACT_CHANGED");
      }
      currentComposition.set(contract.normalized_size as string, contract.units_per_pack as number);
    }

    const persistedAllocations = allocationsByLineId.get(line.id);
    if (!persistedAllocations?.length || persistedAllocations.length !== currentComposition.size) {
      throw new Error("PACK_CONTRACT_CHANGED");
    }
    let currentUnitsPerPack = 0;
    for (const [normalizedSize, unitsPerPack] of currentComposition) {
      currentUnitsPerPack += unitsPerPack;
      const persisted = persistedAllocations.filter((allocation) => allocation.normalized_size === normalizedSize);
      if (persisted.length !== 1 || persisted[0].units_per_pack !== unitsPerPack) {
        throw new Error("PACK_CONTRACT_CHANGED");
      }
    }

    if (
      currentUnitsPerPack !== line.units_per_pack ||
      matchingRows.some((contract) =>
        contract.declared_units_per_pack !== currentUnitsPerPack ||
        contract.composition_units_per_pack !== currentUnitsPerPack,
      )
    ) {
      throw new Error("PACK_CONTRACT_CHANGED");
    }
  }
}

export function validateFixedPackCurrentVariantIdentity(
  allocations: FixedPackAllocationConservationAllocation[],
  variants: FixedPackCurrentVariantIdentityRow[],
): void {
  const allocationsByVariantId = new Map<string, FixedPackAllocationConservationAllocation>();
  for (const allocation of allocations) {
    if (
      typeof allocation.variant_id !== "string" || !allocation.variant_id.trim() ||
      typeof allocation.parent_product_id !== "string" || !allocation.parent_product_id.trim() ||
      typeof allocation.model_design !== "string" || !allocation.model_design.trim() ||
      typeof allocation.normalized_size !== "string" || !allocation.normalized_size.trim() ||
      typeof allocation.shopify_variant_id_snapshot !== "string" || !allocation.shopify_variant_id_snapshot.trim() ||
      typeof allocation.shopify_inventory_item_id_snapshot !== "string" || !allocation.shopify_inventory_item_id_snapshot.trim() ||
      allocationsByVariantId.has(allocation.variant_id)
    ) {
      throw new Error("VARIANT_IDENTITY_CHANGED");
    }
    allocationsByVariantId.set(allocation.variant_id, allocation);
  }

  if (variants.length !== allocations.length) {
    throw new Error("VARIANT_IDENTITY_CHANGED");
  }

  const variantsById = new Map<string, FixedPackCurrentVariantIdentityRow>();
  for (const variant of variants) {
    if (
      typeof variant.id !== "string" ||
      variantsById.has(variant.id) ||
      !allocationsByVariantId.has(variant.id)
    ) {
      throw new Error("VARIANT_IDENTITY_CHANGED");
    }
    variantsById.set(variant.id, variant);
  }

  for (const [variantId, allocation] of allocationsByVariantId) {
    const variant = variantsById.get(variantId);
    if (
      !variant ||
      variant.source !== "shopify" ||
      variant.source_active !== true ||
      variant.identity_resolution_status !== "resolved" ||
      variant.product_id !== allocation.parent_product_id ||
      variant.model_design !== allocation.model_design ||
      variant.normalized_size !== allocation.normalized_size ||
      variant.source_variant_id !== allocation.shopify_variant_id_snapshot ||
      variant.source_inventory_item_id !== allocation.shopify_inventory_item_id_snapshot
    ) {
      throw new Error("VARIANT_IDENTITY_CHANGED");
    }
  }
}

export function validateFixedPackCurrentCommercialPolicy(
  lines: FixedPackCommercialPolicyLine[],
  products: FixedPackCurrentProductCommercial[],
  purchaseOrderSupplierId: unknown,
): void {
  if (typeof purchaseOrderSupplierId !== "string" || !purchaseOrderSupplierId.trim()) {
    throw new Error("SOURCE_PROVENANCE_INVALID");
  }

  for (const line of lines) {
    if (
      typeof line.supplier_id !== "string" || line.supplier_id !== purchaseOrderSupplierId ||
      typeof line.style_id !== "string" || !line.style_id.trim() ||
      !isPositiveInteger(line.recommended_packs)
    ) {
      throw new Error("SOURCE_PROVENANCE_INVALID");
    }
    const matchingProducts = products.filter((product) =>
      product.style_id === line.style_id && product.supplier_id === purchaseOrderSupplierId,
    );
    if (matchingProducts.length !== 1) {
      throw new Error("SOURCE_PROVENANCE_INVALID");
    }
    const product = matchingProducts[0];
    if (product.restock_enabled !== true || product.inventory_strategy === "do_not_restock") {
      throw new Error("RESTOCK_DISABLED");
    }
    if (
      product.supplier_moq_packs != null &&
      (!isPositiveInteger(product.supplier_moq_packs) && product.supplier_moq_packs !== 0)
    ) {
      throw new Error("PRODUCT_MOQ_NOT_MET");
    }
    if (typeof product.supplier_moq_packs === "number" && line.recommended_packs < product.supplier_moq_packs) {
      throw new Error("PRODUCT_MOQ_NOT_MET");
    }
    const commercialCost = product.commercial_cost as { landed_cost_per_pack_gbp?: unknown } | null;
    const currentPackCost = commercialCost?.landed_cost_per_pack_gbp;
    if (
      typeof line.pack_cost_gbp !== "number" || !Number.isFinite(line.pack_cost_gbp) || line.pack_cost_gbp <= 0 ||
      typeof line.line_cost_gbp !== "number" || !Number.isFinite(line.line_cost_gbp) || line.line_cost_gbp <= 0 ||
      typeof currentPackCost !== "number" || !Number.isFinite(currentPackCost) || currentPackCost <= 0 ||
      line.pack_cost_gbp !== currentPackCost ||
      line.line_cost_gbp !== line.recommended_packs * currentPackCost
    ) {
      throw new Error("COMMERCIAL_COST_CHANGED");
    }
  }
}

export function validateFixedPackBasketCommercialPolicy(
  order: FixedPackCommercialPolicyOrder,
  lines: FixedPackCommercialPolicyLine[],
  supplier: FixedPackCommercialPolicySupplier | null,
  rule: FixedPackCommercialPolicyRule | null,
): void {
  if (order.currency !== "GBP" || supplier?.currency_code !== "GBP") {
    throw new Error("CURRENCY_NOT_GBP");
  }
  if (!supplier || supplier.id !== order.supplier_id) {
    throw new Error("SOURCE_PROVENANCE_INVALID");
  }
  const basketPacks = lines.reduce((sum, line) => sum + (typeof line.recommended_packs === "number" ? line.recommended_packs : Number.NaN), 0);
  const basketUnits = lines.reduce((sum, line) => sum + (typeof line.recommended_units === "number" ? line.recommended_units : Number.NaN), 0);
  const basketValue = lines.reduce((sum, line) => sum + (typeof line.line_cost_gbp === "number" ? line.line_cost_gbp : Number.NaN), 0);
  if (
    !isPositiveInteger(basketPacks) || !isPositiveInteger(basketUnits) ||
    !Number.isFinite(basketValue) || basketValue <= 0 ||
    !isPositiveInteger(order.total_packs) || order.total_packs !== basketPacks ||
    typeof order.estimated_total_gbp !== "number" || !Number.isFinite(order.estimated_total_gbp) ||
    order.estimated_total_gbp !== basketValue
  ) {
    throw new Error("HEADER_TOTAL_MISMATCH");
  }
  if (rule && rule.minimum_order_packs != null) {
    if (rule.supplier_id !== order.supplier_id || (!isPositiveInteger(rule.minimum_order_packs) && rule.minimum_order_packs !== 0)) {
      throw new Error("SUPPLIER_PACK_MOQ_NOT_MET");
    }
    if (basketPacks < rule.minimum_order_packs) {
      throw new Error("SUPPLIER_PACK_MOQ_NOT_MET");
    }
  }
  if (supplier.minimum_order_value == null) {
    return;
  }
  if (
    typeof supplier.minimum_order_value !== "number" ||
    !Number.isFinite(supplier.minimum_order_value) ||
    supplier.minimum_order_value < 0 ||
    basketValue < supplier.minimum_order_value
  ) {
    throw new Error("SUPPLIER_MIN_VALUE_NOT_MET");
  }
}

const PRESENTATION_PROVENANCE_FIELDS = new Set([
  "productImageUrl", "productImageSource", "productImageCapturedAt",
  "supplierImageUrl", "supplierImageSource", "supplierImageCapturedAt",
  "shopify_image_url",
]);

function provenanceJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(provenanceJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRESENTATION_PROVENANCE_FIELDS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${provenanceJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshotAllocationsMatch(
  snapshot: Record<string, unknown>,
  allocations: FixedPackAllocationConservationAllocation[],
): boolean {
  if (!Array.isArray(snapshot.allocations) || snapshot.allocations.length !== allocations.length) return false;
  const bySize = new Map<string, FixedPackAllocationConservationAllocation>();
  for (const allocation of allocations) {
    if (typeof allocation.normalized_size !== "string" || bySize.has(allocation.normalized_size)) return false;
    bySize.set(allocation.normalized_size, allocation);
  }
  return snapshot.allocations.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const allocation = bySize.get((item as Record<string, unknown>).normalized_size as string);
    return !!allocation &&
      (item as Record<string, unknown>).model_design === allocation.model_design &&
      (item as Record<string, unknown>).variant_id === allocation.variant_id &&
      (item as Record<string, unknown>).shopify_variant_id_snapshot === allocation.shopify_variant_id_snapshot &&
      (item as Record<string, unknown>).shopify_inventory_item_id_snapshot === allocation.shopify_inventory_item_id_snapshot &&
      (item as Record<string, unknown>).units_per_pack === allocation.units_per_pack &&
      (item as Record<string, unknown>).ordered_units === allocation.ordered_units;
  });
}

export function validateFixedPackSourceProvenance(
  purchaseOrderId: unknown,
  lines: FixedPackCommercialPolicyLine[],
  allocations: FixedPackAllocationConservationAllocation[],
  records: FixedPackProvenanceRecord[],
  events: FixedPackProvenanceEvent[],
): void {
  for (const line of lines) {
    const lineAllocations = allocations.filter((allocation) => allocation.purchase_order_line_id === line.id);
    const snapshot = line.source_snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || typeof line.id !== "string") {
      throw new Error("SOURCE_PROVENANCE_INVALID");
    }
    const source = snapshot as Record<string, unknown>;
    const expectedEventType = line.source_recommendation_type === "fixed_pack_purchase_recommendation"
      ? "fixed_pack_recommendation_added_to_draft"
      : line.source_recommendation_type === "manual_fixed_pack_purchase"
        ? "manual_fixed_pack_added_to_draft"
        : null;
    const fingerprint = source.fingerprint;
    if (
      !expectedEventType ||
      source.source_type !== line.source_recommendation_type ||
      typeof fingerprint !== "string" || !/^[a-f0-9]{32}$/.test(fingerprint) ||
      source.supplier_id !== line.supplier_id || source.style_id !== line.style_id ||
      source.recommended_packs !== line.recommended_packs ||
      source.recommended_units !== line.recommended_units || source.units_per_pack !== line.units_per_pack ||
      source.pack_cost_gbp !== line.pack_cost_gbp || source.line_cost_gbp !== line.line_cost_gbp ||
      source.currency !== "GBP" || !snapshotAllocationsMatch(source, lineAllocations) ||
      (line.source_recommendation_type === "fixed_pack_purchase_recommendation" &&
        (!source.recommendation_evidence || typeof source.recommendation_evidence !== "object" || "purchase_order_id" in source)) ||
      (line.source_recommendation_type === "manual_fixed_pack_purchase" &&
        (source.purchase_order_id !== purchaseOrderId || typeof source.pack_definition_updated_at !== "string" || !source.pack_definition_updated_at))
    ) {
      throw new Error("SOURCE_PROVENANCE_INVALID");
    }
    const matchingRecords = records.filter((record) =>
      record.purchase_order_line_id === line.id && record.purchase_order_id === purchaseOrderId &&
      record.style_id === line.style_id && record.fingerprint === fingerprint,
    );
    const matchingEvents = events.filter((event) =>
      event.purchase_order_line_id === line.id && event.event_type === expectedEventType &&
      provenanceJson(event.event_snapshot) === provenanceJson(snapshot),
    );
    if (matchingRecords.length !== 1 || matchingEvents.length !== 1) {
      throw new Error("SOURCE_PROVENANCE_INVALID");
    }
  }
}

function approvalMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getCurrentApprovalQualification(
  purchaseOrderId: string,
): Promise<{
  sourceFamily: "legacy_pi" | "fixed_pack";
  canonicalQualification: CanonicalApprovalQualification | FixedPackApprovalQualification | Record<string, never>;
}> {
  const order = await supabaseAdmin
    .from("vault_purchase_orders")
    .select("id, supplier_id, status, currency, total_packs, estimated_total_gbp")
    .eq("id", purchaseOrderId)
    .maybeSingle();

  if (order.error) throw order.error;
  if (!order.data) throw new Error("Purchase order was not found.");
  if (order.data.status !== "approved" && order.data.status !== "draft") {
    throw new Error(`Purchase order cannot be approved from status '${order.data.status}'.`);
  }
  const orderData = order.data;

  const approvalLines = await supabaseAdmin
    .from("vault_purchase_order_lines")
    .select("source_recommendation_type")
    .eq("purchase_order_id", purchaseOrderId);

  if (approvalLines.error) throw approvalLines.error;

  const sourceFamily = classifyPurchaseOrderApprovalSources(
    (approvalLines.data ?? []).map((line) =>
      typeof line.source_recommendation_type === "string"
        ? line.source_recommendation_type
        : "",
    ),
  );

  if (order.data.status === "approved") {
    return { sourceFamily, canonicalQualification: {} };
  }

  if (sourceFamily === "fixed_pack") {
    const fixedPackLines = await supabaseAdmin
      .from("vault_purchase_order_lines")
      .select("id, supplier_id, style_id, recommended_packs, recommended_units, units_per_pack, pack_cost_gbp, line_cost_gbp, source_recommendation_type, source_snapshot")
      .eq("purchase_order_id", purchaseOrderId);

    if (fixedPackLines.error) throw fixedPackLines.error;

    const fixedPackLineIds = (fixedPackLines.data ?? [])
      .map((line) => line.id)
      .filter((lineId): lineId is string => typeof lineId === "string");
    const fixedPackAllocations = await supabaseAdmin
      .from("vault_purchase_order_line_size_allocations")
      .select("purchase_order_line_id, variant_id, parent_product_id, model_design, normalized_size, shopify_variant_id_snapshot, shopify_inventory_item_id_snapshot, units_per_pack, ordered_units")
      .in("purchase_order_line_id", fixedPackLineIds);

    if (fixedPackAllocations.error) throw fixedPackAllocations.error;

    validateFixedPackAllocationConservation(
      fixedPackLines.data ?? [],
      fixedPackAllocations.data ?? [],
    );
    const currentPackContracts = await loadSupplierStylePackCompositionIntelligence();
    validateFixedPackCurrentPackContract(
      fixedPackLines.data ?? [],
      fixedPackAllocations.data ?? [],
      currentPackContracts,
    );
    const fixedPackVariantIds = (fixedPackAllocations.data ?? [])
      .map((allocation) => allocation.variant_id)
      .filter((variantId): variantId is string => typeof variantId === "string");
    const currentVariants = await supabaseAdmin
      .from("vault_variants")
      .select("id, product_id, model_design, normalized_size, source, source_active, identity_resolution_status, source_variant_id, source_inventory_item_id")
      .in("id", fixedPackVariantIds);

    if (currentVariants.error) throw currentVariants.error;

    validateFixedPackCurrentVariantIdentity(
      fixedPackAllocations.data ?? [],
      currentVariants.data ?? [],
    );
    const [fixedPackCatalogue, fixedPackSupplier, fixedPackRule] = await Promise.all([
      getCatalogueData(),
      supabaseAdmin.from("vault_suppliers").select("id, currency_code, minimum_order_value").eq("id", orderData.supplier_id).maybeSingle(),
      supabaseAdmin.from("vault_supplier_purchasing_rules").select("supplier_id, minimum_order_packs").eq("supplier_id", orderData.supplier_id).maybeSingle(),
    ]);
    if (fixedPackSupplier.error || fixedPackRule.error) {
      throw fixedPackSupplier.error ?? fixedPackRule.error;
    }
    validateFixedPackCurrentCommercialPolicy(
      fixedPackLines.data ?? [],
      fixedPackCatalogue.products,
      orderData.supplier_id,
    );
    validateFixedPackBasketCommercialPolicy(
      orderData,
      fixedPackLines.data ?? [],
      fixedPackSupplier.data ?? null,
      fixedPackRule.data ?? null,
    );
    const [fixedPackProvenance, fixedPackEvents] = await Promise.all([
      supabaseAdmin.from("vault_fixed_pack_draft_idempotency").select("fingerprint, style_id, purchase_order_id, purchase_order_line_id").eq("purchase_order_id", purchaseOrderId),
      supabaseAdmin.from("vault_purchase_order_events").select("purchase_order_line_id, event_type, event_snapshot").eq("purchase_order_id", purchaseOrderId),
    ]);
    if (fixedPackProvenance.error || fixedPackEvents.error) {
      throw fixedPackProvenance.error ?? fixedPackEvents.error;
    }
    validateFixedPackSourceProvenance(
      purchaseOrderId,
      fixedPackLines.data ?? [],
      fixedPackAllocations.data ?? [],
      fixedPackProvenance.data ?? [],
      fixedPackEvents.data ?? [],
    );
    return {
      sourceFamily,
      canonicalQualification: {
        source_family: "fixed_pack",
        purchase_order_id: purchaseOrderId,
        supplier_id: orderData.supplier_id,
        currency_code: "GBP",
        expected_total_packs: orderData.total_packs,
        expected_total_gbp: orderData.estimated_total_gbp,
        lines: (fixedPackLines.data ?? []).map((line) => {
          const source = line.source_snapshot as Record<string, unknown>;
          return {
            purchase_order_line_id: line.id as string,
            source_recommendation_type: line.source_recommendation_type as "fixed_pack_purchase_recommendation" | "manual_fixed_pack_purchase",
            provenance_fingerprint: source.fingerprint as string,
          };
        }),
      },
    };
  }

  const [catalogue, freshness, walletResult, suppliersResult, rulesResult] = await Promise.all([
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

  const sourceError = walletResult.error ?? suppliersResult.error ?? rulesResult.error;
  if (sourceError) throw sourceError;

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
  const canonicalSupplier = suppliers.find((supplier) => supplier.id === orderData.supplier_id);
  const blockers = [...(qualification?.blockers ?? ["Current supplier purchasing qualification is unavailable."])];

  if (basket?.purchasing_state !== "READY_TO_ORDER") {
    blockers.push("supplier_minimum_packs_not_satisfied");
  }

  const productByStyle = new Map(catalogue.products.map((product) => [product.style_id, product]));
  const demandByStyle = new Map(evaluation.demands.map((demand) => [demand.styleId, demand]));
  const canonicalLines = [
    ...(basket?.top_products ?? []).map((line) => ({
      line,
      sourceRecommendationType: "purchase_intelligence_required",
    })),
    ...(basket?.additional_qualifying_products ?? []).map((line) => ({
      line,
      sourceRecommendationType: "purchase_intelligence_bring_forward",
    })),
  ].map(({ line, sourceRecommendationType }) => {
    const product = productByStyle.get(line.style_id);
    const demand = demandByStyle.get(line.style_id);
    const packCost = product?.commercial_cost.landed_cost_per_pack_gbp ?? null;
    const unitsPerPack = demand?.unitsPerPack ?? product?.commercial_cost.units_per_pack ?? null;
    if (packCost === null || unitsPerPack === null || unitsPerPack <= 0) {
      blockers.push(`Canonical commercial evidence is unavailable for '${line.style_id}'.`);
      return null;
    }
    return {
      supplier_id: orderData.supplier_id,
      style_id: line.style_id,
      product_name: line.product_name,
      recommended_packs: line.required_packs,
      recommended_units: line.required_units,
      units_per_pack: unitsPerPack,
      pack_cost_gbp: approvalMoney(packCost),
      line_cost_gbp: approvalMoney(packCost * line.required_packs),
      source_recommendation_type: sourceRecommendationType,
    };
  }).filter((line): line is NonNullable<typeof line> => line !== null);

  const totalPacks = canonicalLines.reduce((sum, line) => sum + line.recommended_packs, 0);
  const totalUnits = canonicalLines.reduce((sum, line) => sum + line.recommended_units, 0);
  const totalGbp = approvalMoney(canonicalLines.reduce((sum, line) => sum + line.line_cost_gbp, 0));

  if (!basket || totalPacks !== basket.intelligent_basket_packs ||
    basket.projected_intelligent_basket_spend === null ||
    totalGbp !== basket.projected_intelligent_basket_spend) {
    blockers.push("Current canonical basket cannot be represented exactly as persisted PO lines.");
  }

  if (totalGbp > 0) {
    const wallet = walletResult.data as PurchasingWalletData;
    const capital = CapitalEngine.reviewPosition({
      ledgerBalanceGbp: wallet.ledger_balance_gbp,
      protectedReserveGbp: wallet.protected_reserve_gbp,
      committedOrdersGbp: wallet.committed_orders_gbp,
      manualSpendingLimitGbp: wallet.manual_spending_limit_gbp,
      proposedPurchaseGbp: totalGbp,
      walletAvailable: true,
      walletLastUpdated: wallet.wallet_last_updated,
    });
    // reserve_override_allowed remains intentionally non-operative until a
    // separately authorised and audited override workflow exists.
    if (!capital.affordable || !capital.reserveProtected) {
      blockers.push("insufficient_reserve_safe_capacity");
    }
  } else {
    blockers.push("supplier_basket_cost_unavailable");
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  if (uniqueBlockers.length > 0 || !qualification || !basket || !canonicalSupplier) {
    throw new Error(`Purchase order approval blocked: ${uniqueBlockers.map(
      (reason) => APPROVAL_REASON_LABELS[reason] ?? reason,
    ).join(" ")}`);
  }

  return {
    sourceFamily,
    canonicalQualification: {
      evaluated_at: new Date().toISOString(),
      supplier_id: orderData.supplier_id,
      supplier_currency: canonicalSupplier.currency,
      supplier_minimum_packs: canonicalSupplier.minimumOrderPacks,
      supplier_minimum_value: canonicalSupplier.minimumOrderValue,
      qualification_state: qualification.state,
      qualification_blockers: qualification.blockers,
      basket_state: basket.purchasing_state,
      total_packs: totalPacks,
      total_units: totalUnits,
      total_gbp: totalGbp,
      lines: canonicalLines,
    },
  };
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

async function getCanonicalPurchaseOrderImages(lines: Array<{ id: string; product_name: string; vault_purchase_order_line_size_allocations?: Array<{ parent_product_id: string | null; model_design: string | null }> | null }>) {
  const identities = new Map<string, { parentProductId: string; modelDesign: string }>();
  for (const line of lines) {
    const values = Array.from(new Map((line.vault_purchase_order_line_size_allocations ?? []).filter(a => a.parent_product_id && a.model_design?.trim()).map(a => [`${a.parent_product_id}|${a.model_design!.trim()}`, { parentProductId: a.parent_product_id!, modelDesign: a.model_design!.trim() }])).values());
    if (values.length === 1) identities.set(line.id, values[0]);
  }
  const productIds = Array.from(new Set(Array.from(identities.values()).map(value => value.parentProductId)));
  const result = new Map<string, { productImageUrl: string | null; productImageAlt: string }>();
  if (!productIds.length) return result;
  const [variantsResult, productsResult] = await Promise.all([
    supabaseAdmin.from("vault_variants").select("product_id, model_design, shopify_image_url").eq("source", "shopify").eq("source_active", true).eq("available_for_sale", true).eq("identity_resolution_status", "resolved").in("product_id", productIds),
    supabaseAdmin.from("vault_products").select("id, featured_image_url").eq("source", "shopify").in("id", productIds),
  ]);
  if (variantsResult.error) throw variantsResult.error;
  if (productsResult.error) throw productsResult.error;
  const parentImages = new Map((productsResult.data ?? []).map(product => [product.id, product.featured_image_url as string | null]));
  for (const line of lines) {
    const identity = identities.get(line.id), productImageAlt = identity ? `${line.product_name} — ${identity.modelDesign}` : line.product_name;
    if (!identity) { result.set(line.id, { productImageUrl: null, productImageAlt }); continue; }
    const relevant = (variantsResult.data ?? []).filter(v => v.product_id === identity.parentProductId && v.model_design?.trim() === identity.modelDesign);
    const urls = Array.from(new Set(relevant.map(v => typeof v.shopify_image_url === "string" ? v.shopify_image_url.trim() : "").filter(Boolean)));
    const exact = relevant.length > 0 && urls.length === 1 && relevant.length === relevant.filter(v => typeof v.shopify_image_url === "string" && v.shopify_image_url.trim()).length;
    result.set(line.id, { productImageUrl: exact ? urls[0] : parentImages.get(identity.parentProductId) ?? null, productImageAlt });
  }
  return result;
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
          *,
          vault_purchase_order_line_size_allocations (
            parent_product_id,
            model_design,
            normalized_size,
            ordered_units
          )
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
          .select("id, product_id, source_variant_id, source_inventory_item_id, title, model_design, normalized_size, identity_resolution_status")
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
  const lineImages = await getCanonicalPurchaseOrderImages(data.vault_purchase_order_lines ?? []);

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
    vault_purchase_order_lines: (data.vault_purchase_order_lines ?? []).map((line: { id: string; product_name: string }) => ({ ...line, ...(lineImages.get(line.id) ?? { productImageUrl: null, productImageAlt: line.product_name }) })),
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
}): Promise<PurchaseOrderApprovalResult> {
  const { sourceFamily, canonicalQualification } = await getCurrentApprovalQualification(
    input.purchaseOrderId,
  );
  const rpcInput = {
    target_purchase_order_id: input.purchaseOrderId,
    target_operator_id: input.operatorId,
    canonical_qualification: canonicalQualification,
  };
  const { data, error } = sourceFamily === "fixed_pack"
    ? await supabaseAdmin.rpc("approve_fixed_pack_vault_purchase_order", rpcInput)
    : await supabaseAdmin.rpc("approve_vault_purchase_order", rpcInput);

  if (error) throw new Error(error.message);
  const result = data?.[0];
  if (!result) {
    throw new Error("Purchase-order approval did not return canonical evidence.");
  }

  return {
    purchaseOrderId: result.purchase_order_id,
    status: "approved",
    approvedByOperatorId: result.approved_by_operator_id,
    approvedAt: result.approved_at,
    transitioned: result.transitioned,
  };
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
