import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../../../supabase/migrations/20261029000000_governed_pack_profiles.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../app/catalogue/actions.ts", import.meta.url), "utf8");
const businessTab = await readFile(new URL("../components/catalogue/editor/ProductBusinessTab.tsx", import.meta.url), "utf8");
const manager = await readFile(new URL("../app/catalogue/pack-profiles/page.tsx", import.meta.url), "utf8");

test("pack profiles are reusable governed data with preserved legacy identities", () => {
  assert.match(migration, /create table public\.vault_pack_profiles/i);
  assert.match(migration, /units_per_pack integer check \(units_per_pack is null or units_per_pack > 0\)/);
  assert.match(migration, /\('tee_5_piece', 'Tee', 5\)/);
  assert.match(migration, /\('polo_6_piece', 'Polo', 6\)/);
  assert.match(migration, /foreign key \(pack_profile\) references public\.vault_pack_profiles\(id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.vault_pack_profiles from public, anon, authenticated/);
});

test("product selection is validated against active governed profiles, not a hard-coded list", () => {
  assert.doesNotMatch(actions, /allowedPackProfiles/);
  assert.match(actions, /from\("vault_pack_profiles"\)/);
  assert.match(actions, /Choose an active governed pack profile/);
  assert.match(actions, /savePackProfile/);
});

test("operators can manage reusable profiles and products receive the dynamic list", () => {
  assert.match(businessTab, /Manage reusable pack profiles/);
  assert.match(businessTab, /profile\.display_name/);
  assert.match(businessTab, /profile\.units_per_pack/);
  assert.match(manager, /Add pack profile/);
  assert.match(manager, /Create pack profile/);
  assert.match(manager, /Existing profiles/);
});
