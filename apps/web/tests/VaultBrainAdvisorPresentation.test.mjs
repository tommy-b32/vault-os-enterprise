import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Vault Brain presents one governed primary action before missions and secondary detail", async () => {
  const source = await read("components/brain/VaultBrainV2.tsx");

  const primary = source.indexOf("PRIMARY RECOMMENDED ACTION");
  const missions = source.indexOf("PRIORITISED MISSIONS");
  const blockers = source.indexOf("What is limiting stronger decisions");
  const evidence = source.indexOf("EVIDENCE / WHY");
  const history = source.indexOf("HISTORY / MEMORY / PREDICTIONS");

  assert.ok(primary >= 0);
  assert.ok(primary < missions);
  assert.ok(missions < blockers);
  assert.ok(blockers < evidence);
  assert.ok(evidence < history);
  assert.match(source, /const primaryConclusion = selectPrimaryAction\(data\.conclusions\)/);
  assert.match(source, /const severityWeight: Record<VaultBrainConclusion\["severity"\], number>/);
  assert.match(source, /actionableConclusionStates: VaultBrainEvidenceState\[\] = \["proven", "blocked", "unavailable"\]/);
  assert.doesNotMatch(source, /const primaryConclusion = data\.conclusions\[0\]/);
  assert.match(source, /severityWeight\[conclusion\.severity\] > severityWeight\[selected\.severity\]/);
  assert.match(source, /Link href=\{primaryConclusion\.destination\}/);
  assert.match(source, /const remainingConclusions = data\.conclusions\.filter/);
  assert.match(source, /Open canonical workspace/);
  assert.match(source, /No immediate action recommended/);
  assert.match(source, /no current governed action requiring intervention/);
  assert.match(source, /href="#vault-brain-evidence"/);
  assert.match(source, /id="vault-brain-evidence"/);
  assert.match(source, /<details(?: id="vault-brain-evidence")? className="vault-brain-v2-details">/);
  assert.doesNotMatch(source, /vault-brain-v2-details" open/);
});

test("Vault Brain keeps blockers actionable, evidence accessible, and governed history intact", async () => {
  const source = await read("components/brain/VaultBrainV2.tsx");

  assert.match(source, /actionableBlockers = data\.decisionTrace\.filter\(isActionableBlocker\)/);
  assert.match(source, /actionableBlockerStates: VaultBrainEvidenceState\[\] = \["blocked", "unavailable"\]/);
  assert.doesNotMatch(source, /actionableBlockerStates[^\n]*"watch"/);
  assert.doesNotMatch(source, /actionableBlockerStates[^\n]*"gathering_evidence"/);
  assert.match(source, /hasCorrectiveDestination\(stage\.destination\)/);
  assert.match(source, /destination\.startsWith\("\/"\)/);
  assert.match(source, /Resolve in \{stage\.source\}/);
  assert.match(source, /data\.decisionTrace\.map/);
  assert.match(source, /data\.blockerExplanations\.map/);
  assert.match(source, /Latest governed record/);
  assert.match(source, /Recent governed history/);
  assert.match(source, /Open Store Intelligence/);
  assert.doesNotMatch(source, /PurchaseIntelligenceEngine|AdvisorEngine|analyseOpportunities/);
});

test("Advisor remains accessible as a secondary commercial detail view", async () => {
  const source = await read("app/advisor/page.tsx");

  assert.match(source, /VAULT BRAIN \/ COMMERCIAL DETAIL/);
  assert.match(source, /href="\/missions"/);
  assert.match(source, /Open Vault Brain priorities/);
  assert.match(source, /View commercial evidence and inputs/);
  assert.match(source, /EVIDENCE \/ WHY/);
  assert.match(source, /const primaryDecision = analysis\.highestPriority/);
  assert.match(source, /analysis\.ranked\.slice\(1, 6\)/);
  assert.match(source, /buildDecisionBlockers/);
  const unavailableBranch = source.slice(source.indexOf("if (!result.advisor)"), source.indexOf("const \{ analysis, diagnostics \}"));
  assert.match(unavailableBranch, /Back to Vault Brain/);
  assert.match(unavailableBranch, /href="\/missions"/);
  assert.doesNotMatch(source, /getVaultBrainIntelligence/);
});
