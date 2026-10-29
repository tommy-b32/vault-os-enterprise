import { isHistoricalCogsDecision, isNonEmptyNote, isUuid } from "./HistoricalLineCogsProposal.ts";

type AuthorizationError = { reason: "unauthenticated" | "missing" | "inactive" | "forbidden" };
type Dependencies = {
  requireOperator: () => Promise<unknown>;
  requireOwner: () => Promise<unknown>;
  isOperatorAuthorizationError: (error: unknown) => error is AuthorizationError;
  loadPreview: () => Promise<{ eligible: boolean }>;
  stage: () => Promise<string>;
  proposalExists: (proposalId: string) => Promise<boolean>;
  decide: (proposalId: string, decision: "APPROVED" | "REJECTED", approvalNote: string) => Promise<void>;
};

const own = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const denied = (error: AuthorizationError) => Response.json({ error: error.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, { status: error.reason === "forbidden" ? 403 : 401 });

export function createHistoricalLineCogsProposalHandler(dependencies: Dependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const body = await request.json().catch(() => null);
      if (!own(body) || typeof body.action !== "string") return Response.json({ error: "Invalid historical COGS request" }, { status: 400 });

      if (body.action === "stage") {
        await dependencies.requireOperator();
        if (body.confirmed !== true || Object.keys(body).some((key) => !["action", "confirmed"].includes(key))) return Response.json({ error: "Confirm the reviewed historical COGS proposal" }, { status: 400 });
        if (!(await dependencies.loadPreview()).eligible) return Response.json({ error: "STAGING_NOT_ELIGIBLE" }, { status: 409 });
        return Response.json({ proposalId: await dependencies.stage(), status: "PENDING" }, { status: 201 });
      }

      if (body.action === "decide") {
        await dependencies.requireOwner();
        if (!isUuid(body.proposalId) || !isHistoricalCogsDecision(body.decision) || !isNonEmptyNote(body.approvalNote) || Object.keys(body).some((key) => !["action", "proposalId", "decision", "approvalNote"].includes(key))) return Response.json({ error: "Invalid historical COGS decision" }, { status: 400 });
        if (!(await dependencies.proposalExists(body.proposalId))) return Response.json({ error: "Proposal is unavailable" }, { status: 404 });
        await dependencies.decide(body.proposalId, body.decision, body.approvalNote.trim());
        return Response.json({ status: body.decision });
      }

      return Response.json({ error: "Invalid historical COGS action" }, { status: 400 });
    } catch (error) {
      if (dependencies.isOperatorAuthorizationError(error)) return denied(error);
      return Response.json({ error: "Historical COGS action is unavailable" }, { status: 422 });
    }
  };
}
