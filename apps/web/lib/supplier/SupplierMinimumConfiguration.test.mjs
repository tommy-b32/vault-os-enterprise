import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SupplierMinimumContract } from "./SupplierMinimum.ts";
import { parseSupplierMinimumPolicy } from "./SupplierMinimumPolicyInput.ts";

const repositoryRoot = new URL("../../../../", import.meta.url);
const supplierId = "11111111-1111-4111-8111-111111111111";

function form(policy, value, packs) {
  const data = new FormData();
  data.set("supplier_id", supplierId);
  data.set("minimum_order_policy", policy);
  if (value !== undefined) data.set("minimum_order_value", value);
  if (packs !== undefined) data.set("minimum_order_packs", packs);
  return data;
}

test("unknown persists as null and blank never becomes zero", () => {
  assert.deepEqual(parseSupplierMinimumPolicy(form("unknown", "")), {
    supplierId,
    value: null,
    minimumOrderPacks: null,
    state: "unknown",
  });
  assert.equal(SupplierMinimumContract.create({ value: null, currency: "EUR" }).state, "unknown");
  assert.throws(() => parseSupplierMinimumPolicy(form("defined", "")), /monetary minimum/);
});

test("explicit no-minimum persists as zero and derives not applicable", () => {
  const parsed = parseSupplierMinimumPolicy(form("not_applicable", ""));
  assert.equal(parsed.value, 0);
  assert.equal(parsed.minimumOrderPacks, 0);
  assert.equal(SupplierMinimumContract.create({
    value: parsed.value,
    currency: "EUR",
    minimumOrderPacks: parsed.minimumOrderPacks,
  }).state, "not_applicable");
});

test("a positive value remains in the canonical supplier currency", () => {
  const parsed = parseSupplierMinimumPolicy(form("defined", "250.50"));
  assert.equal(parsed.value, 250.5);
  assert.equal(parsed.minimumOrderPacks, null);
  assert.deepEqual(SupplierMinimumContract.create({ value: parsed.value, currency: "EUR" }), {
    value: 250.5,
    currency: "EUR",
    state: "defined",
    minimumOrderPacks: null,
    packState: "unknown",
  });
});

test("pack-only and combined supplier minimums preserve independent semantics", () => {
  const packOnly = parseSupplierMinimumPolicy(form("defined", "", "20"));
  assert.deepEqual(packOnly, {
    supplierId,
    value: null,
    minimumOrderPacks: 20,
    state: "defined",
  });
  const both = parseSupplierMinimumPolicy(form("defined", "300", "20"));
  assert.equal(both.value, 300);
  assert.equal(both.minimumOrderPacks, 20);
  assert.deepEqual(SupplierMinimumContract.create({
    value: both.value,
    currency: "EUR",
    minimumOrderPacks: both.minimumOrderPacks,
  }), {
    value: 300,
    currency: "EUR",
    state: "defined",
    minimumOrderPacks: 20,
    packState: "defined",
  });
});

test("pack minimum rejects decimals, negatives, zero-defined and blank defined policy", () => {
  for (const packs of ["1.5", "-1", "0", "abc"]) {
    assert.throws(() => parseSupplierMinimumPolicy(form("defined", "", packs)));
  }
  assert.throws(() => parseSupplierMinimumPolicy(form("defined", "", "")), /monetary minimum/);
});

test("negative, zero-defined, malformed, and over-precision values are rejected", () => {
  for (const value of ["-1", "0", "abc", "1.234", "NaN", "Infinity"]) {
    assert.throws(() => parseSupplierMinimumPolicy(form("defined", value)));
  }
});

test("persistence uses canonical supplier ID, rereads state, and emits only after change", async () => {
  const action = await readFile(
    new URL("apps/web/app/commercial/actions.ts", repositoryRoot),
    "utf8",
  );
  const noOp = action.indexOf("existingMinimum === input.value");
  const update = action.indexOf('"update_supplier_minimum_policy"');
  const reread = action.lastIndexOf('.select("id, currency_code, minimum_order_value")');
  const derive = action.indexOf("SupplierMinimumContract.create", reread);
  const emit = action.indexOf('eventType: "supplier-rules-updated"');

  assert.match(action, /\.eq\("id", input\.supplierId\)/);
  assert.doesNotMatch(action, /\.eq\("supplier_name"/);
  assert.ok(noOp > -1 && noOp < update);
  assert.ok(update < reread && reread < derive && derive < emit);
  assert.match(action, /target_minimum_order_packs: input\.minimumOrderPacks/);
  assert.match(action, /if \(!existing\.is_active\)/);
});

test("supplier minimum action remains independent from durable archive routing", async () => {
  const [page, action, parser, migration] = await Promise.all([
    readFile(new URL("apps/web/app/supplier-catalogue/page.tsx", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/app/commercial/actions.ts", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/lib/supplier/SupplierMinimumPolicyInput.ts", repositoryRoot), "utf8"),
    readFile(new URL("supabase/migrations/20260810000000_supplier_minimum_policy_write.sql", repositoryRoot), "utf8"),
  ]);

  assert.match(page, /href=\{`\/supplier-catalogue\/\$\{archive\.id\}`\}/);
  assert.doesNotMatch(page, /href="\/supplier-catalogue\/review"/);
  assert.doesNotMatch(`${action}\n${parser}\n${migration}`, /create\s+table/i);
  assert.doesNotMatch(migration, /add\s+column/i);
  assert.match(migration, /vault_supplier_purchasing_rules[\s\S]*minimum_order_packs/i);
});

test("supplier save remains inline and the server action module exports actions only", async () => {
  const [component, action, actionState] = await Promise.all([
    readFile(new URL("apps/web/components/commercial/SupplierPurchasing.tsx", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/app/commercial/actions.ts", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/lib/supplier/SupplierMinimumActionState.ts", repositoryRoot), "utf8"),
  ]);

  assert.match(component, /useActionState\(\s*updateSupplierMinimumPolicy/);
  assert.match(component, /<form action=\{action\}/);
  assert.match(component, /state\.status === "success"[\s\S]*router\.refresh\(\)/);
  assert.doesNotMatch(component, /router\.(?:push|replace)\(/);
  assert.doesNotMatch(`${component}\n${action}`, /redirect\(/);
  assert.doesNotMatch(`${component}\n${action}`, /supplier-catalogue\/\$\{|supplier-catalogue\/[a-z-]+/);
  assert.doesNotMatch(action, /export const INITIAL_SUPPLIER_MINIMUM_ACTION_STATE/);
  assert.match(actionState, /INITIAL_SUPPLIER_MINIMUM_ACTION_STATE/);
  assert.doesNotMatch(component, /\.reset\(\)/);
});

test("Advisor and classifier supplier-minimum policies remain unchanged", async () => {
  const [classifier, advisor] = await Promise.all([
    readFile(new URL("apps/web/lib/brain/TrustedBuyingCandidateClassifier.ts", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/app/advisor/page.tsx", repositoryRoot), "utf8"),
  ]);

  assert.match(classifier, /supplierMinimum\.state === "unknown"/);
  assert.match(classifier, /supplierMinimum\.state === "defined"/);
  assert.match(classifier, /minimumOrderPacks: supplier\?\.minimumOrderPacks/);
  assert.match(advisor, /supplierMinimumUnknown > 0/);
});
