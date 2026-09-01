"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PasswordForm } from "@/components/auth/PasswordForm";
import { RECOVERY_INTENT_KEY } from "@/components/auth/RecoveryRedirect";
import { supabase } from "@/lib/supabase";

type RecoveryState = "checking" | "ready" | "invalid";

function hasRecoveryIntent() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  return hash.get("type") === "recovery"
    || search.get("type") === "recovery"
    || sessionStorage.getItem(RECOVERY_INTENT_KEY) === "true";
}

export function RecoveryPasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<RecoveryState>("checking");

  useEffect(() => {
    let active = true;
    const recoveryIntent = hasRecoveryIntent();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        sessionStorage.setItem(RECOVERY_INTENT_KEY, "true");
        setState(session ? "ready" : "invalid");
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setState(recoveryIntent && !error && data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function finishRecovery() {
    sessionStorage.removeItem(RECOVERY_INTENT_KEY);
    router.replace("/");
    router.refresh();
  }

  if (state === "checking") {
    return <p role="status">Verifying your secure recovery link…</p>;
  }

  if (state === "invalid") {
    return <p role="alert">This recovery link is invalid or has expired. Request a new password recovery email and try again.</p>;
  }

  return (
    <PasswordForm
      onSuccess={finishRecovery}
      pendingLabel="Setting password…"
      submitLabel="Set new password"
      successMessage="Password updated. Returning to Vault OS…"
    />
  );
}
