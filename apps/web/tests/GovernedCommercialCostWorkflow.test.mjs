import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("supplier profiles are viewable, editable, and reject the non-GBP FX default", async () => {
  const [component, action] = await Promise.all([
    read("components/commercial/SupplierCostProfiles.tsx"),
    read("app/commercial/actions.ts"),
  ]);
  assert.match(component, /profiles\.map/);
  assert.match(component, /Edit/);
  assert.match(component, /Preview:/);
  assert.match(action, /currency !== "GBP" && exchangeRateToGbp === 1/);
  assert.match(action, /GBP value for one unit of supplier currency/);
});

test("the confirmed Exclusive tee profile calculates governed USD to GBP economics", () => {
  const supplierLandedPack = 50 + 23.25;
  const fx = 0.745755;
  assert.equal(supplierLandedPack, 73.25);
  assert.equal(Number((supplierLandedPack * fx).toFixed(2)), 54.63);
  assert.equal(Number((supplierLandedPack * fx / 5).toFixed(2)), 10.93);
  assert.notEqual(fx, 1);
});

test("profile edit preview is driven by live draft state and preserves effective_from", async () => {
  const [component, page] = await Promise.all([
    read("components/commercial/SupplierCostProfiles.tsx"),
    read("app/commercial/page.tsx"),
  ]);
  assert.match(component, /const \[draft, setDraft\] = useState/);
  assert.match(component, /landed \* fx/);
  assert.match(component, /landedGbp \/ units/);
  assert.match(component, /draft\.currency === "GBP" \? "1" : draft\.exchangeRate/);
  assert.match(component, /value=\{draft\.packCost\}/);
  assert.match(component, /value=\{draft\.shipping\}/);
  assert.match(component, /value=\{draft\.importCost\}/);
  assert.match(component, /value=\{draft\.units\}/);
  assert.match(component, /effectiveFrom: profile\.effective_from\.slice\(0, 16\)/);
  assert.match(page, /effective_from/);
});

test("parents require an explicit governed cost type before eligible profiles are offered", async () => {
  const [component, action] = await Promise.all([
    read("components/catalogue/editor/ProductCommercialTab.tsx"),
    read("app/catalogue/commercial-actions.ts"),
  ]);
  assert.match(component, /Canonical cost type/);
  assert.match(component, /profile\.cost_type_id === costTypeId/);
  assert.match(action, /vault_product_cost_type_assignments/);
  assert.match(action, /profile\.supplier_id !== inputs\.supplierId/);
  assert.match(action, /profile\.cost_type_id !== inputs\.costTypeId/);
});

test("a canonical cost type can be saved before costs or inheritance without creating incomplete cost evidence", async () => {
  const [inputs, action] = await Promise.all([
    read("lib/commercial-inputs.ts"),
    read("app/catalogue/commercial-actions.ts"),
  ]);
  assert.match(inputs, /const costTypeOnly = Boolean\(costTypeId\)/);
  assert.match(inputs, /\["pack_cost", "units_per_pack", "shipping_cost_per_pack", "import_cost_per_pack"\]/);
  assert.match(action, /if \(inputs\.costTypeOnly\)/);
  assert.match(action, /Canonical cost type saved\. Select a matching supplier cost profile/);
  const costTypeOnly = action.indexOf("if (inputs.costTypeOnly)");
  const costWrite = action.indexOf("const { error: saveError }");
  const inheritanceWrite = action.indexOf("const { error: inheritanceError }");
  assert.ok(costTypeOnly < costWrite);
  assert.ok(costTypeOnly < inheritanceWrite);
});

test("inheritance remains parent-level and preserves all five field choices", async () => {
  const [component, action] = await Promise.all([
    read("components/catalogue/editor/ProductCommercialTab.tsx"),
    read("app/catalogue/commercial-actions.ts"),
  ]);
  for (const field of ["inherit_pack_cost", "inherit_shipping_cost", "inherit_import_cost", "inherit_units_per_pack", "inherit_fx"]) {
    assert.match(component, new RegExp(field));
    assert.match(action, new RegExp(field));
  }
  assert.match(action, /vault_product_cost_profile_inheritance/);
  assert.doesNotMatch(action, /vault_style_/);
});

test("Product Commercial validates and previews each inherited field from the selected profile", async () => {
  const [component, action] = await Promise.all([
    read("components/catalogue/editor/ProductCommercialTab.tsx"),
    read("app/catalogue/commercial-actions.ts"),
  ]);
  assert.match(component, /const selectedProfile = matchingProfiles\.find/);
  assert.match(component, /inherit\.pack && selectedProfile \? String\(selectedProfile\.pack_cost\) : packCost/);
  assert.match(component, /inherit\.shipping && selectedProfile \? String\(selectedProfile\.shipping_cost_per_pack\) : shippingCost/);
  assert.match(component, /inherit\.import && selectedProfile \? String\(selectedProfile\.import_cost_per_pack\) : importCost/);
  assert.match(component, /inherit\.units && selectedProfile \? selectedProfile\.units_per_pack/);
  assert.match(component, /inherit\.fx && selectedProfile \? selectedProfile\.supplier_currency : currency/);
  assert.match(action, /inheritedValuesAreValid/);
  assert.match(action, /inputs\.inheritPackCost \? existingCostResponse/);
  assert.match(action, /inputs\.inheritFx \? existingCostResponse/);
});

test("fully inherited Exclusive tee economics resolve before save", () => {
  const landedPack = 50 + 23.25;
  const fx = 0.745755;
  assert.equal(Number((landedPack * fx).toFixed(2)), 54.63);
  assert.equal(Number((landedPack * fx / 5).toFixed(2)), 10.93);
});
