import type { HistoricalDeliveryInput, HistoricalDeliveryPreview } from "./HistoricalDeliveryPreview.ts";

export type HistoricalDeliveryCorrection = { field: keyof HistoricalDeliveryInput; previous: unknown; value: unknown; reason: string; actor: string; at: string };
export type HistoricalDeliveryApproval = { actor: string; note: string; at: string; validation: "VALID" | "REVIEW"; eligible: boolean };
export type HistoricalDeliveryBatch = { id: string; revision: number; original: HistoricalDeliveryInput; current: HistoricalDeliveryPreview; corrections: HistoricalDeliveryCorrection[]; approval: HistoricalDeliveryApproval | null };
export type HistoricalDeliveryCreate = { original: HistoricalDeliveryInput; current: HistoricalDeliveryPreview; supplierId: string; merchandiseClassId: string; enteredByOperatorId: string };
export type WeightedAverageResult = { status: "CALCULATED" | "UNRESOLVED"; unitLandedCogsGbp: number | null; raw: Record<string, unknown> };

export interface HistoricalDeliveryRepository {
  create(input: HistoricalDeliveryCreate): Promise<HistoricalDeliveryBatch>;
  getById(id: string): Promise<HistoricalDeliveryBatch | null>;
  list(limit: number, offset: number): Promise<HistoricalDeliveryBatch[]>;
  findBySourceReference(supplierId: string, sourceReference: string): Promise<HistoricalDeliveryBatch | null>;
  updateCurrentNormalizedState(id: string, current: HistoricalDeliveryPreview): Promise<void>;
  appendCorrection(id: string, correction: HistoricalDeliveryCorrection): Promise<void>;
  applyCorrection(id: string, expectedRevision: number, current: HistoricalDeliveryPreview, correction: HistoricalDeliveryCorrection): Promise<void>;
  listCorrectionHistory(id: string): Promise<HistoricalDeliveryCorrection[]>;
  appendApproval(id: string, expectedRevision: number, approval: HistoricalDeliveryApproval): Promise<void>;
  listApprovalHistory(id: string): Promise<HistoricalDeliveryApproval[]>;
  getCurrentApprovalCostingState(id: string): Promise<{ approval: HistoricalDeliveryApproval | null; participatesInWeightedAverage: boolean }>;
  getWeightedAverage(orderLineId: string): Promise<WeightedAverageResult>;
}

export class HistoricalDeliveryRepositoryError extends Error {}
export class HistoricalDeliveryDuplicateSourceError extends HistoricalDeliveryRepositoryError { constructor() { super("DUPLICATE_SOURCE_REFERENCE"); } }

const clone = <T>(value: T): T => structuredClone(value);

/** Focused test double. It is deliberately never used by the production factory. */
export class InMemoryHistoricalDeliveryRepository implements HistoricalDeliveryRepository {
  #rows = new Map<string, HistoricalDeliveryBatch>();
  async create(input: HistoricalDeliveryCreate) { const id = crypto.randomUUID(); const row: HistoricalDeliveryBatch = { id, revision: 1, original: clone(input.original), current: clone(input.current), corrections: [], approval: null }; this.#rows.set(id, row); return clone(row); }
  async getById(id: string) { const row = this.#rows.get(id); return row ? clone(row) : null; }
  async list(limit: number, offset: number) { return [...this.#rows.values()].sort((a,b)=>b.id.localeCompare(a.id)).slice(offset,offset+limit).map(clone); }
  async findBySourceReference(_supplierId: string, sourceReference: string) { return [...this.#rows.values()].find((row) => row.current.reference === sourceReference) ? clone([...this.#rows.values()].find((row) => row.current.reference === sourceReference)!) : null; }
  async updateCurrentNormalizedState(id: string, current: HistoricalDeliveryPreview) { const row = this.#rows.get(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); row.current = clone(current); }
  async appendCorrection(id: string, correction: HistoricalDeliveryCorrection) { const row = this.#rows.get(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); row.corrections.push(clone(correction)); }
  async applyCorrection(id: string, expectedRevision: number, current: HistoricalDeliveryPreview, correction: HistoricalDeliveryCorrection) { const row = this.#rows.get(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); if (row.revision !== expectedRevision) throw new HistoricalDeliveryRepositoryError("STALE_HISTORICAL_DELIVERY_WRITE"); row.current = clone({ ...current, participatesInWeightedAverage: false }); row.approval = null; row.corrections.push(clone(correction)); row.revision++; }
  async listCorrectionHistory(id: string) { return clone((this.#rows.get(id)?.corrections) ?? []); }
  async appendApproval(id: string, expectedRevision: number, approval: HistoricalDeliveryApproval) { const row = this.#rows.get(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); if (row.revision !== expectedRevision) throw new HistoricalDeliveryRepositoryError("STALE_HISTORICAL_DELIVERY_WRITE"); row.approval = clone(approval); row.revision++; }
  async listApprovalHistory(id: string) { const approval = this.#rows.get(id)?.approval; return approval ? [clone(approval)] : []; }
  async getCurrentApprovalCostingState(id: string) { const row = this.#rows.get(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); return { approval: clone(row.approval), participatesInWeightedAverage: row.current.participatesInWeightedAverage }; }
  async getWeightedAverage(_orderLineId: string): Promise<WeightedAverageResult> { throw new HistoricalDeliveryRepositoryError("WEIGHTED_AVERAGE_NOT_CONFIGURED"); }
}

type SupabaseError = { message: string };
type SupabaseResult<T> = { data: T | null; error: SupabaseError | null };
type SupabaseFilter = { eq(column: string, value: unknown): SupabaseFilter; order(column: string, options?: { ascending?: boolean }): SupabaseFilter & PromiseLike<SupabaseResult<unknown[]>>; range(from: number, to: number): PromiseLike<SupabaseResult<unknown[]>>; maybeSingle(): PromiseLike<SupabaseResult<unknown>> };
type SupabaseTable = { select(columns: string): SupabaseFilter; update(values: Record<string, unknown>): { eq(column: string, value: unknown): Promise<SupabaseResult<unknown>> } };
type HistoricalDeliveryBatchRow = { id: string; revision: number | string | null; original_import: HistoricalDeliveryInput; merchandise_class_id: string; supplier_order_date: string; received_at: string | null; received_quantity: number | string; goods_cost_gbp: number | string; inbound_shipping_gbp: number | string; stated_landed_total_gbp: number | string | null; unit_purchase_price_gbp: number | string | null; receipt_status: HistoricalDeliveryInput["status"]; source_reference: string; source_document_reference: string; note: string | null; validation_status: HistoricalDeliveryPreview["validation"]; validation_reasons: string[] | null; landed_cost_gbp: number | string; approval_status: string; approved_at: string | null; approved_by_operator_id: string | null };
type HistoricalDeliveryCorrectionRow = { field_name: HistoricalDeliveryCorrection["field"]; previous_value: unknown; replacement_value: unknown; reason: string; corrected_by_operator_id: string; corrected_at: string };
type HistoricalDeliveryApprovalRow = { approval_note: string; validation_status: HistoricalDeliveryApproval["validation"]; approved_by_operator_id: string; approved_at: string };
type HistoricalDeliverySupabaseOperations = { from(table: string): SupabaseTable; rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult<unknown>> };
export type HistoricalDeliverySupabaseClient = object;
const fail = (error: { message: string } | null, fallback: string): never => { throw new HistoricalDeliveryRepositoryError(error?.message || fallback); };
const dbCurrent = (input: HistoricalDeliveryPreview) => ({ merchandise_class_id: input.costClass, source_reference: input.reference, source_document_reference: input.sourceDocumentReference, supplier_order_date: input.orderDate, received_at: input.receivedDate ?? null, received_quantity: input.quantity, goods_cost_gbp: input.goods, inbound_shipping_gbp: input.shipping, other_direct_landed_gbp: 0, stated_landed_total_gbp: input.statedTotal ?? null, unit_purchase_price_gbp: input.unitPrice ?? null, receipt_status: input.status, validation_status: input.validation, validation_reasons: input.messages, approval_status: "PENDING", note: input.note ?? null });
const fromRow = (value: unknown): HistoricalDeliveryBatch => {
  const row = value as HistoricalDeliveryBatchRow;
  const original = row.original_import as HistoricalDeliveryInput;
  const current: HistoricalDeliveryPreview = { ...original, supplier: original.supplier, costClass: row.merchandise_class_id, orderDate: row.supplier_order_date, receivedDate: row.received_at?.slice(0, 10) ?? undefined, quantity: Number(row.received_quantity), goods: Number(row.goods_cost_gbp), shipping: Number(row.inbound_shipping_gbp), statedTotal: row.stated_landed_total_gbp === null ? undefined : Number(row.stated_landed_total_gbp), unitPrice: row.unit_purchase_price_gbp === null ? undefined : Number(row.unit_purchase_price_gbp), status: row.receipt_status, reference: row.source_reference, sourceDocumentReference: row.source_document_reference, note: row.note ?? undefined, validation: row.validation_status, messages: row.validation_reasons ?? [], expectedGoods: null, goodsDiscrepancy: null, expectedTotal: Number(row.goods_cost_gbp) + Number(row.inbound_shipping_gbp), totalDiscrepancy: null, landedUnitCost: Number(row.landed_cost_gbp) / Number(row.received_quantity), eligibleForApproval: row.validation_status === "VALID" && row.receipt_status === "RECEIVED", participatesInWeightedAverage: row.validation_status === "VALID" && row.receipt_status === "RECEIVED" && row.approval_status === "APPROVED" };
  const approval = row.approved_at ? { actor: row.approved_by_operator_id, note: "", at: row.approved_at, validation: row.validation_status, eligible: current.participatesInWeightedAverage } as HistoricalDeliveryApproval : null;
  return { id: row.id, revision: Number(row.revision ?? 1), original: clone(original), current, corrections: [], approval };
};

export class SupabaseHistoricalDeliveryRepository implements HistoricalDeliveryRepository {
  private readonly client: HistoricalDeliverySupabaseOperations;
  constructor(client: HistoricalDeliverySupabaseClient) { this.client = client as HistoricalDeliverySupabaseOperations; }
  async create(input: HistoricalDeliveryCreate) { const { data, error } = await this.client.rpc("stage_governed_historical_delivery_cost_batch", { p_supplier_id: input.supplierId, p_merchandise_class_id: input.merchandiseClassId, p_entered_by_operator_id: input.enteredByOperatorId, p_original_import: input.original, p_normalized: dbCurrent(input.current) }); if (error) { if (error.message?.includes("DUPLICATE")) throw new HistoricalDeliveryDuplicateSourceError(); fail(error, "HISTORICAL_DELIVERY_CREATE_FAILED"); } const batch = await this.getById(String(data)); if (!batch) throw new HistoricalDeliveryRepositoryError("HISTORICAL_DELIVERY_CREATE_FAILED"); return batch; }
  async getById(id: string) { const { data, error } = await this.client.from("vault_historical_delivery_cost_batches").select("*").eq("id", id).maybeSingle(); if (error) fail(error, "HISTORICAL_DELIVERY_READ_FAILED"); return data ? fromRow(data) : null; }
  async list(limit: number, offset: number) { const { data, error } = await this.client.from("vault_historical_delivery_cost_batches").select("*").order("entered_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1); if (error) fail(error, "HISTORICAL_DELIVERY_READ_FAILED"); return (data ?? []).map(fromRow); }
  async findBySourceReference(supplierId: string, sourceReference: string) { const { data, error } = await this.client.from("vault_historical_delivery_cost_batches").select("*").eq("supplier_id", supplierId).eq("source_reference", sourceReference).maybeSingle(); if (error) fail(error, "HISTORICAL_DELIVERY_READ_FAILED"); return data ? fromRow(data) : null; }
  async updateCurrentNormalizedState(id: string, current: HistoricalDeliveryPreview) { const { error } = await this.client.from("vault_historical_delivery_cost_batches").update(dbCurrent(current)).eq("id", id); if (error) fail(error, "HISTORICAL_DELIVERY_UPDATE_FAILED"); }
  async appendCorrection(_id: string, _correction: HistoricalDeliveryCorrection) { throw new HistoricalDeliveryRepositoryError("HISTORICAL_DELIVERY_CORRECTION_MUST_USE_TRANSACTION_RPC"); }
  async applyCorrection(id: string, expectedRevision: number, current: HistoricalDeliveryPreview, correction: HistoricalDeliveryCorrection) { const { error } = await this.client.rpc("correct_governed_historical_delivery_cost_batch", { p_batch_id: id, p_expected_revision: expectedRevision, p_field_name: correction.field, p_normalized: dbCurrent(current), p_reason: correction.reason, p_actor_id: correction.actor }); if (error) fail(error, "HISTORICAL_DELIVERY_CORRECTION_FAILED"); }
  async listCorrectionHistory(id: string) { const { data, error } = await this.client.from("vault_historical_delivery_cost_batch_corrections").select("field_name,previous_value,replacement_value,reason,corrected_by_operator_id,corrected_at").eq("batch_id", id).order("corrected_at"); if (error) fail(error, "HISTORICAL_DELIVERY_CORRECTION_READ_FAILED"); return (data ?? []).map((value: unknown) => { const row = value as HistoricalDeliveryCorrectionRow; return { field: row.field_name, previous: row.previous_value, value: row.replacement_value, reason: row.reason, actor: row.corrected_by_operator_id, at: row.corrected_at }; }); }
  async appendApproval(id: string, expectedRevision: number, approval: HistoricalDeliveryApproval) { const { error } = await this.client.rpc("approve_governed_historical_delivery_cost_batch", { p_batch_id: id, p_expected_revision: expectedRevision, p_note: approval.note, p_actor_id: approval.actor }); if (error) fail(error, "HISTORICAL_DELIVERY_APPROVAL_FAILED"); }
  async listApprovalHistory(id: string) { const { data, error } = await this.client.from("vault_historical_delivery_cost_batch_approvals").select("approval_note,validation_status,approved_by_operator_id,approved_at").eq("batch_id", id).order("approved_at"); if (error) fail(error, "HISTORICAL_DELIVERY_APPROVAL_READ_FAILED"); return (data ?? []).map((value: unknown) => { const row = value as HistoricalDeliveryApprovalRow; return { actor: row.approved_by_operator_id, note: row.approval_note, at: row.approved_at, validation: row.validation_status, eligible: row.validation_status === "VALID" }; }); }
  async getCurrentApprovalCostingState(id: string) { const batch = await this.getById(id); if (!batch) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); return { approval: batch.approval, participatesInWeightedAverage: batch.current.participatesInWeightedAverage }; }
  async getWeightedAverage(orderLineId: string): Promise<WeightedAverageResult> { const { data, error } = await this.client.rpc("get_governed_weighted_average_landed_cogs", { p_order_line_id: orderLineId }); if (error || !data || typeof data !== "object") fail(error, "WEIGHTED_AVERAGE_QUERY_FAILED"); const raw = data as Record<string, unknown>; const status: WeightedAverageResult["status"] = raw.status === "CALCULATED" ? "CALCULATED" : "UNRESOLVED"; return { status, unitLandedCogsGbp: typeof raw.unit_landed_cogs_gbp === "number" ? raw.unit_landed_cogs_gbp : raw.unit_landed_cogs_gbp === null ? null : Number(raw.unit_landed_cogs_gbp), raw }; }
}
