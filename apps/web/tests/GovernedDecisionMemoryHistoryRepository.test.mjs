import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../lib/brain/GovernedDecisionMemoryHistoryRepository.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function harness({ data = [], error = null, now = new Date("2026-10-31T12:00:00.000Z") } = {}) {
  const calls = [];
  const query = {
    select(fields) { calls.push(["select", fields]); return this; },
    eq(field, value) { calls.push(["eq", field, value]); return this; },
    gte(field, value) { calls.push(["gte", field, value]); return this; },
    order(field, options) { calls.push(["order", field, options]); return this; },
    limit(count) { calls.push(["limit", count]); return Promise.resolve({ data, error }); },
  };
  const client = { from(table) { calls.push(["from", table]); return query; } };
  const exports = {};
  new Function("require", "exports", output)((name) => ({
    "server-only": {},
    "@/lib/brain/GovernedDecisionMemory": { GOVERNED_DECISION_MEMORY_STORE_SCOPE: "default" },
    "@/lib/supabase-admin": { supabaseAdmin: client },
  }[name] ?? require(name)), exports);
  return { repository: exports.createGovernedDecisionMemoryHistoryRepository(client, () => now), calls };
}

const rows = [
  { id: "a", observed_at: "2026-10-31T10:00:00.000Z", recorded_at: "2026-10-31T10:00:01.000Z", style_states: [], source_provenance: {} },
  { id: "b", observed_at: "2026-10-31T09:00:00.000Z", recorded_at: "2026-10-31T09:00:01.000Z", style_states: [], source_provenance: {} },
];

test("latest and latest-two are empty-safe and use the required newest-first ordering", async () => {
  let run = harness();
  assert.equal(await run.repository.getLatest(), null);
  run = harness({ data: rows });
  assert.equal((await run.repository.getLatest()).id, "a");
  assert.deepEqual((await run.repository.getLatestTwo()).map((row) => row.id), ["a", "b"]);
  assert.deepEqual(run.calls.filter(([name]) => name === "order").map(([, field]) => field), ["observed_at", "recorded_at", "id", "observed_at", "recorded_at", "id"]);
});

test("recent history applies a server-side 30-day bound and deterministic safe limits", async () => {
  const { repository, calls } = harness();
  await repository.listRecent();
  assert.deepEqual(calls.find(([name]) => name === "gte"), ["gte", "observed_at", "2026-10-01T12:00:00.000Z"]);
  assert.equal(calls.filter(([name]) => name === "limit").at(-1)[1], 50);
  for (const [input, expected] of [[999, 50], [0, 50], [-1, 50], [Number.NaN, 50], [7, 7]]) {
    const run = harness(); await run.repository.listRecent({ limit: input });
    assert.equal(run.calls.find(([name]) => name === "limit")[1], expected);
  }
});

test("reader is server-owned, reads only governed memory, and preserves comparator fields", async () => {
  const { repository, calls } = harness({ data: rows });
  const returned = await repository.listRecent({ limit: 2 });
  assert.equal(calls[0][1], "vault_governed_decision_memory");
  assert.deepEqual(calls.find(([name]) => name === "eq"), ["eq", "store_scope", "default"]);
  assert.equal(returned[0].source_provenance instanceof Object, true);
  const fields = calls.find(([name]) => name === "select")[1];
  for (const field of ["semantic_hash", "memory_schema_version", "outcome_signals", "summary_counts", "style_states", "supplier_qualifications", "wallet_state", "source_provenance"]) assert.match(fields, new RegExp(field));
});

test("query failure is not represented as empty history", async () => {
  const { repository } = harness({ error: { message: "database detail" } });
  await assert.rejects(repository.getLatest(), /Governed decision memory history is unavailable/);
});

test("reader source is server-only and excludes persistence, live evaluation, and legacy paths", () => {
  assert.match(source, /import "server-only"/);
  assert.doesNotMatch(source, /insert\(|update\(|delete\(|upsert\(|\.rpc\(|runGovernedDecisionEvaluation|TrustedBuyingCandidateClassifier|runGovernedDecisionMemoryCapture|recordGovernedDecisionMemory|vault_operational_snapshots/);
});
