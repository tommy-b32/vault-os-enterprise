const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Operator = { id: string };
type Input = { draftPolicyVersionId: string; subjectOrderLineId: string; refundLineObservationIds: string[]; disposition: "retained_sale" | "returned_restocked"; ownerAttestation: string };
type Dependencies = { requireOwner: () => Promise<Operator>; isOperatorAuthorizationError: (error: unknown) => error is { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" }; record: (input: Input & { operatorId: string }) => Promise<string> };
const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const valid = (value: unknown): value is Input => own(value) && Object.keys(value).length === 5 && ["draftPolicyVersionId","subjectOrderLineId","refundLineObservationIds","disposition","ownerAttestation"].every((key) => Object.hasOwn(value,key))
  && [value.draftPolicyVersionId,value.subjectOrderLineId].every((id) => typeof id === "string" && uuid.test(id))
  && Array.isArray(value.refundLineObservationIds) && value.refundLineObservationIds.length > 0 && value.refundLineObservationIds.every((id) => typeof id === "string" && uuid.test(id)) && new Set(value.refundLineObservationIds.map((id) => id.toLowerCase())).size === value.refundLineObservationIds.length
  && (value.disposition === "retained_sale" || value.disposition === "returned_restocked") && typeof value.ownerAttestation === "string" && value.ownerAttestation.trim().length > 0;

export function createHistoricalCogsRefundDispositionHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const owner = await dependencies.requireOwner();
      const body = await request.json().catch(() => null);
      if (!valid(body)) return Response.json({ error: "Invalid historical COGS refund disposition" }, { status: 400 });
      const id = await dependencies.record({ ...body, operatorId: owner.id });
      return Response.json({ id, status: "attested", attribution: "not_changed", inventory: "not_changed" }, { status: 201 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
      return Response.json({ error: "Historical COGS refund disposition was rejected" }, { status: 422 });
    }
  };
}
