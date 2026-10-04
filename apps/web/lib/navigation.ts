import type { VaultIconName } from "@/components/brain/workspace/VaultIcon";

export type VaultNavigationItem = {
  label: string;
  icon: VaultIconName;
  href: string;
  activePaths: readonly string[];
};

export const VAULT_NAVIGATION = [
  { label: "Command Centre", icon: "home", href: "/", activePaths: ["/"] },
  { label: "Orders", icon: "orders", href: "/orders", activePaths: ["/orders"] },
  { label: "Inventory", icon: "inventory", href: "/inventory", activePaths: ["/inventory"] },
  { label: "Catalogue", icon: "catalogue", href: "/catalogue", activePaths: ["/catalogue"] },
  { label: "Suppliers", icon: "catalogue", href: "/supplier-catalogue", activePaths: ["/supplier-catalogue"] },
  { label: "Purchasing", icon: "orders", href: "/purchase-intelligence", activePaths: ["/purchase-intelligence", "/purchase-orders"] },
  { label: "Finance", icon: "analytics", href: "/financial-intelligence", activePaths: ["/financial-intelligence", "/intelligence", "/commercial"] },
  { label: "Vault Brain", icon: "advisor", href: "/missions", activePaths: ["/missions", "/advisor"] },
] as const satisfies readonly VaultNavigationItem[];

export function isVaultNavigationItemActive(pathname: string, href: string): boolean {
  const item = VAULT_NAVIGATION.find((candidate) => candidate.href === href);
  if (!item) return false;

  return item.activePaths.some((path) =>
    path === "/"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`),
  );
}

export type VaultSubNavigationItem = {
  label: string;
  href: string;
};

const VAULT_SUB_NAVIGATION: Readonly<Record<string, readonly VaultSubNavigationItem[]>> = {
  "/catalogue": [
    { label: "Products", href: "/catalogue" },
    { label: "Import", href: "/catalogue/import" },
    { label: "Pack Profiles", href: "/catalogue/pack-profiles" },
  ],
  "/supplier-catalogue": [
    { label: "Catalogues", href: "/supplier-catalogue" },
  ],
  "/purchase-intelligence": [
    { label: "Recommendations", href: "/purchase-intelligence" },
    { label: "Purchase Orders", href: "/purchase-orders" },
  ],
  "/financial-intelligence": [
    { label: "Trading & Reconciliation", href: "/financial-intelligence" },
    { label: "Product Performance", href: "/intelligence" },
    { label: "Cash & Purchasing Capacity", href: "/commercial" },
  ],
  "/missions": [
    { label: "Missions & Decisions", href: "/missions" },
    { label: "Advisor", href: "/advisor" },
  ],
};

export function getVaultSubNavigation(pathname: string): readonly VaultSubNavigationItem[] {
  const activeItem = VAULT_NAVIGATION.find((item) =>
    isVaultNavigationItemActive(pathname, item.href),
  );

  return activeItem
    ? VAULT_SUB_NAVIGATION[activeItem.href] ?? []
    : [];
}

export function isVaultSubNavigationItemActive(pathname: string, href: string): boolean {
  const subNavigation = getVaultSubNavigation(pathname);
  const matchingItems = subNavigation.filter((item) =>
    item.href === "/"
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const mostSpecificMatch = matchingItems.reduce<VaultSubNavigationItem | undefined>(
    (current, item) => !current || item.href.length > current.href.length ? item : current,
    undefined,
  );

  return mostSpecificMatch?.href === href;
}
