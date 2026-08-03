import { LoginForm } from "@/components/auth/LoginForm";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <main className="vault-login-page">
      <section className="vault-login-card">
        <div className="vault-login-mark" aria-hidden="true">V</div>
        <p className="vault-eyebrow">Secure Operator Access</p>
        <h1>Vault OS</h1>
        <p>Sign in with your authorised operator account.</p>
        <Suspense fallback={<p>Preparing secure sign-in…</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
