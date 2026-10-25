import { HistoricalDeliveryRepositoryError } from "./HistoricalDeliveryRepository.ts";
import type { HistoricalDeliveryInput } from "./HistoricalDeliveryPreview.ts";
import type { HistoricalDeliveryService } from "./HistoricalDeliveryService.ts";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fields = new Set<keyof HistoricalDeliveryInput>(["receivedDate", "quantity", "goods", "shipping", "statedTotal", "unitPrice", "status", "reference", "note"]);
const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, allowed: readonly string[]) => Object.keys(value).every((key) => allowed.includes(key));
const string = (value: unknown, min = 1, max = 2000) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;
const revision = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

type Dependencies = {
  requireOperator: () => Promise<{ id: string }>;
  isOperatorAuthorizationError: (error: unknown) => error is { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" };
  loadClasses: () => Promise<ReadonlySet<string>>;
  createService: (classes: ReadonlySet<string>) => HistoricalDeliveryService;
};

function receipt(value: unknown): HistoricalDeliveryInput | null {
  if (!own(value) || !exact(value, ["supplier", "costClass", "orderDate", "receivedDate", "quantity", "goods", "shipping", "statedTotal", "unitPrice", "status", "reference", "sourceDocumentReference", "note"])) return null;
  const supplier = string(value.supplier), costClass = string(value.costClass, 1, 120), orderDate = string(value.orderDate, 10, 10), receivedDate = string(value.receivedDate, 10, 10), reference = string(value.reference), sourceDocumentReference = string(value.sourceDocumentReference);
  if (!supplier || !costClass || !orderDate || !receivedDate || !reference || !sourceDocumentReference || typeof value.quantity !== "number" || typeof value.goods !== "number" || typeof value.shipping !== "number" || typeof value.statedTotal !== "number" || (value.unitPrice !== undefined && typeof value.unitPrice !== "number") || typeof value.status !== "string" || !["RECEIVED", "SEIZED", "NOT_RECEIVED", "CANCELLED", "REVIEW"].includes(value.status) || (value.note !== undefined && typeof value.note !== "string")) return null;
  return { supplier, costClass, orderDate, receivedDate, quantity: value.quantity, goods: value.goods, shipping: value.shipping, statedTotal: value.statedTotal, unitPrice: value.unitPrice as number | undefined, status: value.status as HistoricalDeliveryInput["status"], reference, sourceDocumentReference, note: value.note?.trim() || undefined };
}

const responseError = (error: unknown, dependencies: Dependencies) => {
  if (dependencies.isOperatorAuthorizationError(error)) return Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
  if (error instanceof HistoricalDeliveryRepositoryError) return Response.json({ error: "Historical receipt request was rejected" }, { status: /STALE|DUPLICATE/.test(error.message) ? 409 : 422 });
  return Response.json({ error: "Historical receipt request is unavailable" }, { status: 500 });
};

export function createHistoricalDeliveryHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const operator = await dependencies.requireOperator();
      const body = await request.json().catch(() => null);
      if (!own(body) || typeof body.action !== "string") return Response.json({ error: "Invalid historical receipt request" }, { status: 400 });
      const service = dependencies.createService(await dependencies.loadClasses());
      if (body.action === "stage" && exact(body, ["action", "supplierId", "merchandiseClassId", "receipt"]) && typeof body.supplierId === "string" && uuid.test(body.supplierId) && typeof body.merchandiseClassId === "string") {
        const input = receipt(body.receipt);
        if (!input || input.costClass !== body.merchandiseClassId) return Response.json({ error: "Invalid historical receipt evidence" }, { status: 400 });
        const id = await service.persist(input, { supplierId: body.supplierId, merchandiseClassId: body.merchandiseClassId, enteredByOperatorId: operator.id });
        return Response.json({ id, status: "pending_review" }, { status: 201 });
      }
      const expectedRevision = revision(body.expectedRevision);
      if (body.action === "correct" && exact(body, ["action", "batchId", "expectedRevision", "field", "value", "reason"]) && typeof body.batchId === "string" && uuid.test(body.batchId) && expectedRevision !== null && typeof body.field === "string" && fields.has(body.field as keyof HistoricalDeliveryInput)) {
        const reason = string(body.reason, 1, 2000); if (!reason) return Response.json({ error: "Invalid historical receipt correction" }, { status: 400 });
        const result = await service.correct(body.batchId, expectedRevision, body.field as keyof HistoricalDeliveryInput, body.value, reason, operator.id);
        return Response.json({ validation: result.validation, revision: expectedRevision + 1 });
      }
      if (body.action === "approve" && exact(body, ["action", "batchId", "expectedRevision", "note"]) && typeof body.batchId === "string" && uuid.test(body.batchId) && expectedRevision !== null) {
        const note = string(body.note, 1, 2000); if (!note) return Response.json({ error: "Invalid historical receipt approval" }, { status: 400 });
        await service.approve(body.batchId, expectedRevision, operator.id, note);
        return Response.json({ status: "approved", revision: expectedRevision + 1 });
      }
      return Response.json({ error: "Invalid historical receipt request" }, { status: 400 });
    } catch (error) { return responseError(error, dependencies); }
  };
}
