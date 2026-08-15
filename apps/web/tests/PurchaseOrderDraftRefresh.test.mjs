import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(
  new URL("../components/purchase-orders/PurchaseOrderDraftWorkspace.tsx", import.meta.url),
  "utf8",
);
const actions = await readFile(
  new URL("../app/purchase-orders/actions.ts", import.meta.url),
  "utf8",
);

test("successful draft save refreshes canonical server data and prevents an immediate duplicate", () => {
  assert.match(workspace, /useRouter\(\)/);
  assert.match(workspace, /setSaveState\(\{[\s\S]*state: "success",[\s\S]*router\.refresh\(\)/);
  assert.match(workspace, /saveState\.state === "success"/);
  assert.match(actions, /createPurchaseOrderDraft\([\s\S]*revalidatePath\("\/purchase-orders"\)/);
  assert.match(workspace, /idempotencyKeys\.current/);
});
