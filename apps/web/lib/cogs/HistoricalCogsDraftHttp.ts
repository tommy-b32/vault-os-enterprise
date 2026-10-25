const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type Operator = { id: string };
type Dependencies = {
  requireOperator: () => Promise<Operator>;
  isOperatorAuthorizationError: (error: unknown) => error is { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" };
  createDraft: (input: { legacyBatchIds: string[]; governedDeliveryBatchIds: string[]; operatorId: string }) => Promise<string>;
};

const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validIds = (value: unknown, size: number): value is string[] =>
  Array.isArray(value) && value.length === size && value.every((id) => typeof id === "string" && uuid.test(id)) && new Set(value.map((id) => id.toLowerCase())).size === size;

export function createHistoricalCogsDraftHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const operator = await dependencies.requireOperator();
      const body = await request.json().catch(() => null);
      if (!own(body) || Object.keys(body).some((key) => key !== "legacyBatchIds" && key !== "governedDeliveryBatchIds") || !validIds(body.legacyBatchIds, 6) || !validIds(body.governedDeliveryBatchIds, 2)) {
        return Response.json({ error: "Invalid historical COGS draft evidence" }, { status: 400 });
      }
      const id = await dependencies.createDraft({ legacyBatchIds: body.legacyBatchIds, governedDeliveryBatchIds: body.governedDeliveryBatchIds, operatorId: operator.id });
      return Response.json({ id, status: "draft", evidence: { legacyBatchCount: 6, governedDeliveryBatchCount: 2 } }, { status: 201 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
      return Response.json({ error: "Historical COGS draft request was rejected" }, { status: 422 });
    }
  };
}
