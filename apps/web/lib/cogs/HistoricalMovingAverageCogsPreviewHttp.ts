import type { HistoricalMovingAverageDataSource } from "./HistoricalMovingAverageCogsLoaderCore.ts";
import { loadHistoricalMovingAverageCogs } from "./HistoricalMovingAverageCogsLoaderCore.ts";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Dependencies = Readonly<{
  requireOperator: () => Promise<{ id: string }>;
  isOperatorAuthorizationError: (error: unknown) => error is { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" };
  source: HistoricalMovingAverageDataSource;
  persist?: (preview: Awaited<ReturnType<typeof loadHistoricalMovingAverageCogs>>, operatorId: string) => Promise<string>;
}>;

/** Authenticated, read-only preview. It has no review/approval or write dependency. */
export function createHistoricalMovingAverageCogsPreviewHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      await dependencies.requireOperator();
      const url = new URL(request.url);
      const draftId = url.searchParams.get("draftId");
      if (!draftId || !uuid.test(draftId) || [...url.searchParams.keys()].some((key) => key !== "draftId")) return Response.json({ error: "Invalid historical COGS preview query" }, { status: 400 });
      const preview = await loadHistoricalMovingAverageCogs(dependencies.source, draftId);
      const { result } = preview;
      return Response.json({
        status: preview.state,
        draftId: preview.draftPolicyVersionId,
        hashes: preview.hashes,
        counts: { receipts: result.receiptCount, sales: result.saleLineCount, calculated: result.calculatedLineCount, returnedRestocked: result.returnedRestockedLineCount, unresolved: result.unresolvedLineCount, sameDayReceiptWarnings: result.flagCounts.SAME_DAY_RECEIPT_ORDER_AMBIGUOUS ?? 0 },
        totals: { simulatedCogsGbp: result.simulatedCogsGbp, existingPolicyCogsGbp: result.existingPolicyCogsGbp, varianceGbp: result.varianceGbp, closingInventoryUnits: result.closingInventoryUnits, closingInventoryLandedGbp: result.closingInventoryLandedGbp },
        missingEvidence: { dispositionSaleLineIds: preview.missingDispositionSaleLineIds },
      });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
      return Response.json({ error: "Historical COGS preview was rejected" }, { status: 422 });
    }
  };
}

export function createHistoricalMovingAverageCogsPreviewPersistenceHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const operator = await dependencies.requireOperator();
      const url = new URL(request.url); const draftId = url.searchParams.get("draftId");
      if (!draftId || !uuid.test(draftId) || [...url.searchParams.keys()].some((key) => key !== "draftId") || !dependencies.persist) return Response.json({ error: "Invalid historical COGS preview query" }, { status: 400 });
      const preview = await loadHistoricalMovingAverageCogs(dependencies.source, draftId);
      if (preview.state !== "complete") return Response.json({ error: "Historical COGS preview is incomplete", missingEvidence: { dispositionSaleLineIds: preview.missingDispositionSaleLineIds } }, { status: 422 });
      const id = await dependencies.persist(preview, operator.id);
      return Response.json({ id, status: "complete", activation: "not_performed" }, { status: 201 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });
      return Response.json({ error: "Historical COGS preview was rejected" }, { status: 422 });
    }
  };
}
