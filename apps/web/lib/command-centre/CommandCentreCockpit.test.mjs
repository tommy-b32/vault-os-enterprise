import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { selectAttentionItems } from "./CommandCentreCockpit.ts";

const cockpitPath = new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url);
const timelineItem = (overrides = {}) => ({ id: "item", source: "inventory", category: "blocker", status: "blocked", priority: "high", title: "Resolve inventory blocker", description: "Inventory evidence is incomplete.", effectiveAt: null, deadlineAt: null, predictedAt: null, confidence: null, confidenceMeaning: null, entityType: null, entityId: null, destination: "/inventory", evidence: [], blockerReasons: [], affectedParentProductIds: [], affectedStyleIds: [], ...overrides });

test("selectAttentionItems excludes informational events and retains destination-bearing risks, follow-ups, and actions", () => {
  const selected = selectAttentionItems({ items: [
    timelineItem({ id: "event", source: "business_event", status: "actionable", destination: "/orders" }),
    timelineItem({ id: "no-destination", destination: null }),
    timelineItem({ id: "risk", status: "observed", category: "risk", destination: "/inventory" }),
    timelineItem({ id: "follow-up", status: "observed", category: "follow_up", destination: "/commercial" }),
    timelineItem({ id: "action", status: "actionable", category: "decision", destination: "/advisor" }),
  ] });
  assert.deepEqual(selected.map((item) => item.id), ["risk", "follow-up", "action"]);
  assert.ok(selected.every((item) => item.destination.startsWith("/")));
});

test("cockpit preserves the four canonical KPI destinations and safe state wording", async () => {
  const component = await readFile(cockpitPath, "utf8");
  for (const [title, href] of [["Revenue today", "/financial-intelligence"], ["Orders today", "/orders"], ["Inventory exceptions", "/inventory"], ["Purchasing capacity", "/commercial"]]) assert.match(component, new RegExp(`Kpi title="${title}"[\\s\\S]{0,900}href="${href}"`));
  assert.match(component, /Order data stale|Order data unavailable/);
  assert.match(component, /Inventory status unavailable|Inventory freshness unknown/);
  assert.match(component, /Purchasing capacity status stale|Purchasing capacity status unavailable/);
  assert.match(component, /Net Shopify revenue.*stale/);
});

test("cockpit keeps secondary sections collapsed and makes all attention items reachable", async () => {
  const component = await readFile(cockpitPath, "utf8");
  assert.equal((component.match(/<Kpi title=/g) ?? []).length, 4);
  assert.match(component, /<details className="cc-card cc-snapshot">/);
  assert.match(component, /<details className="cc-card cc-diagnostics">/);
  assert.doesNotMatch(component, /cc-snapshot" open|cc-diagnostics" open/);
  assert.match(component, /attentionPreview = data\.attention\.slice\(0, 3\)/);
  assert.match(component, /View all \{data\.attention\.length\} items/);
  assert.match(component, /remainingAttention\.map/);
});

test("cockpit retains attention and briefing action links without legacy dashboard sections", async () => {
  const component = await readFile(cockpitPath, "utf8");
  assert.match(component, /href=\{item\.destination\}/);
  assert.match(component, /Recommended next action/);
  assert.match(component, /href=\{data\.executiveBriefing\.todayFocus\.destination\}/);
  assert.doesNotMatch(component, /Todayâ€™s Performance|Latest Business Activity|Recent Cash Ledger|Recent Orders/);
  assert.equal((component.match(/test\.skip/g) ?? []).length, 0);
});
