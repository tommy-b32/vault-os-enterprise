import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../app/purchase-intelligence/page.tsx", import.meta.url), "utf8");

test("only trusted, positive recommendations render the add-to-draft CTA", () => {
  assert.match(source, /result\.recommendation\.trusted/);
  assert.match(source, /recommendedPackCount \?\? 0\) > 0/);
  assert.match(source, /recommendedTotalUnits \?\? 0\) > 0/);
  assert.match(source, /Add to Draft PO/);
  assert.match(source, /buyNothing = recommendations\.filter/);
  assert.match(source, /unavailable = results\.filter/);
  assert.match(source, /notApplicable = results\.filter/);
});

test("recommendation actions reuse the established primary and secondary Vault OS controls", () => {
  assert.match(source, /className="vault-secondary-button" type="button" aria-expanded=\{expanded\}/);
  assert.match(source, /className="vault-primary-button" type="button" disabled=\{pending\}/);
  assert.match(source, /<Link className="vault-secondary-button" href=\{`\/purchase-orders\/\$\{purchaseOrderId\}`\}/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /pending \? "Adding…" : "Add to Draft PO"/);
});

test("the client uses only the existing server action with the minimal request", () => {
  assert.match(source, /addFixedPackRecommendationToDraftAction/);
  assert.match(source, /\{ styleId, parentProductId, idempotencyKey: idempotencyKey\.current, targetDraftId: null \}/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  for (const forbidden of ["supplierId:", "recommendedPackCount:", "recommendedTotalUnits:", "packCost", "expectedProfit", "currency:", "variantId", "shopify"]) assert.doesNotMatch(source, new RegExp(forbidden));
  assert.doesNotMatch(source, /\.rpc\(|supabase|fetch\(/i);
});

test("page enriches names from canonical exact-ID lookups without new queries", () => {
  assert.match(pageSource, /fixedPackProductKey\(product\.style_id, product\.parent_product_id, product\.supplier_id \?\? ""\)/);
  assert.match(pageSource, /fixedPackProductKey\(result\.recommendation\.styleId, result\.recommendation\.parentProductId, result\.recommendation\.supplierId\)/);
  assert.match(pageSource, /products\.length === 1 \? products\[0\]\.product_name : null/);
  assert.match(pageSource, /new Map\(suppliers\.map\(\(supplier\) => \[supplier\.id, supplier\.name\]\)\)/);
  assert.match(pageSource, /supplierName: supplierNameById\.get\(result\.recommendation\.supplierId\) \?\? null/);
  assert.doesNotMatch(pageSource, /product_name.*split|supplier_name.*split/i);
});

test("panel renders canonical names with a safe identity fallback", () => {
  assert.match(source, /recommendation\.productName \?\? "Identity unavailable"/);
  assert.match(source, /recommendation\.supplierName \?\? "Identity unavailable"/);
  assert.match(source, /<td>\{recommendation\.modelDesign\}<\/td>/);
  assert.doesNotMatch(source, /<strong>\{recommendation\.parentProductId\}<\/strong>/);
  assert.doesNotMatch(source, /<td>\{recommendation\.supplierId\}<\/td>/);
});

test("human-readable names are excluded from the action request", () => {
  const request = source.match(/addFixedPackRecommendationToDraftAction\((\{[^}]+\})\)/)?.[1] ?? "";
  assert.match(request, /styleId/);
  assert.match(request, /parentProductId/);
  assert.match(request, /idempotencyKey/);
  assert.match(request, /targetDraftId: null/);
  assert.doesNotMatch(request, /productName|supplierName/);
});

test("submission is idempotent per intended retry and prevents duplicate pending clicks", () => {
  assert.match(source, /idempotencyKey\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(source, /if \(pending \|\| purchaseOrderId\) return/);
  assert.match(source, /disabled=\{pending\}/);
  assert.match(source, /pending \? "Adding…" : "Add to Draft PO"/);
});

test("success, including idempotent success, provides a draft link", () => {
  assert.match(source, /if \(result\.success\) setPurchaseOrderId\(result\.purchaseOrderId\)/);
  assert.match(source, /Added to Draft PO/);
  assert.match(source, /href=\{`\/purchase-orders\/\$\{purchaseOrderId\}`\}/);
  assert.match(source, /View Draft PO →/);
});

test("safe failure classifications are mapped and raw server errors are suppressed", () => {
  for (const [code, message] of [["refresh_required", "This recommendation has changed. Refresh and try again."], ["changed_recommendation", "This recommendation has changed. Refresh and review it before adding."], ["invalid_target_draft", "That draft PO can no longer be used."], ["multiple_eligible_drafts", "Multiple eligible draft POs exist. Open Purchase Orders and choose a draft."], ["canonical_data_incomplete", "Required purchasing data is incomplete. Review this recommendation before continuing."], ["operation_failed", "We couldn’t add this recommendation to a draft PO. Please try again."]]) {
    assert.ok(source.includes(`${code}: "${message}"`));
  }
  assert.match(source, /SAFE_FAILURE_MESSAGES\[result\.code\] \?\? SAFE_FAILURE_MESSAGES\.operation_failed/);
  assert.match(source, /catch \{/);
  assert.doesNotMatch(source, /result\.message|error\.message/);
});

test("existing recommendation presentation remains intact", () => {
  assert.match(source, /View size evidence/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /recommendation\.sizes\.map\(\(size\) =>/);
  assert.match(source, /REASON_EXPLANATIONS\[reason\] \?\? reason/);
  assert.match(source, /<small>\{reason\}<\/small>/);
  assert.match(source, /Pack composition/);
  assert.match(source, /localeCompare/);
  assert.match(source, /buyNothing\.flatMap\(\(result\) => result\.recommendation\.reasonCodes\)/);
  assert.match(source, /unavailable\.flatMap\(\(result\) => result\.reasons\)/);
  assert.match(source, /notApplicable\.flatMap\(\(result\) => result\.reasons\)/);
});
