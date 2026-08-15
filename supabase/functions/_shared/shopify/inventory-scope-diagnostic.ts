import { shopifyGraphQL } from "./graphql.ts";

export const REQUIRED_INVENTORY_SCOPES = [
  "write_inventory",
  "read_inventory",
  "read_locations",
] as const;

export type InventoryScopeDiagnostic = {
  success: true;
  requiredScopes: typeof REQUIRED_INVENTORY_SCOPES;
  grantedScopes: string[];
  missingScopes: string[];
  checkedAt: string;
};

export async function getInventoryScopeDiagnostic(): Promise<InventoryScopeDiagnostic> {
  const data = await shopifyGraphQL<{
    currentAppInstallation: {
      accessScopes: Array<{ handle: string }>;
    };
  }>(`query VaultInventoryScopeDiagnostic {
    currentAppInstallation {
      accessScopes { handle }
    }
  }`);

  const granted = new Set(
    data.currentAppInstallation.accessScopes.map(({ handle }) => handle),
  );

  return {
    success: true,
    requiredScopes: REQUIRED_INVENTORY_SCOPES,
    grantedScopes: REQUIRED_INVENTORY_SCOPES.filter((scope) => granted.has(scope)),
    missingScopes: REQUIRED_INVENTORY_SCOPES.filter((scope) => !granted.has(scope)),
    checkedAt: new Date().toISOString(),
  };
}
