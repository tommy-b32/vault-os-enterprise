import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared target-days presentation retains all four maturity outcomes", async () => {
  const timeline = await readFile(new URL("../lib/brain/CommercialDecisionTimeline.ts", import.meta.url), "utf8");

  assert.match(timeline, /export function targetStockDaysPresentationItems/);
  assert.match(timeline, /classifierBlockers\(candidates\).*target_stock_days_missing/s);
  assert.match(timeline, /monitoringItems\(candidates\).*target_stock_days_missing/s);
  assert.match(timeline, /state === "DEVELOPING_EVIDENCE" \? "medium" : "low"/);
  assert.match(timeline, /state === "UNKNOWN" \? "Trading history not yet verified"/);
  assert.match(timeline, /state === "LEARNING" \? "Gathering trading evidence"/);
  assert.match(timeline, /title: "Complete target stock days"/);
});

test("Advisor consumes the shared target-days presentation and retains the classifier-owned blocker", async () => {
  const [page, classifier] = await Promise.all([
    readFile(new URL("../app/advisor/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/brain/TrustedBuyingCandidateClassifier.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /targetStockDaysPresentationItems\(candidates\)/);
  assert.doesNotMatch(page, /diagnostics\.targetStockDaysMissing > 0/);
  assert.match(classifier, /add\(reasons, "target_stock_days_missing"\)/);
});
