"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export const RECOVERY_INTENT_KEY = "vault-os-password-recovery";

function urlHasRecoveryIntent() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery" || search.get("type") === "recovery";
}

export function RecoveryRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function openRecoveryScreen() {
      sessionStorage.setItem(RECOVERY_INTENT_KEY, "true");
      if (pathname !== "/auth/recovery") router.replace("/auth/recovery");
    }

    if (urlHasRecoveryIntent()) openRecoveryScreen();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") openRecoveryScreen();
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
