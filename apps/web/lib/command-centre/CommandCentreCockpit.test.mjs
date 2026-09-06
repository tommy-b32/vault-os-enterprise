import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createWebsiteTrafficBreakdown,
  deriveBusinessPulse,
  limitFeed,
  limitInsights,
  notConnected,
  reconcileTimelineInventoryFreshness,
  selectAttentionItems,
  selectTodaysFocus,
  unavailable,
} from "./CommandCentreCockpit.ts";
import { getAttentionPriorityPresentation } from "./AttentionPriorityPresentation.ts";

test("attention severity presentation maps every canonical priority to a distinct labelled tone", () => {
  const expected = {
    critical: ["is-critical", "CRITICAL"],
    high: ["is-high", "HIGH"],
    medium: ["is-medium", "MEDIUM"],
    low: ["is-low", "LOW"],
    informational: ["is-informational", "INFORMATIONAL"],
  };

  for (const [priority, [className, label]] of Object.entries(expected)) {
    const presentation = getAttentionPriorityPresentation(priority);
    assert.equal(presentation.className, className);
    assert.equal(presentation.label, label);
    assert.equal(presentation.accessibilityLabel, `Severity: ${label[0]}${label.slice(1).toLowerCase()}`);
  }
});

test("unknown attention severity falls back to visible unavailable presentation", () => {
  assert.deepEqual(getAttentionPriorityPresentation("unexpected"), {
    className: "is-unavailable",
    label: "UNAVAILABLE",
    accessibilityLabel: "Severity: Unavailable",
  });
});

test("attention badges retain visible severity text, accessible labels, and distinct colour classes", async () => {
  const component = await readFile(
    new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url),
    "utf8",
  );

  assert.match(component, /aria-label=\{severity\.accessibilityLabel\}/);
  assert.match(component, />\{severity\.label\}<\/span>/);
  for (const className of ["critical", "high", "medium", "low", "informational", "unavailable"]) {
    assert.match(component, new RegExp(`\\.cc-priority\\.is-${className}\\{[^}]*border-color:[^}]*color:[^}]*background:`));
  }
});

test("Command Centre reconciles obsolete stale presentation with canonical inventory status", () => {
  const staleItem = timelineItem({
    id: "classifier-inventory-stale",
    blockerReasons: ["inventory_stale"],
  });
  const supplierItem = timelineItem({
    id: "classifier-supplier-minimum",
    source: "supplier",
    blockerReasons: ["supplier_minimum_unknown"],
  });
  const timeline = {
    generatedAt: "2026-08-05T12:00:00.000Z",
    highestPriorityAction: null,
    items: [staleItem, supplierItem],
    groups: [{ label: "Blocked", items: [staleItem, supplierItem] }],
  };

  const current = reconcileTimelineInventoryFreshness({ timeline, syncStatus: "current" });
  assert.deepEqual(current.items.map((item) => item.id), ["classifier-supplier-minimum"]);
  assert.deepEqual(current.groups[0].items.map((item) => item.id), ["classifier-supplier-minimum"]);
  assert.equal(timeline.items.length, 2);

  const delayed = reconcileTimelineInventoryFreshness({ timeline, syncStatus: "delayed" });
  assert.equal(delayed.items.length, 2);
});

test("Command Centre typography has an 11px minimum and preserves readable hierarchy", async () => {
  const component = await readFile(
    new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url),
    "utf8",
  );
  const sizes = [...component.matchAll(/font-size:(\d+)px/g)].map((match) => Number(match[1]));

  assert.ok(sizes.length > 0);
  assert.ok(sizes.every((size) => size >= 11));
  assert.match(component, /font-size:34px/);
  assert.match(component, /cc-briefing-headline[^}]*font-size:20px/);
  assert.match(component, /cc-briefing-summary[^}]*font-size:14px/);
});

test("readability restyle preserves all executive and domain content", async () => {
  const [component, contract] = await Promise.all([
    readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("./CommandCentreCockpit.ts", import.meta.url), "utf8"),
  ]);

  for (const section of ["headline", "summary", "positives", "blockers", "todayFocus", "unlocks", "supportingEvidence"]) {
    assert.match(component, new RegExp(`executiveBriefing\\.${section}`));
  }
  for (const domain of ["Trading", "Website", "Inventory", "Finance", "Marketing", "Operations", "Suppliers", "Advisor"]) {
    assert.match(contract, new RegExp(`\\b${domain}\\b`));
  }
  assert.match(component, /data\.attention\.map/);
  assert.match(component, /Estimated untracked/);
  assert.match(component, /Not connected/);
  assert.match(component, /Unavailable/);
});

test("premium redesign preserves every original KPI and snapshot field", async () => {
  const component = await readFile(
    new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url),
    "utf8",
  );

  for (const title of [
    "Revenue Today", "Orders Today", "Website Traffic", "Meta Ads", "Finance Position",
  ]) {
    assert.match(component, new RegExp(`eyebrow="${title}"`));
  }

  for (const label of [
    "Tracked visitors", "Estimated untracked visitors", "Estimated total visitors",
    "Add-to-cart rate", "Checkout rate", "Conversion rate", "Abandoned checkouts",
    "Low-stock styles", "Out-of-stock styles", "Total stock value", "Inventory", "Reorder review",
    "Awaiting fulfilment", "Dispatched today", "Refunds today", "Supplier issues", "Late deliveries",
  ]) {
    assert.match(component, new RegExp(`label="${label}"`));
  }
  for (const label of ["Human Shopify sessions", "Shopify checkout sessions", "Shopify completed-checkout sessions"]) {
    assert.match(component, new RegExp(label));
  }

  for (const label of ["Spend today", "Meta-attributed revenue", "Purchases", "Cost per purchase", "ROAS", "CTR", "CPC", "CPM", "Landing page view rate"]) {
    assert.ok(component.includes(`label="${label}"`));
  }
  assert.match(component, /<Sparkline points=\{trend\}/);
  assert.match(component, /Live trend building/);
  assert.match(component, /role="img"/);
  assert.match(component, /Seven-day live trend from/);
  for (const preserved of [
    "Business Pulse", "Executive Intelligence", "Going well",
    "Limiting the business", "Supporting evidence", "Today&apos;s Focus",
    "Unlocks", "Needs Your Attention", "Latest Business Activity",
    "Sales Funnel", "Inventory Snapshot", "Marketing Snapshot",
    "Operations Snapshot", "CommandCentreLiveRefresh", "Sources current",
  ]) {
    assert.match(component, new RegExp(preserved));
  }
  for (const destination of ["/missions", "/orders", "/inventory"]) {
    assert.match(component, new RegExp(destination));
  }
  for (const breakpoint of ["1500", "1050", "820", "600"]) {
    assert.match(component, new RegExp(`max-width:${breakpoint}px`));
  }
});

test("Website Traffic identifies human-only Shopify Analytics and preserves the complete partial funnel without replacing Vault tracking", async () => {
  const [component, loader] = await Promise.all([
    readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8"),
  ]);

  for (const metric of [
    "shopifyAnalytics.sessions",
    "shopifyAnalytics.visitors",
    "shopifyAnalytics.cartAdditions",
    "shopifyAnalytics.reachedCheckout",
    "shopifyAnalytics.completedCheckout",
    "shopifyAnalytics.conversionRate",
  ]) {
    assert.match(component, new RegExp(metric.replace(".", "\\.")));
  }
  for (const label of [
    "Human Shopify sessions", "Online store visitors", "Cart additions",
    "Reached checkout", "Completed checkout", "Human-session conversion",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /shopifyAnalyticsAvailable \? <div className="cc-shopify-analytics">\s*<div className="cc-shopify-source">Shopify Analytics · Automated traffic excluded<\/div>/);
  assert.doesNotMatch(component, /"Shopify sessions"|Shopify conversion rate/);
  assert.match(component, /shopifyAnalytics\.sessions\.updatedAt/);
  assert.match(component, /\.cc-kpi-values span\{overflow-wrap:anywhere;/);
  assert.match(component, /@media\(max-width:600px\)\{[^\n]*\.cc-kpi-values\{grid-template-columns:1fr\}/);
  assert.match(component, /Today · Partial \/ in progress/);
  assert.match(component, /availability === "live" \? "Live" : "Stale"/);
  assert.match(component, /cc-shopify-status strong\.is-stale/);
  assert.match(component, /reportingTimezone/);
  assert.match(component, /shopifyAnalytics\.sessionTrend/);
  assert.match(component, /Pending Shopify reporting access/);
  assert.match(component, /Shopify Analytics unavailable/);
  assert.match(component, /shopifyAnalyticsAvailable \?/);
  assert.match(component, /Vault live tracking/);
  assert.match(component, /Consented sessions/);
  assert.match(component, /Abandoned-checkout evidence/);
  assert.match(loader, /value === null \|\| value === undefined/);
  assert.doesNotMatch(loader, /!value/);
  assert.doesNotMatch(component, /shopifyAnalytics\.(?:sessions|visitors|cartAdditions|reachedCheckout|completedCheckout|conversionRate)\.value\s*\|\|/);
});

const timelineItem = (overrides) => ({
  id: "item",
  source: "inventory",
  category: "blocker",
  status: "blocked",
  priority: "high",
  title: "Resolve inventory blocker",
  description: "Inventory evidence is incomplete.",
  effectiveAt: null,
  deadlineAt: null,
  predictedAt: null,
  confidence: null,
  confidenceMeaning: null,
  entityType: null,
  entityId: null,
  destination: "/inventory",
  evidence: [],
  blockerReasons: [],
  ...overrides,
});

test("Today’s Focus prefers an eligible Advisor action before a blocker", () => {
  const focus = selectTodaysFocus({ items: [
    timelineItem({ id: "critical-blocker", priority: "critical" }),
    timelineItem({ id: "advisor", source: "advisor", status: "actionable", category: "decision", priority: "high", destination: "/advisor" }),
  ] });
  assert.equal(focus.state, "available");
  assert.equal(focus.source, "advisor");
  assert.equal(focus.destination, "/advisor");
});

test("Today’s Focus falls back to the highest-priority resolvable blocker", () => {
  const focus = selectTodaysFocus({ items: [
    timelineItem({ id: "medium", priority: "medium" }),
    timelineItem({ id: "critical", priority: "critical", destination: "/catalogue" }),
  ] });
  assert.equal(focus.state, "available");
  assert.equal(focus.source, "blocker");
  assert.equal(focus.destination, "/catalogue");
  assert.equal(selectTodaysFocus(null).state, "unavailable");
});

test("Business Pulse uses explicit states without a fabricated percentage", () => {
  const domains = [
    { domain: "Trading", state: "healthy", detail: "Current" },
    { domain: "Inventory", state: "attention", detail: "Source stale" },
    { domain: "Marketing", state: "not_connected", detail: "Meta not connected" },
    { domain: "Operations", state: "watch", detail: "Partial visibility" },
    { domain: "Advisor", state: "watch", detail: "No trusted candidate" },
  ];
  const pulse = deriveBusinessPulse({ domains, attention: [] });
  assert.deepEqual(pulse, { state: "attention", label: "Attention" });
  assert.doesNotMatch(JSON.stringify(pulse), /%/);
  assert.notEqual(domains.find((domain) => domain.domain === "Inventory").state, "healthy");
  assert.notEqual(domains.find((domain) => domain.domain === "Operations").detail, "Healthy");
  assert.notEqual(domains.find((domain) => domain.domain === "Advisor").state, "critical");
});

test("optional Meta disconnection does not make an otherwise healthy pulse critical", () => {
  const pulse = deriveBusinessPulse({
    domains: [
      { domain: "Trading", state: "healthy", detail: "Current" },
      { domain: "Marketing", state: "not_connected", detail: "Meta not connected" },
    ],
    attention: [],
  });
  assert.equal(pulse.state, "healthy");
});

test("canonical consent-aware traffic fields remain separate", () => {
  const traffic = createWebsiteTrafficBreakdown({
    tracked: 0,
    estimatedUntracked: 61,
    estimatedTotal: 61,
    liveTracked: 2,
    updatedAt: "2026-08-05T09:00:00Z",
    stale: false,
  });

  assert.equal(traffic.trackedVisitors.value, 0);
  assert.equal(traffic.estimatedUntrackedVisitors.value, 61);
  assert.equal(traffic.estimatedTotalVisitors.value, 61);
  assert.equal(traffic.liveTrackedVisitors.value, 2);
});

test("missing canonical estimate stays unavailable while tracked zero stays available", () => {
  const traffic = createWebsiteTrafficBreakdown({
    tracked: 0,
    estimatedUntracked: null,
    estimatedTotal: null,
    liveTracked: null,
    updatedAt: "2026-08-05T09:00:00Z",
    stale: false,
  });

  assert.deepEqual(traffic.trackedVisitors.value, 0);
  assert.equal(traffic.trackedVisitors.state, "available");
  assert.equal(traffic.estimatedUntrackedVisitors.state, "unavailable");
  assert.equal(traffic.estimatedTotalVisitors.state, "unavailable");
});

test("canonical zero remains distinct from unavailable", () => {
  const zero = { state: "available", value: 0, updatedAt: "2026-08-05T09:00:00Z" };
  assert.equal(zero.value, 0);
  assert.equal(unavailable().value, null);
  assert.notEqual(zero.state, unavailable().state);
});

test("notConnected values retain their explicit empty state", () => {
  assert.deepEqual(notConnected(), {
    state: "not_connected",
    value: null,
    updatedAt: null,
  });
});

test("brief, attention, and business feed respect compact limits", () => {
  assert.equal(limitInsights(Array.from({ length: 7 }, (_, id) => ({ id: String(id) }))).length, 4);
  assert.equal(limitFeed(Array.from({ length: 7 }, (_, id) => ({ id: String(id) }))).length, 3);

  const timeline = {
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `blocker-${index}`,
      source: "inventory",
      status: "blocked",
      category: "blocker",
      priority: "high",
      title: `Blocker ${index}`,
      description: null,
      destination: "/inventory",
    })),
  };
  assert.equal(selectAttentionItems(timeline).length, 4);
  assert.deepEqual(
    selectAttentionItems(timeline).map((item) => item.id),
    ["blocker-0", "blocker-1", "blocker-2", "blocker-3"],
  );
});

test("timeline business events are not promoted without intelligence evidence", () => {
  const timeline = {
    items: [{
      id: "raw-event",
      source: "business_event",
      status: "actionable",
      category: "change",
      priority: "high",
      title: "Order created",
      description: null,
      destination: "/orders",
    }],
  };
  assert.deepEqual(selectAttentionItems(timeline), []);
});

test("cockpit uses canonical loaders, valid routes, and no demonstration data", async () => {
  const [loader, component, page] = await Promise.all([
    readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loader, /getVaultBusinessState/);
  assert.match(loader, /trading\.netRevenue/);
  assert.match(loader, /trading\.orderCount/);
  assert.match(loader, /getCommercialDecisionTimeline/);
  assert.doesNotMatch(`${loader}${component}${page}`, /demonstrationPredictionData|demonstrationOperationalSnapshot/);
  assert.doesNotMatch(`${loader}${component}`, /demonstrationLearningData/);
  assert.doesNotMatch(component, /comparison\.value.*\?\?\s*0/);
  assert.match(component, /Estimated total visitors/);
  assert.match(component, /Estimated untracked/);
  assert.doesNotMatch(component, /eyebrow="Website Conversion"/);
  assert.match(component, /eyebrow="Website Traffic"[^>]*shopifyAnalyticsAvailable[^>]*"Human Shopify sessions"[^>]*"Online store visitors"[^>]*"Human-session conversion"/);
  assert.match(component, /Pending Shopify reporting access/);
  assert.match(component, /Live tracked/);
  assert.doesNotMatch(component, /UK share|ukTrafficPercentage/);
  assert.match(loader, /conversionRate: funnelResult/);
  assert.match(loader, /addToCartToday: funnelResult/);
  assert.match(loader, /abandonedCheckouts: funnelResult/);
  assert.doesNotMatch(component, /eyebrow="Add to Cart Today"/);
  assert.doesNotMatch(component, /eyebrow="Abandoned Checkouts"/);
  assert.match(loader, /estimatedPrivacy/);
  assert.doesNotMatch(loader, /estimatedTotal\s*=|tracked\s*\+\s*estimatedPrivacy/);
  assert.doesNotMatch(loader, /estimated total visitors today[\s\S]{0,120}directly tracked/);
  assert.doesNotMatch(component, /CommercialDecisionTimeline/);
  assert.match(component, /comparison && \(comparison\.state === "available" \|\| comparison\.state === "stale"\)/);
  assert.match(component, /State-based · no invented score/);
  assert.match(loader, /Partial visibility/);
  assert.match(loader, /ExecutiveIntelligenceEngine\.build/);
  assert.doesNotMatch(component, /cc-focus-body|executiveSummary/);

  for (const route of ["/missions", "/orders"]) {
    assert.match(component, new RegExp(route.replace("/", "\\/")));
  }
});

test("Command Centre presentation dependency graph is acyclic", async () => {
  const [engine, contract, loader, component, page] = await Promise.all([
    readFile(new URL("../brain/ExecutiveIntelligenceEngine.ts", import.meta.url), "utf8"),
    readFile(new URL("./CommandCentreCockpit.ts", import.meta.url), "utf8"),
    readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(engine, /command-centre|getCommandCentreCockpit|CommandCentreCockpit/);
  assert.doesNotMatch(contract, /getCommandCentreCockpit|components\/command-centre/);
  assert.doesNotMatch(loader, /components\/command-centre\/CommandCentreCockpit/);
  assert.doesNotMatch(component, /getCommandCentreCockpit/);
  assert.match(page, /getCommandCentreCockpit/);
  assert.match(page, /components\/command-centre\/CommandCentreCockpit/);
});
