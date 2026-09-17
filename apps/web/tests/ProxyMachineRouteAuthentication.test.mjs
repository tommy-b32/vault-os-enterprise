import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GOVERNED_DECISION_MEMORY_CAPTURE_PATH,
  bypassesInteractiveAuthentication,
} from "../lib/auth/machine-routes.ts";

test("only the exact governed memory capture path bypasses interactive authentication", () => {
  assert.equal(
    GOVERNED_DECISION_MEMORY_CAPTURE_PATH,
    "/api/internal/governed-decision-memory/capture",
  );
  assert.equal(bypassesInteractiveAuthentication(GOVERNED_DECISION_MEMORY_CAPTURE_PATH), true);

  for (const pathname of [
    "/api/internal/governed-decision-memory",
    "/api/internal/governed-decision-memory/capture/",
    "/api/internal/governed-decision-memory/capture/test",
    "/api/internal/other",
    "/api/inventory/refresh",
  ]) {
    assert.equal(bypassesInteractiveAuthentication(pathname), false, pathname);
  }
});

test("proxy performs the exact machine-route bypass before browser authentication setup", async () => {
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");

  assert.match(proxy, /if \(bypassesInteractiveAuthentication\(request\.nextUrl\.pathname\)\)/);
  assert.ok(
    proxy.indexOf("if (bypassesInteractiveAuthentication") < proxy.indexOf("process.env.NEXT_PUBLIC_SUPABASE_URL"),
  );
  assert.match(proxy, /request\.nextUrl\.pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(proxy, /startsWith\("\/api\/internal/);
});
