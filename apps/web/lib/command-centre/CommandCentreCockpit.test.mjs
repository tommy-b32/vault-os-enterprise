import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  limitFeed,
  limitInsights,
  notConnected,
  selectAttentionItems,
  unavailable,
} from "./CommandCentreCockpit.ts";

test("canonical zero remains distinct from unavailable", () => {
  const zero = { state: "available", value: 0, updatedAt: "2026-08-05T09:00:00Z" };
  assert.equal(zero.value, 0);
  assert.equal(unavailable().value, null);
  assert.notEqual(zero.state, unavailable().state);
});

test("Meta values are explicitly not connected", () => {
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
  assert.doesNotMatch(component, /comparison\.value.*\?\?\s*0/);

  for (const route of ["/missions", "/orders"]) {
    assert.match(component, new RegExp(route.replace("/", "\\/")));
  }
});

test("Command Centre presentation dependency graph is acyclic", async () => {
  const [contract, loader, component, page] = await Promise.all([
    readFile(new URL("./CommandCentreCockpit.ts", import.meta.url), "utf8"),
    readFile(new URL("./getCommandCentreCockpit.ts", import.meta.url), "utf8"),
    readFile(new URL("../../components/command-centre/CommandCentreCockpit.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(contract, /getCommandCentreCockpit|components\/command-centre/);
  assert.doesNotMatch(loader, /components\/command-centre\/CommandCentreCockpit/);
  assert.doesNotMatch(component, /getCommandCentreCockpit/);
  assert.match(page, /getCommandCentreCockpit/);
  assert.match(page, /components\/command-centre\/CommandCentreCockpit/);
});
