import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PendingCatalogueSizeInput = {
  supplierSizeLabel: string;
  normalizedSize: string;
  orderedUnits: number;
  unitsPerPack?: number;
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
  orderedUnits?: number;
  unitCostGbp?: number;
  costTypeId?: string;
  packProfileId?: string;
  packCount?: number;
  sizes: PendingCatalogueSizeInput[];
  idempotencyKey: string;
};

export type PendingCatalogueGovernedOption = {
  costTypeId: string;
  costTypeName: string;
  packProfileId: string;
  packProfileName: string;
  unitsPerPack: number;
  supplierCurrency: string;
  commercialState: "complete_landed_cost" | "merchandise_only_landed_cost_pending";
  merchandisePackCost: number;
  exchangeRateToGbp: number | null;
  shippingCostPerPack: number | null;
  importCostPerPack: number | null;
  landedCostPerPackGbp: number | null;
};

export type PendingCatalogueDuplicateCandidate = { id: string; workingTitle: string; supplierReference: string | null; colourModel: string | null; status: string };

export type PendingCatalogueDraftResult =
  | { success: true; purchaseOrderId: string; purchaseOrderLineId: string; pendingCatalogueProductId: string; idempotent: boolean }
  | { success: false; code: "request_invalid" | "po_not_found" | "po_not_draft" | "supplier_mismatch" | "po_not_pending_compatible" | "commercial_evidence_unavailable" | "idempotency_conflict" | "operation_failed"; message: string };

type Dependencies = { client: typeof supabaseAdmin };
const productionDependencies: Dependencies = { client: supabaseAdmin };
const mixedDraftSourceTypes = new Set([
  "fixed_pack_purchase_recommendation",
  "manual_fixed_pack_purchase",
  "pending_catalogue_purchase",
]);

function isMixedDraftSourceType(value: unknown): value is string {
  return typeof value === "string" && mixedDraftSourceTypes.has(value);
}

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

export async function loadPendingCatalogueGovernedOptions(
  supplierId: string,
  client: typeof supabaseAdmin = supabaseAdmin,
): Promise<PendingCatalogueGovernedOption[]> {
  const [profiles, merchandiseEvidence, types, packs, compatibilities] = await Promise.all([
    client.from("vault_supplier_product_type_cost_profiles").select("id,cost_type_id,supplier_currency,exchange_rate_to_gbp,pack_cost,shipping_cost_per_pack,import_cost_per_pack,units_per_pack").eq("supplier_id", supplierId).eq("active", true),
    client.from("vault_supplier_product_type_merchandise_cost_evidence").select("id,cost_type_id,pack_profile_id,supplier_currency,merchandise_pack_cost,cost_scope,shipping_evidence_status").eq("supplier_id", supplierId),
    client.from("vault_cost_types").select("id,display_name").eq("active", true),
    client.from("vault_pack_profiles").select("id,display_name,units_per_pack").eq("active", true).not("units_per_pack", "is", null),
    client.from("vault_cost_type_pack_profile_compatibilities").select("cost_type_id,pack_profile_id").eq("active", true),
  ]);
  if (profiles.error || merchandiseEvidence.error || types.error || packs.error || compatibilities.error) throw profiles.error ?? merchandiseEvidence.error ?? types.error ?? packs.error ?? compatibilities.error;
  const names = new Map((types.data ?? []).map((row: any) => [row.id, row.display_name]));
  const compatiblePairs = new Set((compatibilities.data ?? []).map((row: any) => `${row.cost_type_id}:${row.pack_profile_id}`));
  const packsByUnits = new Map<number, any[]>();
  for (const pack of packs.data ?? []) {
    const group = packsByUnits.get(pack.units_per_pack) ?? [];
    group.push(pack); packsByUnits.set(pack.units_per_pack, group);
  }
  const complete = (profiles.data ?? []).flatMap((profile: any) => {
    const matchingPacks = (packsByUnits.get(profile.units_per_pack) ?? []).filter((pack) => compatiblePairs.has(`${profile.cost_type_id}:${pack.id}`));
    const costTypeName = names.get(profile.cost_type_id);
    if (!matchingPacks.length || !costTypeName || !Number.isInteger(profile.units_per_pack) || profile.units_per_pack <= 0) return [];
    const landed = Number(profile.pack_cost) + Number(profile.shipping_cost_per_pack) + Number(profile.import_cost_per_pack);
    return matchingPacks.map((pack) => ({ costTypeId: profile.cost_type_id, costTypeName, packProfileId: pack.id, packProfileName: pack.display_name, unitsPerPack: profile.units_per_pack, supplierCurrency: profile.supplier_currency, commercialState: "complete_landed_cost" as const, merchandisePackCost: Number(profile.pack_cost), exchangeRateToGbp: Number(profile.exchange_rate_to_gbp), shippingCostPerPack: Number(profile.shipping_cost_per_pack), importCostPerPack: Number(profile.import_cost_per_pack), landedCostPerPackGbp: Math.round(landed * Number(profile.exchange_rate_to_gbp) * 100) / 100 }));
  });
  const completePairs = new Set(complete.map((option) => `${option.costTypeId}:${option.packProfileId}`));
  const merchandiseOnly = (merchandiseEvidence.data ?? []).flatMap((evidence: any) => {
    const pair = `${evidence.cost_type_id}:${evidence.pack_profile_id}`;
    const pack = (packs.data ?? []).find((candidate: any) => candidate.id === evidence.pack_profile_id);
    const costTypeName = names.get(evidence.cost_type_id);
    if (completePairs.has(pair) || !costTypeName || !pack || !compatiblePairs.has(pair) || evidence.cost_scope !== "merchandise_only" || evidence.shipping_evidence_status !== "unknown" || !Number.isInteger(pack.units_per_pack) || pack.units_per_pack <= 0 || !Number.isFinite(Number(evidence.merchandise_pack_cost)) || Number(evidence.merchandise_pack_cost) <= 0) return [];
    return [{ costTypeId: evidence.cost_type_id, costTypeName, packProfileId: pack.id, packProfileName: pack.display_name, unitsPerPack: pack.units_per_pack, supplierCurrency: evidence.supplier_currency, commercialState: "merchandise_only_landed_cost_pending" as const, merchandisePackCost: Number(evidence.merchandise_pack_cost), exchangeRateToGbp: null, shippingCostPerPack: null, importCostPerPack: null, landedCostPerPackGbp: null }];
  });
  return [...complete, ...merchandiseOnly].sort((left, right) => left.costTypeName.localeCompare(right.costTypeName) || left.packProfileName.localeCompare(right.packProfileName));
}

async function resolveGovernedCommercialState(client: typeof supabaseAdmin, supplierId: string, costTypeId: string, packProfileId: string): Promise<"complete_landed_cost" | "merchandise_only_landed_cost_pending"> {
  const option = (await loadPendingCatalogueGovernedOptions(supplierId, client)).find((candidate) => candidate.costTypeId === costTypeId && candidate.packProfileId === packProfileId);
  if (!option) return fail("commercial_evidence_unavailable", "No governed commercial evidence is available for this product type and pack profile.");
  return option.commercialState;
}

export async function loadPendingCatalogueDuplicateCandidates(
  supplierId: string,
  client: typeof supabaseAdmin = supabaseAdmin,
): Promise<PendingCatalogueDuplicateCandidate[]> {
  const { data, error } = await client.from("vault_pending_catalogue_products")
    .select("id,working_title,supplier_reference,colour_model,status")
    .eq("supplier_id", supplierId).in("status", ["pending", "linked"]).order("created_at", { ascending: false }).range(0, 99);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ id: row.id, workingTitle: row.working_title, supplierReference: row.supplier_reference, colourModel: row.colour_model, status: row.status }));
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
    const governed = Boolean(clean(input.costTypeId) || clean(input.packProfileId) || input.packCount !== undefined);
    if (!purchaseOrderId || !workingTitle || !modelDesign || !idempotencyKey || idempotencyKey.length > 200 || !Array.isArray(input.sizes) || input.sizes.length === 0) fail("request_invalid", "Enter a product, model/design, and exact size composition.");
    if (governed && (!clean(input.costTypeId) || !clean(input.packProfileId) || !Number.isSafeInteger(input.packCount) || input.packCount! <= 0)) fail("request_invalid", "Select a governed product type, pack profile, and positive pack count.");
    if (!governed && (!Number.isSafeInteger(input.orderedUnits) || input.orderedUnits! <= 0 || !validMoney(input.unitCostGbp))) fail("request_invalid", "Enter a positive ordered quantity and unit cost.");
    const sizes = input.sizes.map((size) => ({
      supplierSizeLabel: clean(size?.supplierSizeLabel),
      normalizedSize: clean(size?.normalizedSize),
      orderedUnits: size?.orderedUnits,
      unitsPerPack: size?.unitsPerPack,
    }));
    if (sizes.some((size) => !size.supplierSizeLabel || !size.normalizedSize || !Number.isSafeInteger(governed ? size.unitsPerPack : size.orderedUnits) || (governed ? size.unitsPerPack! : size.orderedUnits) <= 0)
      || new Set(sizes.map((size) => size.normalizedSize)).size !== sizes.length
      || (!governed && sizes.reduce((total, size) => total + size.orderedUnits, 0) !== input.orderedUnits)) {
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
    if ((purchaseOrder.vault_purchase_order_lines ?? []).some((line) => !isMixedDraftSourceType(line.source_recommendation_type))) {
      fail("po_not_pending_compatible", "New catalogue products require a governed fixed-pack, manual fixed-pack, or pending-catalogue draft.");
    }
    const { data: supplier, error: supplierError } = await dependencies.client
      .from("vault_suppliers")
      .select("id,is_active")
      .eq("id", purchaseOrder.supplier_id)
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier?.is_active || supplier.id !== purchaseOrder.supplier_id) return fail("supplier_mismatch", "The draft supplier is unavailable.");

    const commercialState = governed ? await resolveGovernedCommercialState(dependencies.client, purchaseOrder.supplier_id, clean(input.costTypeId), clean(input.packProfileId)) : "complete_landed_cost";
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
      ...(governed ? { cost_type_id: clean(input.costTypeId), pack_profile_id: clean(input.packProfileId), pack_count: input.packCount, sizes: sizes.map((size) => ({ supplier_size_label: size.supplierSizeLabel, normalized_size: size.normalizedSize, units_per_pack: size.unitsPerPack })) } : { ordered_units: input.orderedUnits, unit_cost_gbp: input.unitCostGbp, sizes: sizes.map((size) => ({ supplier_size_label: size.supplierSizeLabel, normalized_size: size.normalizedSize, ordered_units: size.orderedUnits })) }),
    };
    const rpcName = commercialState === "merchandise_only_landed_cost_pending" ? "create_pending_catalogue_merchandise_only_purchase_line" : "create_pending_catalogue_purchase_line";
    const { data, error } = await dependencies.client.rpc(rpcName, { authoritative_payload: payload });
    if (error && commercialState === "merchandise_only_landed_cost_pending") {
  console.error("MERCHANDISE_ONLY_PENDING_CATALOGUE_RPC_ERROR", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
}
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
