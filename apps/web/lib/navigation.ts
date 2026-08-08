import type { VaultIconName } from "@/components/brain/workspace/VaultIcon";

export type VaultNavigationItem = {
  label: string;
  icon: VaultIconName;
  href: string;
};

export const VAULT_NAVIGATION = [
  { label: "Command Centre", icon: "home", href: "/" },
  { label: "Vault Brain", icon: "advisor", href: "/missions" },
  { label: "Inventory", icon: "inventory", href: "/inventory" },
  { label: "Catalogue", icon: "catalogue", href: "/catalogue" },
  { label: "Supplier Catalogue", icon: "catalogue", href: "/supplier-catalogue" },
  { label: "Match Review", icon: "missions", href: "/supplier-catalogue/review" },
  { label: "Orders", icon: "orders", href: "/orders" },
  { label: "Purchase Orders", icon: "orders", href: "/purchase-orders" },
  { label: "Purchase Intelligence", icon: "advisor", href: "/purchase-intelligence" },
  { label: "Commercial Intelligence", icon: "analytics", href: "/commercial" },
  { label: "Advisor", icon: "advisor", href: "/advisor" },
] as const satisfies readonly VaultNavigationItem[];

export function isVaultNavigationItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/supplier-catalogue") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
