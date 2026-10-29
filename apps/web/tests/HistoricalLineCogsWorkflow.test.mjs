import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHistoricalLineCogsProposalHandler } from "../lib/cogs/HistoricalLineCogsProposalHttp.ts";

const root = new URL("../../../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("historical COGS workflow uses the authenticated session for governed RPCs", async () => {
  const [route, handler] = await Promise.all([
    read("apps/web/app/api/cogs/historical-line-proposals/route.ts"),
    read("apps/web/lib/cogs/HistoricalLineCogsProposalHttp.ts"),
  ]);
  const source = `${route}${handler}`;
  for (const text of [
    "createSessionSupabaseClient",
    "requireOperatorRole(\"owner\", \"operator\")",
    "stage_governed_historical_line_cogs_proposal",
    "requireOperatorRole(\"owner\")",
    "decide_governed_historical_line_cogs_proposal",
    "STAGING_NOT_ELIGIBLE",
  ]) assert.ok(source.includes(text));
  assert.doesNotMatch(route, /supabaseAdmin\.rpc/);
  assert.doesNotMatch(source, /p_actor_id|actor_id|proposed_by_operator_id|approved_by_operator_id/);
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.delete\(/);
});

test("historical COGS workflow is narrowly prefilled and separates staging from decision", async () => {
  const [prefill, ui] = await Promise.all([
    read("apps/web/lib/cogs/HistoricalLineCogsProposal.ts"),
    read("apps/web/components/operations/HistoricalLineCogsWorkflow.tsx"),
  ]);
  for (const text of [
    "93061d97-9d55-467b-ae9d-15c9590b899b",
    "eabb625c-4da1-4a30-9f41-b8a1e6f8bec7",
    "TFV-HIST-20260910-EXTEE",
    "unitLandedCogsGbp: 11.0730",
  ]) assert.ok(prefill.includes(text));
  for (const text of ["Stage pending proposal", "Owner decision", "Immutable audit history", "I confirm the delivery"]) assert.ok(ui.includes(text));
  assert.ok(ui.includes("disabled={!preview.eligible || !confirmed}"));
});

const id = "00000000-0000-4000-8000-000000000001";
const request = (body) => new Request("http://local.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
class AuthError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const dependencies = (overrides = {}) => ({
  requireOperator: async () => ({}), requireOwner: async () => ({}), isOperatorAuthorizationError: (error) => error instanceof AuthError,
  loadPreview: async () => ({ eligible: true }), stage: async () => id, proposalExists: async () => true, decide: async () => {}, ...overrides,
});

test("staging requires an authenticated operator, rejects impersonation-shaped input, and never stages an ineligible or resolved line", async () => {
  let stages = 0;
  const denied = createHistoricalLineCogsProposalHandler(dependencies({ requireOperator: async () => { throw new AuthError("unauthenticated"); }, stage: async () => { stages += 1; return id; } }));
  assert.equal((await denied(request({ action: "stage", confirmed: true }))).status, 401);
  const malformed = createHistoricalLineCogsProposalHandler(dependencies({ stage: async () => { stages += 1; return id; } }));
  assert.equal((await malformed(request({ action: "stage", confirmed: true, actorId: id }))).status, 400);
  const resolved = createHistoricalLineCogsProposalHandler(dependencies({ loadPreview: async () => ({ eligible: false }), stage: async () => { stages += 1; return id; } }));
  assert.equal((await resolved(request({ action: "stage", confirmed: true }))).status, 409);
  assert.equal(stages, 0);
});

test("only an owner can decide an existing pending proposal", async () => {
  let decisions = 0;
  const notOwner = createHistoricalLineCogsProposalHandler(dependencies({ requireOwner: async () => { throw new AuthError("forbidden"); }, decide: async () => { decisions += 1; } }));
  assert.equal((await notOwner(request({ action: "decide", proposalId: id, decision: "APPROVED", approvalNote: "Reviewed approved evidence." }))).status, 403);
  const arbitraryProposal = createHistoricalLineCogsProposalHandler(dependencies({ proposalExists: async () => false, decide: async () => { decisions += 1; } }));
  assert.equal((await arbitraryProposal(request({ action: "decide", proposalId: id, decision: "APPROVED", approvalNote: "Reviewed approved evidence." }))).status, 404);
  assert.equal((await arbitraryProposal(request({ action: "decide", proposalId: id, decision: "APPROVED", approvalNote: "Reviewed approved evidence.", orderLineId: id }))).status, 400);
  const owner = createHistoricalLineCogsProposalHandler(dependencies({ decide: async () => { decisions += 1; } }));
  assert.equal((await owner(request({ action: "decide", proposalId: id, decision: "REJECTED", approvalNote: "Evidence does not support attribution." }))).status, 200);
  assert.equal(decisions, 1);
});
