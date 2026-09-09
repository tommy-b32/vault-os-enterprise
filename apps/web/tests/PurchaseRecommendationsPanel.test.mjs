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

test("panel translates known reason codes while retaining exact-code fallback and raw codes", () => {
  for (const [reason, explanation] of [
    ["ALL_SIZES_ABOVE_TARGET", "Stock is already above target"],
    ["SINGLE_SIZE_NEED_WAIT", "Only one size currently needs stock"],
    ["TWO_SIZE_NEED_WAIT", "Only two sizes currently need stock"],
    ["RESTOCK_DISABLED", "intentionally set to do not restock"],
    ["PACK_COMPOSITION_MISSING", "No approved supplier pack composition"],
    ["PACK_SIZE_EVIDENCE_MISSING", "Canonical size evidence is incomplete or ambiguous"],
    ["SEMANTIC_IDENTITY_UNRESOLVED", "identity is unresolved"],
    ["SUPPLIER_MISSING", "No supplier is assigned"],
  ]) {
    assert.match(source, new RegExp(`${reason}:\\s*"[^"]*${explanation}`));
  }
  assert.match(source, /REASON_EXPLANATIONS\[reason\] \?\? reason/);
  assert.match(source, /<small>\{reason\}<\/small>/);
  assert.doesNotMatch(source, /includes\(reason\)|startsWith\(reason\)|endsWith\(reason\)|\.match\(reason\)/);
});

test("reason presentation reuses the mapper without replacing transport UI or adding writes", () => {
  assert.match(source, /<ReasonList reasons=\{recommendation\.reasonCodes\}/);
  assert.match(source, /buyNothing\.flatMap\(\(result\) => result\.recommendation\.reasonCodes\)/);
  assert.match(source, /unavailable\.flatMap\(\(result\) => result\.reasons\)/);
  assert.match(source, /notApplicable\.flatMap\(\(result\) => result\.reasons\)/);
  assert.match(source, /View size evidence/);
  assert.match(source, /recommendation\.sizes\.map/);
  assert.doesNotMatch(source, /supabase|fetch\(|purchase order|draft po|createPurchase|submitPurchase/i);
});
