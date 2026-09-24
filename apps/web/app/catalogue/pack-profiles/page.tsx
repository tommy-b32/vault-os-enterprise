import Link from "next/link";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { savePackProfile } from "@/app/catalogue/actions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function PackProfilesPage() {
  const { data: profiles, error } = await supabaseAdmin
    .from("vault_pack_profiles")
    .select("id, display_name, units_per_pack, active")
    .order("display_name", { ascending: true });

  if (error) throw new Error("Pack profiles could not be loaded.");

  return (
    <VaultAppShell searchPlaceholder="Search catalogue..." systemStatusLabel="Catalogue intelligence online">
      <main className="catalogue-page">
        <header className="catalogue-header">
          <div>
            <p className="vault-eyebrow">BUSINESS CONFIGURATION</p>
            <h1>Pack profiles</h1>
            <p>Reusable inventory and purchasing pack structures. They do not change commercial costs or historical evidence.</p>
          </div>
          <Link href="/catalogue">Back to Catalogue</Link>
        </header>

        <section className="catalogue-intelligence-section">
          <div className="catalogue-section-heading"><div><h2>Add pack profile</h2><p>Create a reusable category and its declared units per pack.</p></div></div>
          <form action={savePackProfile} className="product-editor-grid">
            <label><span>Name / category</span><input name="display_name" required placeholder="Coat" /></label>
            <label><span>Units per pack</span><input name="units_per_pack" min="1" required type="number" placeholder="5" /></label>
            <label className="product-editor-toggle"><span>Active</span><input name="active" type="checkbox" defaultChecked /></label>
            <button type="submit">Create pack profile</button>
          </form>
        </section>

        <section className="catalogue-intelligence-section">
          <div className="catalogue-section-heading"><div><h2>Existing profiles</h2><p>Inactive profiles remain visible for governance but cannot be newly selected by products.</p></div></div>
          <div className="catalogue-quality-grid">
            {(profiles ?? []).map((profile) => (
              <form action={savePackProfile} className="catalogue-attention-list" key={profile.id}>
                <input name="profile_id" type="hidden" value={profile.id} />
                <label><span>Name / category</span><input defaultValue={profile.display_name} name="display_name" required /></label>
                <label><span>Units per pack</span><input defaultValue={profile.units_per_pack ?? ""} min="1" name="units_per_pack" type="number" /></label>
                <label className="product-editor-toggle"><span>Active</span><input defaultChecked={profile.active} name="active" type="checkbox" /></label>
                <button type="submit">Save</button>
              </form>
            ))}
          </div>
        </section>
      </main>
    </VaultAppShell>
  );
}
