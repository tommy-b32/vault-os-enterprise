import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseParentProductId } from "../lib/catalogue-identifiers.ts";

const parentId = "c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c";
const styleId = `${parentId}::Black`;

test("parent UUID validation rejects a style identifier before database access", () => {
  assert.throws(
    () => parseParentProductId(styleId),
    /valid parent product identifier/,
  );
  assert.equal(parseParentProductId(parentId), parentId);
});

test("Product Business submits the parent UUID and not the style ID", async () => {
  const editor = await readFile(
    new URL("../components/catalogue/ProductEditor.tsx", import.meta.url),
    "utf8",
  );
  const actions = await readFile(
    new URL("../app/catalogue/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(editor, /name="parent_product_id"/);
  assert.match(editor, /value=\{product\.parent_product_id\}/);
  assert.doesNotMatch(editor, /name="product_id"/);
  assert.match(actions, /product_id: parentProductId/);
});

test("approval actions parse and use the canonical parent UUID", async () => {
  const actions = await readFile(
    new URL("../app/catalogue/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /getParentProductId\(formData\)/);
  assert.match(actions, /\.eq\("product_id", parentProductId\)/);
});

test("style selection remains explicitly keyed by style_id", async () => {
  const workspace = await readFile(
    new URL("../components/catalogue/CatalogueWorkspace.tsx", import.meta.url),
    "utf8",
  );
  const productList = await readFile(
    new URL("../components/catalogue/ProductList.tsx", import.meta.url),
    "utf8",
  );

  assert.match(workspace, /selectedStyleId/);
  assert.match(workspace, /product\.style_id === selectedStyleId/);
  assert.match(productList, /onSelectStyle\(product\.style_id\)/);
});
