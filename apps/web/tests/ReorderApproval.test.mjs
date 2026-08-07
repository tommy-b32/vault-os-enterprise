import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/20260804020000_product_reorder_approvals.sql",
  import.meta.url,
);

test("complete configuration requires an explicit active approval", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /configuration\.configuration_score = 100/);
  assert.match(sql, /configuration\.inventory_strategy = 'stocked'/);
  assert.match(sql, /configuration\.restock_enabled = true/);
  assert.match(sql, /approval\.approval_state = 'approved'/);
});

test("one approval row is retained per canonical parent product", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /product_id uuid not null references public\.vault_products\(id\)/);
  assert.match(sql, /unique \(product_id\)/);
  assert.doesNotMatch(sql, /style_id/);
  assert.doesNotMatch(sql, /insert into public\.vault_product_reorder_approvals/i);
});

test("revocation and later configuration changes remove canonical trust", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /approval_state in \('approved', 'revoked'\)/);
  assert.match(sql, /approval_state = 'revoked'.*revoked_by is not null.*revoked_at is not null/s);
  assert.match(sql, /configuration\.configuration_score = 100.*approval\.approval_state = 'approved'/s);
});

test("approval writes require an authorized operator and current eligibility", async () => {
  const source = await readFile(
    new URL("../app/catalogue/actions.ts", import.meta.url),
    "utf8",
  );

  assert.ok(source.indexOf("requireOperatorRole") < source.indexOf("vault_product_reorder_approvals"));
  assert.match(source, /configuration_trusted !== true/);
  assert.match(source, /inventory_strategy !== "stocked"/);
  assert.match(source, /restock_enabled !== true/);
});

test("Advisor reports missing approval without changing ranking", async () => {
  const [advisor, classifier] = await Promise.all([
    readFile(new URL("../lib/brain/AdvisorEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
  ]);

  assert.match(classifier, /reorder_approval_missing/);
  assert.match(classifier, /product\.reorder_approval\?\.approval_state/);
  assert.match(advisor, /candidates: TrustedBuyingCandidateResult\[\]/);
  assert.match(advisor, /reorderApprovalMissing: countReason\("reorder_approval_missing"\)/);
});
