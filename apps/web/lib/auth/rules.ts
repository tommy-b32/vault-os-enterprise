export type VaultOperatorRole = "owner" | "operator" | "viewer";

export function hasVaultAccess(profile: { is_active: boolean } | null): boolean {
  return profile?.is_active === true;
}

export function canCreateCashTransactions(role: VaultOperatorRole): boolean {
  return role === "owner" || role === "operator";
}
