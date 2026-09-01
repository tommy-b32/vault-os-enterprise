"use client";

import { useState, type FormEvent } from "react";

import { supabase } from "@/lib/supabase";

type PasswordFormProps = {
  submitLabel: string;
  pendingLabel: string;
  successMessage: string;
  onSuccess?: () => void;
  disabled?: boolean;
};

export function PasswordForm({
  submitLabel,
  pendingLabel,
  successMessage,
  onSuccess,
  disabled = false,
}: PasswordFormProps) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setErrorMessage("");
    setStatusMessage("");

    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (newPassword.length < 8) {
      setErrorMessage("Your new password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("The passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMessage(error.message || "Unable to update your password.");
        return;
      }

      formElement.reset();
      setStatusMessage(successMessage);
      onSuccess?.();
    } catch {
      setErrorMessage("Password update is temporarily unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="vault-login-form" onSubmit={submit}>
      <label>
        New password
        <input
          autoComplete="new-password"
          disabled={disabled || pending}
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
      </label>
      <label>
        Confirm new password
        <input
          autoComplete="new-password"
          disabled={disabled || pending}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      {errorMessage ? <p role="alert">{errorMessage}</p> : null}
      {statusMessage ? <p className="vault-form-success" role="status">{statusMessage}</p> : null}
      <button disabled={disabled || pending} type="submit">
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
