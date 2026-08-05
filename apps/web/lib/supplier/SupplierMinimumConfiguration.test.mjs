import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { SupplierMinimumContract } from "./SupplierMinimum.ts";
import { parseSupplierMinimumPolicy } from "./SupplierMinimumPolicyInput.ts";

const repositoryRoot = new URL("../../../../", import.meta.url);
const supplierId = "11111111-1111-4111-8111-111111111111";

function form(policy, value) {
  const data = new FormData();
  data.set("supplier_id", supplierId);
  data.set("minimum_order_policy", policy);
  if (value !== undefined) data.set("minimum_order_value", value);
  return data;
}

test("unknown persists as null and blank never becomes zero", () => {
  assert.deepEqual(parseSupplierMinimumPolicy(form("unknown", "")), {
    supplierId,
    value: null,
    state: "unknown",
  });
  assert.equal(SupplierMinimumContract.create({ value: null, currency: "EUR" }).state, "unknown");
  assert.throws(() => parseSupplierMinimumPolicy(form("defined", "")), /Enter the defined/);
});

test("explicit no-minimum persists as zero and derives not applicable", () => {
  const parsed = parseSupplierMinimumPolicy(form("not_applicable", ""));
  assert.equal(parsed.value, 0);
  assert.equal(SupplierMinimumContract.create({ value: parsed.value, currency: "EUR" }).state, "not_applicable");
});

test("a positive value remains in the canonical supplier currency", () => {
  const parsed = parseSupplierMinimumPolicy(form("defined", "250.50"));
  assert.equal(parsed.value, 250.5);
  assert.deepEqual(SupplierMinimumContract.create({ value: parsed.value, currency: "EUR" }), {
    value: 250.5,
    currency: "EUR",
    state: "defined",
  });
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
  const update = action.indexOf("minimum_order_value: input.value");
  const reread = action.indexOf('.select("id, currency_code, minimum_order_value")');
  const derive = action.indexOf("SupplierMinimumContract.create", reread);
  const emit = action.indexOf('eventType: "supplier-rules-updated"');

  assert.match(action, /\.eq\("id", input\.supplierId\)/);
  assert.doesNotMatch(action, /\.eq\("supplier_name"/);
  assert.ok(noOp > -1 && noOp < update);
  assert.ok(update < reread && reread < derive && derive < emit);
  assert.doesNotMatch(action.slice(update, reread), /currency_code\s*:/);
  assert.match(action, /if \(!existing\.is_active\)/);
});

test("supplier archive action targets an existing route and no duplicate table is introduced", async () => {
  const [page, action, parser] = await Promise.all([
    readFile(new URL("apps/web/app/supplier-catalogue/page.tsx", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/app/commercial/actions.ts", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/lib/supplier/SupplierMinimumPolicyInput.ts", repositoryRoot), "utf8"),
  ]);

  assert.match(page, /href="\/supplier-catalogue\/review"/);
  assert.doesNotMatch(page, /href=\{`\/supplier-catalogue\/\$\{catalogue\.id\}`\}/);
  assert.doesNotMatch(`${action}\n${parser}`, /create\s+table/i);
});

test("Advisor and classifier supplier-minimum policies remain unchanged", async () => {
  const [classifier, advisor] = await Promise.all([
    readFile(new URL("apps/web/lib/brain/TrustedBuyingCandidateClassifier.ts", repositoryRoot), "utf8"),
    readFile(new URL("apps/web/app/advisor/page.tsx", repositoryRoot), "utf8"),
  ]);

  assert.match(classifier, /supplierMinimum\.state === "unknown"/);
  assert.match(classifier, /supplierMinimum\.state === "defined"/);
  assert.match(advisor, /supplierMinimumUnknown > 0/);
});
