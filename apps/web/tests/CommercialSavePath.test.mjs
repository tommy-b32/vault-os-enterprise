import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const parentId = "c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c";
const supplierId = "75f62b49-e7de-4d95-9f7f-b77d4ca12d5a";

function validEntries(overrides = {}) {
  return {
    parent_product_id: parentId,
    supplier_id: supplierId,
    currency: "GBP",
    exchange_rate_to_gbp: "",
    pack_cost: "60",
    units_per_pack: "6",
    shipping_cost_per_pack: "3.50",
    import_cost_per_pack: "0",
    average_selling_price: "40",
    last_supplier_price_update: "2026-08-04",
    ...overrides,
  };
}

async function loadParser() {
  return import("../lib/commercial-inputs.ts");
}

function form(overrides) {
  const data = new FormData();

  for (const [key, value] of Object.entries(validEntries(overrides))) {
    data.append(key, value);
  }

  return data;
}

test("valid GBP and foreign-currency commercial inputs parse without fabrication", async () => {
  const { parseCommercialInputs } = await loadParser();
  const gbp = parseCommercialInputs(form());
  const eur = parseCommercialInputs(
    form({ currency: "EUR", exchange_rate_to_gbp: "0.84" }),
  );

  assert.equal(gbp.exchangeRateToGbp, 1);
  assert.equal(gbp.packCost, 60);
  assert.equal(gbp.unitsPerPack, 6);
  assert.equal(eur.exchangeRateToGbp, 0.84);
});

test("strict parser blocks invalid mandatory commercial values", async () => {
  const { parseCommercialInputs } = await loadParser();
  const invalidCases = [
    [{ currency: "EUR", exchange_rate_to_gbp: "" }, /Exchange rate is required/],
    [{ currency: "EUR", exchange_rate_to_gbp: "-1" }, /greater than zero/],
    [{ pack_cost: "0" }, /Pack cost must be greater than zero/],
    [{ shipping_cost_per_pack: "-1" }, /Shipping cost cannot be negative/],
    [{ import_cost_per_pack: "-1" }, /Import cost cannot be negative/],
    [{ units_per_pack: "0" }, /Units per pack must be greater than zero/],
    [{ average_selling_price: "0" }, /Average selling price must be greater than zero/],
    [{ last_supplier_price_update: "2026-02-31" }, /Supplier price date is invalid/],
    [{ parent_product_id: `${parentId}::Black` }, /valid parent product identifier/],
  ];

  for (const [overrides, message] of invalidCases) {
    assert.throws(() => parseCommercialInputs(form(overrides)), message);
  }
});

test("Commercial owns its save action and Business cannot capture its submit", async () => {
  const [editor, commercialTab] = await Promise.all([
    readFile(new URL("../components/catalogue/ProductEditor.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../components/catalogue/editor/ProductCommercialTab.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(editor, /activeTab === "business"[\s\S]*<form action=\{saveAction\}>/);
  assert.match(editor, /<ProductCommercialTab[\s\S]*product=\{product\}/);
  assert.match(commercialTab, /useActionState\([\s\S]*updateCommercialCosts/);
  assert.match(commercialTab, /<form[\s\S]*action=\{saveAction\}/);
  assert.doesNotMatch(editor, /<form[^>]*className="product-editor"/);
});

test("server action persists source fields and rereads canonical metrics", async () => {
  const action = await readFile(
    new URL("../app/catalogue/commercial-actions.ts", import.meta.url),
    "utf8",
  );

  for (const field of [
    "supplier_id",
    "currency",
    "exchange_rate_to_gbp",
    "pack_cost",
    "units_per_pack",
    "shipping_cost_per_pack",
    "import_cost_per_pack",
    "average_selling_price",
    "last_supplier_price_update",
  ]) {
    assert.match(action, new RegExp(`${field}:`));
  }

  assert.match(action, /from\("vault_product_commercial_intelligence"\)/);
  assert.match(action, /\.eq\("product_id", inputs\.parentProductId\)/);
});

test("canonical purchasing qualification never converts a missing landed cost to zero", async () => {
  const classifier = await readFile(
    new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(classifier, /landed_cost_per_pack_gbp\s*\?\?\s*0/);
  assert.match(classifier, /invalid_or_missing_commercial_cost/);
  assert.match(classifier, /commercial\.landed_cost_per_pack_gbp === null/);
  assert.match(classifier, /Number\.isFinite\(commercial\.landed_cost_per_pack_gbp\)/);
});

test('changed "use server" modules export async actions only', async () => {
  const serverModules = [
    new URL("../app/catalogue/commercial-actions.ts", import.meta.url),
  ];

  for (const moduleUrl of serverModules) {
    const source = await readFile(moduleUrl, "utf8");
    const runtimeExports = [
      ...source.matchAll(
        /^export\s+(?!type\b|interface\b)(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/gm,
      ),
    ];
    const invalidExports = runtimeExports
      .filter((match) => !match[0].startsWith("export async function"))
      .map((match) => match[1]);

    assert.deepEqual(
      invalidExports,
      [],
      `${moduleUrl.pathname} exports non-async runtime values`,
    );
    assert.match(source, /export async function updateCommercialCosts/);
  }
});
