import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");

test("only trusted, positive recommendations render the add-to-draft CTA", () => {
  assert.match(source, /result\.recommendation\.trusted/);
  assert.match(source, /recommendedPackCount \?\? 0\) > 0/);
  assert.match(source, /recommendedTotalUnits \?\? 0\) > 0/);
  assert.match(source, /Add to Draft PO/);
  assert.match(source, /buyNothing = recommendations\.filter/);
  assert.match(source, /unavailable = results\.filter/);
  assert.match(source, /notApplicable = results\.filter/);
});

test("the client uses only the existing server action with the minimal request", () => {
  assert.match(source, /addFixedPackRecommendationToDraftAction/);
  assert.match(source, /\{ styleId, parentProductId, idempotencyKey: idempotencyKey\.current, targetDraftId: null \}/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  for (const forbidden of ["supplierId:", "recommendedPackCount:", "recommendedTotalUnits:", "packCost", "expectedProfit", "currency:", "variantId", "shopify"]) assert.doesNotMatch(source, new RegExp(forbidden));
  assert.doesNotMatch(source, /\.rpc\(|supabase|fetch\(/i);
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
