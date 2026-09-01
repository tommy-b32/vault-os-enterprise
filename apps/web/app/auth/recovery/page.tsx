import { RecoveryPasswordForm } from "@/components/auth/RecoveryPasswordForm";

export default function PasswordRecoveryPage() {
  return (
    <main className="vault-login-page">
      <section className="vault-login-card">
        <div className="vault-login-mark" aria-hidden="true">V</div>
        <p className="vault-eyebrow">Secure Account Recovery</p>
        <h1>Set New Password</h1>
        <p>Choose a new password for your authorised operator account.</p>
        <RecoveryPasswordForm />
      </section>
    </main>
  );
}
