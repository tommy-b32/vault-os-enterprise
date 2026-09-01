import { PasswordForm } from "@/components/auth/PasswordForm";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";

export default async function ChangePasswordPage() {
  const operator = await requireAuthenticatedOperator();

  return (
    <VaultAppShell userName={operator.displayName || operator.email}>
      <main className="vault-account-page">
        <section className="vault-login-card">
          <p className="vault-eyebrow">Operator Security</p>
          <h1>Change Password</h1>
          <p>Update the password for your signed-in operator account.</p>
          <PasswordForm
            pendingLabel="Changing password…"
            submitLabel="Change password"
            successMessage="Your password has been changed. You remain signed in."
          />
        </section>
      </main>
    </VaultAppShell>
  );
}
