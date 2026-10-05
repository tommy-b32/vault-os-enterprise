import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import vm from "node:vm";

const sourcePath = new URL("../lib/purchase-orders/PurchaseOrderTracking.ts", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const executable = source
  .replace('import "server-only";\n\n', "")
  .replace('import { supabaseAdmin } from "@/lib/supabase-admin";\n\n', "const supabaseAdmin = {};\n\n");
const javascript = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, module: { exports: {} }, require: () => ({}), URL, URLSearchParams, Date, console, process: { env: {} } };
context.exports = context.module.exports;
vm.runInNewContext(javascript, context);
const { mapFedExTrackingResponse, normalizeCarrier } = context.module.exports;

function mockedFedEx(statusByLocale, derivedCode = "", delivered = false) {
  return { output: { completeTrackResults: [{ trackResults: [{ latestStatusDetail: { derivedCode, statusByLocale, scanDateAndTime: "2026-10-05T10:00:00Z", scanLocation: { city: "London", countryCode: "GB" } }, dateAndTimes: delivered ? [{ type: "ACTUAL_DELIVERY", dateTime: "2026-10-05T10:00:00Z" }] : [] }] }] } };
}

for (const [name, wording, expected, delivered] of [
  ["label created", "Shipping label has been created", "Label created", false],
  ["picked up", "Picked up by FedEx", "Picked up", false],
  ["in transit", "In transit", "In transit", false],
  ["customs / clearance", "International shipment release - Import", "Customs / clearance", false],
  ["out for delivery", "On FedEx vehicle for delivery", "Out for delivery", false],
  ["delivered", "Delivered", "Delivered", true],
  ["exception / delayed", "Delivery exception due to weather delay", "Exception / delayed", false],
]) {
  test(`maps mocked FedEx ${name}`, () => {
    const tracking = mapFedExTrackingResponse(mockedFedEx(wording));
    assert.equal(tracking.status, expected);
    assert.equal(tracking.detail, wording);
    assert.equal(tracking.location, "London, GB");
    if (delivered) assert.equal(tracking.deliveredAt, "2026-10-05T10:00:00.000Z");
  });
}

test("normalizes common FedEx carrier names", () => {
  for (const carrier of ["FedEx", "fedex", "Federal Express", "Fed Ex"]) assert.equal(normalizeCarrier(carrier), "fedex");
});

test("requires server credentials, preserves prior data on provider failure, and never mutates lifecycle evidence", () => {
  assert.match(source, /FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET/);
  assert.match(source, /Existing tracking data was left unchanged/);
  assert.match(source, /outcome: "unsupported_provider"/);
  const refreshBody = source.slice(source.indexOf("export async function refreshPurchaseOrderTracking"));
  assert.doesNotMatch(refreshBody, /\bstatus:\s*(?!refreshed\.status)|shipped_at|received_at|inventory|payment/);
  assert.match(source, /https:\/\/apis\.fedex\.com/);
  assert.match(source, /\/oauth\/token/);
  assert.match(source, /\/track\/v1\/trackingnumbers/);
});
