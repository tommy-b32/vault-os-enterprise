import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Vault Brain V2 is read-only and does not use legacy snapshots or demonstration intelligence", async () => {
  const page = await read("app/missions/page.tsx");
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(page, /getVaultBrainIntelligence/);
  assert.doesNotMatch(page, /saveOperationalSnapshot|createOperationalSnapshot|getPreviousOperationalSnapshot|DEMONSTRATION/);
  for (const text of ["12540", "7740", "3420", "Approve the prepared restock today", "Moncler Black Badge", "Tomorrow is likely", "2-for-£70"]) {
    assert.doesNotMatch(component, new RegExp(text));
  }
});

test("Vault Brain V2 reuses governed outputs for a decision trace without recreating policy", async () => {
  const model = await read("lib/brain/getVaultBrainIntelligence.ts");
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(model, /getCommandCentreCockpit/);
  assert.match(model, /getCommercialDecisionTimeline/);
  assert.match(model, /decisionTrace/);
  assert.match(model, /blockerReasons/);
  assert.doesNotMatch(model, /cockpit\.attention/);
  assert.doesNotMatch(model, /available_purchasing_power_gbp|TrustedBuyingCandidateClassifier|PurchaseIntelligenceEngine/);
  assert.match(component, /What Vault OS understands now/);
  assert.match(component, /DECISION TRACE/);
  assert.match(component, /data\.decisionTrace\.map/);
  assert.match(component, /GOVERNED DECISION REASONS/);
  assert.match(component, /does not create a buying, reorder, or approval recommendation/);
});

test("Vault Brain V2 fails closed, formats freshness for people, and links specialist surfaces", async () => {
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(component, /Freshness unavailable/);
  assert.match(component, /Intl\.DateTimeFormat/);
  assert.doesNotMatch(component, /toLocaleString/);
  assert.match(component, /No governed executive conclusion is currently available/);
  assert.match(component, /href="\/"/);
  assert.match(component, /href="\/intelligence"/);
  assert.match(component, /Open authoritative surface/);
});

test("Vault Brain V2 preserves the governed route contracts for every trace stage", async () => {
  const model = await read("lib/brain/getVaultBrainIntelligence.ts");

  for (const destination of ["/inventory", "/catalogue", "/commercial", "/purchase-intelligence", "/advisor"]) {
    assert.ok(model.includes(destination), `expected governed route ${destination}`);
  }
  assert.match(model, /No governed aggregate commercial-trust result is exposed/);
  assert.match(model, /No trusted buying action is currently required/);
});

test("Vault Brain V2 keeps missing evidence fail-closed at every governed boundary", async () => {
  const model = await read("lib/brain/getVaultBrainIntelligence.ts");

  assert.match(model, /domain\.state === "unavailable" \|\| domain\.state === "not_connected"/);
  assert.match(model, /commercial \? timelineState\(commercial\) : "unknown"/);
  assert.match(model, /wallet\.state === "stale" \? "watch" : "unavailable"/);
  assert.match(model, /decisionBoundary\(timeline\?\.reasonSummary/);
  assert.match(model, /outcome === "MIXED" \? "no_trusted_action"/);
  assert.match(model, /this alone does not approve a purchase/);
});
