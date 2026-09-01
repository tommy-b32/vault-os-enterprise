"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = { email: string; display_name: string | null; role: string };

export function OperatorMenu({ fallbackName = "Operator" }: { fallbackName?: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: operator } = await supabase.from("vault_operators")
        .select("email, display_name, role").eq("id", data.user.id).maybeSingle();
      if (active && operator) setProfile(operator);
    });
    return () => { active = false; };
  }, []);

  const name = profile?.display_name || profile?.email || fallbackName;
  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="vault-app-operator">
      <div className="vault-app-user" aria-label={`Signed in as ${name}`}>
        <span className="vault-app-avatar">{name.charAt(0).toUpperCase()}</span>
        <span className="vault-app-user-copy">
          <span className="vault-app-user-name">{name}</span>
          {profile?.role ? <span className="vault-app-user-role">{profile.role}</span> : null}
        </span>
      </div>
      <Link className="vault-app-sign-out" href="/change-password">
        Change password
      </Link>
      <button className="vault-app-sign-out" disabled={signingOut} onClick={signOut} type="button">
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
