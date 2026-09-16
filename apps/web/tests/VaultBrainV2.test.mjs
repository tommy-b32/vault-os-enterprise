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

test("Vault Brain V2 composes governed Command Centre outputs without recreating finance or buying calculations", async () => {
  const model = await read("lib/brain/getVaultBrainIntelligence.ts");
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(model, /getCommandCentreCockpit/);
  assert.match(model, /cockpit\.attention/);
  assert.match(model, /cockpit\.executiveBriefing\.supportingEvidence/);
  assert.doesNotMatch(model, /vault_purchasing_wallet|available_purchasing_power_gbp|TrustedBuyingCandidateClassifier/);
  assert.match(component, /No trusted buying candidate is available/);
  assert.match(component, /does not create a buying recommendation/);
});

test("Vault Brain V2 fails closed and links operators to governed specialist surfaces", async () => {
  const component = await read("components/brain/VaultBrainV2.tsx");

  assert.match(component, /Source freshness unavailable/);
  assert.match(component, /No governed executive conclusion is currently available/);
  assert.match(component, /href="\/"/);
  assert.match(component, /href="\/intelligence"/);
  assert.match(component, /Open authoritative surface/);
});
