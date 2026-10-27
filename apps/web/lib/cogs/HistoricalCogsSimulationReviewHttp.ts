const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/i;
export const dateOnlyReceiptRule = "date_only_receipts_eligible_following_europe_london_calendar_day_v1";

type Operator = { id: string };
type Snapshot = { simulationInputSha256: string; simulationResolutionSha256: string; simulatorCodeSha256: string; perLineReportSha256: string };
type ReviewInput = { draftPolicyVersionId: string; policyRule: string; snapshot: Snapshot; metrics: { calculatedLineCount: number; returnedRestockedLineCount: number; sameDayReceiptWarningCount: number; simulatedCogsGbp: number; existingPolicyCogsGbp: number; simulatedClosingInventoryUnits: number; simulatedClosingInventoryLandedGbp: number }; exceptionSummary: Record<string, unknown> };
type ApprovalInput = { reviewId: string; policyRule: string; snapshot: Snapshot; approvalNote: string };
type Dependencies = {
  requireOperator: () => Promise<Operator>;
  isOperatorAuthorizationError: (error: unknown) => error is { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" };
  createReview: (input: ReviewInput & { operatorId: string }) => Promise<string>;
  approveReview: (input: ApprovalInput & { operatorId: string }) => Promise<string>;
};

const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const nonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonNegativeNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const validSnapshot = (value: unknown): value is Snapshot => own(value) && exact(value, ["simulationInputSha256", "simulationResolutionSha256", "simulatorCodeSha256", "perLineReportSha256"]) && Object.values(value).every((hash) => typeof hash === "string" && sha256.test(hash));
const validReview = (value: unknown): value is ReviewInput => {
  if (!own(value) || !exact(value, ["draftPolicyVersionId", "policyRule", "snapshot", "metrics", "exceptionSummary"]) || typeof value.draftPolicyVersionId !== "string" || !uuid.test(value.draftPolicyVersionId) || value.policyRule !== dateOnlyReceiptRule || !validSnapshot(value.snapshot) || !own(value.exceptionSummary) || !own(value.metrics)) return false;
  const metrics = value.metrics;
  return exact(metrics, ["calculatedLineCount", "returnedRestockedLineCount", "sameDayReceiptWarningCount", "simulatedCogsGbp", "existingPolicyCogsGbp", "simulatedClosingInventoryUnits", "simulatedClosingInventoryLandedGbp"])
    && nonNegativeInteger(metrics.calculatedLineCount) && nonNegativeInteger(metrics.returnedRestockedLineCount) && nonNegativeInteger(metrics.sameDayReceiptWarningCount) && nonNegativeInteger(metrics.simulatedClosingInventoryUnits)
    && nonNegativeNumber(metrics.simulatedCogsGbp) && nonNegativeNumber(metrics.existingPolicyCogsGbp) && nonNegativeNumber(metrics.simulatedClosingInventoryLandedGbp);
};
const validApproval = (value: unknown): value is ApprovalInput => own(value) && exact(value, ["reviewId", "policyRule", "snapshot", "approvalNote"])
  && typeof value.reviewId === "string" && uuid.test(value.reviewId) && value.policyRule === dateOnlyReceiptRule && validSnapshot(value.snapshot)
  && typeof value.approvalNote === "string" && value.approvalNote.trim().length > 0;

const authResponse = (error: { reason: string }) => Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });

export function createHistoricalCogsSimulationReviewHandler(dependencies: Pick<Dependencies, "requireOperator" | "isOperatorAuthorizationError" | "createReview">) {
  return async (request: Request): Promise<Response> => {
    try {
      const operator = await dependencies.requireOperator();
      const body = await request.json().catch(() => null);
      if (!validReview(body)) return Response.json({ error: "Invalid historical COGS simulation review" }, { status: 400 });
      const id = await dependencies.createReview({ ...body, operatorId: operator.id });
      return Response.json({ id, status: "reviewed", activation: "not_performed" }, { status: 201 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return authResponse(error);
      return Response.json({ error: "Historical COGS simulation review was rejected" }, { status: 422 });
    }
  };
}

export function createHistoricalCogsSimulationReviewApprovalHandler(dependencies: Pick<Dependencies, "requireOperator" | "isOperatorAuthorizationError" | "approveReview">) {
  return async (request: Request): Promise<Response> => {
    try {
      const operator = await dependencies.requireOperator();
      const body = await request.json().catch(() => null);
      if (!validApproval(body)) return Response.json({ error: "Invalid historical COGS simulation approval" }, { status: 400 });
      const id = await dependencies.approveReview({ ...body, operatorId: operator.id });
      return Response.json({ id, status: "approved_for_activation", activation: "not_performed" }, { status: 201 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return authResponse(error);
      return Response.json({ error: "Historical COGS simulation approval was rejected" }, { status: 422 });
    }
  };
}

type PreviewReviewDependencies = Pick<Dependencies, "requireOperator" | "isOperatorAuthorizationError"> & { createReviewFromPreview: (previewId: string, operatorId: string) => Promise<string>; approveReviewFromPreview: (reviewId: string, previewId: string, approvalNote: string, operatorId: string) => Promise<string> };
export function createHistoricalCogsSimulationReviewFromPreviewHandler(dependencies: Pick<PreviewReviewDependencies, "requireOperator" | "isOperatorAuthorizationError" | "createReviewFromPreview">) {
  return async (request: Request): Promise<Response> => { try { const operator = await dependencies.requireOperator(); const body = await request.json().catch(() => null); if (!own(body) || !exact(body,["previewId"]) || typeof body.previewId !== "string" || !uuid.test(body.previewId)) return Response.json({ error:"Invalid historical COGS preview review" },{status:400}); const id=await dependencies.createReviewFromPreview(body.previewId,operator.id); return Response.json({ id,status:"reviewed",activation:"not_performed"},{status:201}); } catch(error) { if(dependencies.isOperatorAuthorizationError(error)) return authResponse(error); return Response.json({error:"Historical COGS simulation review was rejected"},{status:422}); } };
}
export function createHistoricalCogsSimulationReviewApprovalFromPreviewHandler(dependencies: Pick<PreviewReviewDependencies, "requireOperator" | "isOperatorAuthorizationError" | "approveReviewFromPreview">) {
  return async (request: Request): Promise<Response> => { try { const operator=await dependencies.requireOperator(); const body=await request.json().catch(()=>null); if(!own(body)||!exact(body,["reviewId","previewId","approvalNote"])||typeof body.reviewId!=="string"||!uuid.test(body.reviewId)||typeof body.previewId!=="string"||!uuid.test(body.previewId)||typeof body.approvalNote!=="string"||!body.approvalNote.trim()) return Response.json({error:"Invalid historical COGS simulation approval"},{status:400}); const id=await dependencies.approveReviewFromPreview(body.reviewId,body.previewId,body.approvalNote,operator.id); return Response.json({id,status:"approved_for_activation",activation:"not_performed"},{status:201}); } catch(error) { if(dependencies.isOperatorAuthorizationError(error)) return authResponse(error); return Response.json({error:"Historical COGS simulation approval was rejected"},{status:422}); } };
}
