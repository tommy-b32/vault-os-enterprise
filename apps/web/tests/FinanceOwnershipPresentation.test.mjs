import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Finance routes make their ownership explicit without changing their data contracts", async () => {
  const [financial, intelligence, profitability, commercial, workspace, wallet, productDetail, financialPage, financialLoading] = await Promise.all([
    read("../components/financial-intelligence/FinancialIntelligenceDashboard.tsx"),
    read("../app/intelligence/page.tsx"),
    read("../components/intelligence/ProductProfitabilityPanel.tsx"),
    read("../app/commercial/page.tsx"),
    read("../components/commercial/CommercialWorkspace.tsx"),
    read("../components/commercial/PurchasingWallet.tsx"),
    read("../app/intelligence/products/[productId]/page.tsx"),
    read("../app/financial-intelligence/page.tsx"),
    read("../app/financial-intelligence/loading.tsx"),
  ]);

  assert.match(financial, /FINANCE · TRADING &amp; RECONCILIATION/);
  assert.match(financial, /Verified net revenue/);
  assert.match(financial, /RECONCILIATION/);
  assert.match(intelligence, /Product Performance/);
  assert.match(profitability, /PRODUCT PROFITABILITY/);
  assert.match(commercial, /Cash &amp; Purchasing Capacity/);
  assert.match(wallet, /FINANCE · CASH &amp; PURCHASING CAPACITY/);
  assert.match(workspace, /SUPPLIER CONFIGURATION/);
  assert.match(workspace, /Supplier rules and cost profiles will ultimately live under Suppliers\/Catalogue\./);
  assert.match(workspace, /<SupplierPurchasing/);
  assert.match(workspace, /<SupplierCostProfiles/);
  assert.match(productDetail, /Search Product Performance\.\.\./);
  assert.match(productDetail, /Product performance online/);
  assert.match(productDetail, /Product performance unavailable/);
  assert.match(productDetail, /Back to Product Performance/);
  assert.match(financialLoading, /FINANCE/);
  assert.match(financialLoading, /Trading & Reconciliation/);
  assert.match(financialPage, /Finance · Trading & Reconciliation unavailable/);
});

test("Product Performance no longer presents the broad store or placeholder Meta dashboards", async () => {
  const intelligence = await read("../app/intelligence/page.tsx");

  assert.doesNotMatch(intelligence, /aria-label="Store intelligence summary"/);
  assert.doesNotMatch(intelligence, /META EFFICIENCY/);
  assert.doesNotMatch(intelligence, /Waiting for trusted ad data/);
  assert.match(intelligence, /<ProductProfitabilityPanel/);
  assert.match(intelligence, /PRODUCT MOMENTUM/);
});

test("Finance deep links and canonical loaders remain protected", async () => {
  const [profitability, productDetail, intelligence, financial] = await Promise.all([
    read("../components/intelligence/ProductProfitabilityPanel.tsx"),
    read("../app/intelligence/products/[productId]/page.tsx"),
    read("../app/intelligence/page.tsx"),
    read("../app/financial-intelligence/page.tsx"),
  ]);

  assert.match(profitability, /href={`\/intelligence\/products\/\$\{encodeURIComponent\(row\.productId\)\}\?profitPeriod=\$\{period\}`}/);
  assert.match(productDetail, /href={`\/intelligence\?profitPeriod=\$\{period\}`}/);
  assert.match(intelligence, /StoreIntelligence\.getSnapshot\(/);
  assert.match(financial, /FinancialIntelligenceRepository\.getSnapshot\(financialRangeForPeriod\(period\)\)/);
});
