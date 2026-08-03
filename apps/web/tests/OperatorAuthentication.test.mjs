import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { safeDestination } from "../lib/auth/redirects.ts";
import { canCreateCashTransactions, hasVaultAccess } from "../lib/auth/rules.ts";

test("active owners and operators have access and mutation permission", () => {
  assert.equal(hasVaultAccess({ is_active: true }), true);
  assert.equal(canCreateCashTransactions("owner"), true);
  assert.equal(canCreateCashTransactions("operator"), true);
});

test("viewers can access Vault OS but cannot mutate cash", () => {
  assert.equal(hasVaultAccess({ is_active: true }), true);
  assert.equal(canCreateCashTransactions("viewer"), false);
});

test("inactive and missing operator profiles are denied", () => {
  assert.equal(hasVaultAccess({ is_active: false }), false);
  assert.equal(hasVaultAccess(null), false);
});

test("safe internal destinations are restored", () => {
  assert.equal(safeDestination("/commercial?panel=cash"), "/commercial?panel=cash");
});

test("redirect parameters cannot create an open redirect", () => {
  assert.equal(safeDestination("https://evil.example"), "/");
  assert.equal(safeDestination("//evil.example/path"), "/");
});

test("login uses one generic invalid-credentials message", async () => {
  const source = await readFile(new URL("../components/auth/LoginForm.tsx", import.meta.url), "utf8");
  assert.match(source, /Unable to sign in with those credentials/);
  assert.doesNotMatch(source, /user not found|email exists/i);
});

test("cash mutation derives attribution from authorization, not form data", async () => {
  const source = await readFile(new URL("../app/commercial/actions.ts", import.meta.url), "utf8");
  assert.match(source, /createdByOperatorId: operator\.id/);
  assert.doesNotMatch(source, /formData\.get\(["']created_by_operator_id/);
});

test("finance authorization occurs before repository insertion", async () => {
  const source = await readFile(new URL("../app/commercial/actions.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("requireOperatorRole") < source.indexOf("CashLedgerRepository.addTransaction"));
});

test("viewer is excluded from the finance mutation roles", async () => {
  const source = await readFile(new URL("../app/commercial/actions.ts", import.meta.url), "utf8");
  assert.match(source, /requireOperatorRole\(["']owner["'], ["']operator["']\)/);
});

test("migration preserves historical attribution and finance privacy", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260803150000_operator_authentication.sql", import.meta.url), "utf8");
  assert.match(migration, /created_by_operator_id uuid null/);
  assert.match(migration, /on delete set null/i);
  assert.match(migration, /revoke all on public\.vault_cash_transactions from anon, authenticated/i);
});

test("unauthenticated navigation redirects to login", async () => {
  const source = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(source, /return loginRedirect\(request\)/);
});

test("sign-out clears Supabase auth before redirecting", async () => {
  const source = await readFile(new URL("../components/auth/OperatorMenu.tsx", import.meta.url), "utf8");
  assert.ok(source.indexOf("supabase.auth.signOut()") < source.indexOf('router.replace("/login")'));
});
