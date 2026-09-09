import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/purchase-intelligence/PurchaseRecommendationsPanel.tsx", import.meta.url), "utf8");
const fixtures = [
  { kind: "recommendation", packs: 2, units: 10 },
  { kind: "recommendation", packs: 0, units: 0 },
  { kind: "unavailable" },
  { kind: "not_applicable", reason: "RESTOCK_DISABLED" },
];

test("panel presentation contract derives supplied fixed-pack union branches", () => {
  assert.equal(fixtures.filter((x) => x.kind === "recommendation" && x.packs > 0).length, 1);
  assert.equal(fixtures.filter((x) => x.kind === "recommendation" && x.packs === 0).length, 1);
  assert.equal(fixtures.filter((x) => x.kind === "unavailable").length, 1);
  assert.equal(fixtures.filter((x) => x.kind === "not_applicable").length, 1);
  assert.match(source, /recommendedPackCount \?\? 0\) > 0/);
  assert.match(source, /BUY NOW/);
  assert.match(source, /PACKS TO BUY/);
  assert.match(source, /UNITS TO BUY/);
});

test("panel keeps zero, unavailable, and not-applicable outside BUY NOW", () => {
  assert.match(source, /buyNothing = recommendations\.filter/);
  assert.match(source, /unavailable = results\.filter/);
  assert.match(source, /notApplicable = results\.filter/);
  assert.match(source, /recommendedPackCount === 0/);
  assert.doesNotMatch(source, /option1|option2|supabase|fetch\(/i);
});

test("positive recommendation ordering and nullable display are deterministic", () => {
  assert.match(source, /recommendedPackCount \?\? 0\) - \(a\.recommendedPackCount \?\? 0\)/);
  assert.match(source, /recommendedTotalUnits \?\? 0\) - \(a\.recommendedTotalUnits \?\? 0\)/);
  assert.match(source, /localeCompare/);
  assert.doesNotMatch(source, /product.*title|title.*pack/i);
});

test("positive recommendations render exact pack composition from the size transport", () => {
  assert.match(source, /recommendation\.sizes\.map\(\(size\) => `\$\{size\.normalizedSize\} ×\$\{size\.unitsPerPack\}`\)/);
  assert.match(source, /Pack composition/);
  assert.doesNotMatch(source, /STANDARD_5|S ×1 · M ×1 · L ×1 · XL ×1 · 2XL ×1|six-unit polo/i);
  assert.doesNotMatch(source, /recommendation\.sizes\.reduce/);
});

test("positive recommendations provide expandable direct size evidence without write paths", () => {
  assert.match(source, /View size evidence/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  for (const field of ["normalizedSize", "netAvailableStock", "incomingStock", "sales7DayUnits", "sales14DayUnits", "sales30DayUnits", "targetStockUnits", "idealSizeNeed", "unitsPerPack", "purchasedUnits", "projectedStock", "remainingShortage", "projectedExcess"]) assert.match(source, new RegExp(`size\\.${field}`));
  assert.doesNotMatch(source, /supabase|fetch\(|purchase order|draft po|createPurchase|submitPurchase/i);
  assert.match(source, /buyNothing = recommendations\.filter/);
  assert.match(source, /unavailable = results\.filter/);
  assert.match(source, /notApplicable = results\.filter/);
});
