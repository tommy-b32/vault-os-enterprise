import { previewHistoricalDelivery, type HistoricalDeliveryInput, type HistoricalDeliveryPreview } from "./HistoricalDeliveryPreview.ts";
import { HistoricalDeliveryDuplicateSourceError, HistoricalDeliveryRepositoryError, type HistoricalDeliveryApproval, type HistoricalDeliveryBatch, type HistoricalDeliveryRepository } from "./HistoricalDeliveryRepository.ts";

export type HistoricalDeliveryPersistenceContext = { supplierId: string; merchandiseClassId: string; enteredByOperatorId: string };

/** Business rules only; all persistence is delegated to the injected repository. */
export class HistoricalDeliveryService {
  private readonly classes: ReadonlySet<string>;
  private readonly repository: HistoricalDeliveryRepository;
  constructor(classes: ReadonlySet<string>, repository: HistoricalDeliveryRepository) { this.classes = classes; this.repository = repository; }
  async persist(input: HistoricalDeliveryInput, context: HistoricalDeliveryPersistenceContext): Promise<string> {
    let existing: HistoricalDeliveryBatch | null;
    try { existing = await this.repository.findBySourceReference(context.supplierId, input.reference); }
    catch { throw new HistoricalDeliveryRepositoryError("HISTORICAL_DELIVERY_PERSIST_FAILED"); }
    const preview = previewHistoricalDelivery(input, this.classes, new Set(existing ? [input.reference] : []));
    if (existing) throw new HistoricalDeliveryDuplicateSourceError();
    try { return (await this.repository.create({ original: structuredClone(input), current: preview, ...context })).id; }
    catch (error) { if (error instanceof HistoricalDeliveryDuplicateSourceError) throw error; throw new HistoricalDeliveryRepositoryError("HISTORICAL_DELIVERY_PERSIST_FAILED"); }
  }
  async get(id: string): Promise<HistoricalDeliveryBatch> { const row = await this.repository.getById(id); if (!row) throw new HistoricalDeliveryRepositoryError("BATCH_NOT_FOUND"); row.corrections = await this.repository.listCorrectionHistory(id); const approvals = await this.repository.listApprovalHistory(id); row.approval = approvals.at(-1) ?? row.approval; return row; }
  async list(limit: number, offset: number): Promise<HistoricalDeliveryBatch[]> {
    const rows = await this.repository.list(limit, offset);
    return Promise.all(rows.map(async (row) => {
      row.corrections = await this.repository.listCorrectionHistory(row.id);
      const approvals = await this.repository.listApprovalHistory(row.id);
      row.approval = approvals.at(-1) ?? row.approval;
      return row;
    }));
  }
  async correct(id: string, expectedRevision: number, field: keyof HistoricalDeliveryInput, value: unknown, reason: string, actor: string): Promise<HistoricalDeliveryPreview> {
    const row = await this.get(id); if (row.revision !== expectedRevision) throw new HistoricalDeliveryRepositoryError("STALE_HISTORICAL_DELIVERY_WRITE"); const previous = row.current[field]; const next = previewHistoricalDelivery({ ...row.current, [field]: value } as HistoricalDeliveryInput, this.classes, new Set());
    await this.repository.applyCorrection(id, expectedRevision, next, { field, previous, value, reason, actor, at: new Date().toISOString() });
    return { ...next, participatesInWeightedAverage: false };
  }
  async approve(id: string, expectedRevision: number, actor: string, note: string): Promise<HistoricalDeliveryApproval> {
    const row = await this.get(id); if (row.revision !== expectedRevision) throw new HistoricalDeliveryRepositoryError("STALE_HISTORICAL_DELIVERY_WRITE"); const preview = row.current;
    if (preview.validation !== "VALID" || preview.status !== "RECEIVED") throw new HistoricalDeliveryRepositoryError("APPROVAL_VALIDATION_REQUIRED");
    const approval: HistoricalDeliveryApproval = { actor, note, at: new Date().toISOString(), validation: preview.validation, eligible: true };
    await this.repository.appendApproval(id, expectedRevision, approval);
    return approval;
  }
}
