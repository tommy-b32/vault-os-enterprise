import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  filterWorkspaceProducts,
  getWorkspaceProducts,
  remediationInitialTab,
  selectedWorkspaceProduct,
} from "../lib/catalogue/remediation-workspace.ts";

const product = (parent, style, name, supplier = "Supplier") => ({ parent_product_id: parent, style_id: style, product_name: name, supplier_company: supplier, inventory_strategy: "stocked", pack_profile: "pack", status: "active" });
const products = [product("affected-1", "affected-1::Black", "Black Tee"), product("unrelated", "unrelated::Green", "Green Hoodie", "Other supplier"), product("affected-2", "affected-2::Navy", "Navy Polo")];

test("remediation scope contains only current affected products and starts at the first one", () => {
  const scoped = getWorkspaceProducts(products, "reorder_approval_missing", ["affected-1", "affected-2"]);
  assert.deepEqual(scoped.map((item) => item.style_id), ["affected-1::Black", "affected-2::Navy"]);
  assert.equal(selectedWorkspaceProduct(scoped, null)?.style_id, "affected-1::Black");
  assert.equal(selectedWorkspaceProduct(scoped, "unrelated::Green")?.style_id, "affected-1::Black");
});

test("search filters only the affected scope and an empty match is not resolution", () => {
  const scoped = getWorkspaceProducts(products, "target_stock_days_missing", ["affected-1", "affected-2"]);
  assert.deepEqual(filterWorkspaceProducts(scoped, "polo").map((item) => item.style_id), ["affected-2::Navy"]);
  assert.deepEqual(filterWorkspaceProducts(scoped, "green"), []);
  assert.equal(scoped.length > 0, true);
  assert.equal(selectedWorkspaceProduct(filterWorkspaceProducts(scoped, "green"), "affected-1::Black"), null);
});

test("current affected-set changes move selection and a zero scope has no editor product", () => {
  const remaining = getWorkspaceProducts(products, "reorder_approval_missing", ["affected-2"]);
  const resolved = getWorkspaceProducts(products, "reorder_approval_missing", []);
  assert.equal(selectedWorkspaceProduct(remaining, "affected-1::Black")?.style_id, "affected-2::Navy");
  assert.equal(resolved.length, 0);
  assert.equal(selectedWorkspaceProduct(resolved, "affected-1::Black"), null);
});

test("canonical remediation tab mapping remains business except commercial-cost remediation", () => {
  assert.equal(remediationInitialTab("reorder_approval_missing"), "business");
  assert.equal(remediationInitialTab("target_stock_days_missing"), "business");
  assert.equal(remediationInitialTab("invalid_or_missing_commercial_cost"), "commercial");
});

test("server page retains a valid-remediation branch before normal catalogue markup", async () => {
  const page = await readFile(new URL("../app/catalogue/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../components/catalogue/CatalogueWorkspace.tsx", import.meta.url), "utf8");
  assert.match(page, /isCatalogueRemediationBlocker\(query\.attention\)/);
  assert.match(page, /if \(attention\)[\s\S]*?return[\s\S]*?catalogue-remediation-page/);
  assert.match(page, /catalogue-remediation-page[\s\S]*?const totalProducts/);
  assert.match(page, /Product Intelligence/);
  assert.match(page, /Highest-impact catalogue gaps/);
  assert.match(workspace, /attention && !hasAffectedProducts/);
  assert.match(workspace, /<ProductEditor/);
});
