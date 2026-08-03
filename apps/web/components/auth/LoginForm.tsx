"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeDestination } from "@/lib/auth/redirects";
import { supabase } from "@/lib/supabase";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) {
        setErrorMessage("Unable to sign in with those credentials.");
        return;
      }
      router.replace(safeDestination(searchParams.get("next")));
      router.refresh();
    } catch {
      setErrorMessage("Sign-in is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="vault-login-form" onSubmit={submit}>
      <label>Email<input autoComplete="username" name="email" required type="email" /></label>
      <label>Password<input autoComplete="current-password" name="password" required type="password" /></label>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      <button disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
