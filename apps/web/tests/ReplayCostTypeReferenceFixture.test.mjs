import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = new URL("apps/web/tests/fixtures/replay-compat/20261047400000_replay_cost_type_reference_fixture.sql", root);
const staged = new URL(".temp/supabase-baseline-replay/supabase/migrations/20261047400000_replay_cost_type_reference_fixture.sql", root);
const operational = new URL("apps/web/tests/fixtures/replay-compat/20261047500000_replay_exclusive_tee_operational_profile_fixture.sql", root);

test("tee reference replay fixture is exact, idempotent, and fail-closed", async () => {
  const [fixture, stagedFixture, operationalFixture] = await Promise.all([readFile(source, "utf8"), readFile(staged, "utf8"), readFile(operational, "utf8")]);
  assert.equal(stagedFixture, fixture);
  assert.match(fixture, /insert into public\.vault_cost_types \(id, display_name, active\)\s+values \('tee', 'Tee', true\)/i);
  assert.match(fixture, /on conflict \(id\) do nothing/i);
  assert.match(fixture, /display_name is distinct from 'Tee' or active is distinct from true/i);
  assert.match(fixture, /raise exception 'Replay tee cost-type fixture found conflicting reference data'/i);
  assert.doesNotMatch(fixture, /\b(polo|hoodie|jacket|knit)\b/i);
  assert.doesNotMatch(fixture, /created_at|updated_at/i);
  assert.match(operationalFixture, /cost_type_id is distinct from 'tee'/i);
  assert.match(operationalFixture, /values \(exclusive_tee_profile_id, exclusive_supplier_id, 'tee'/i);
});
