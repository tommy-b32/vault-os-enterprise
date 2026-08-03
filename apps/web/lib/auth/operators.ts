import "server-only";

import { createSessionSupabaseClient } from "@/lib/supabase-server";
import type { VaultOperatorRole } from "@/lib/auth/rules";

export type { VaultOperatorRole } from "@/lib/auth/rules";
export type VaultOperator = {
  id: string;
  email: string;
  displayName: string | null;
  role: VaultOperatorRole;
  isActive: boolean;
};

export class OperatorAuthorizationError extends Error {
  constructor(public readonly reason: "unauthenticated" | "missing" | "inactive" | "forbidden") {
    super("Operator authorization failed");
    this.name = "OperatorAuthorizationError";
  }
}

export async function getCurrentOperator(): Promise<VaultOperator | null> {
  const supabase = await createSessionSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data, error: profileError } = await supabase
    .from("vault_operators")
    .select("id, email, display_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Vault authorization unavailable while loading operator profile", {
      userId: user.id,
    });
    throw new Error("Operator authorization is unavailable");
  }

  if (!data) {
    console.warn("Vault authorization denied: operator profile missing", { userId: user.id });
    throw new OperatorAuthorizationError("missing");
  }

  if (!data.is_active) {
    console.warn("Vault authorization denied: inactive operator", { userId: user.id });
    throw new OperatorAuthorizationError("inactive");
  }

  return {
    id: data.id,
    email: data.email,
    displayName: data.display_name,
    role: data.role as VaultOperatorRole,
    isActive: data.is_active,
  };
}

export async function requireAuthenticatedOperator(): Promise<VaultOperator> {
  const operator = await getCurrentOperator();
  if (!operator) throw new OperatorAuthorizationError("unauthenticated");
  return operator;
}

export async function requireOperatorRole(
  ...roles: VaultOperatorRole[]
): Promise<VaultOperator> {
  const operator = await requireAuthenticatedOperator();
  if (!roles.includes(operator.role)) {
    console.warn("Vault authorization denied: insufficient role", {
      userId: operator.id,
      role: operator.role,
    });
    throw new OperatorAuthorizationError("forbidden");
  }
  return operator;
}
