import type { ReactNode } from "react";

export type VaultIconName =
  | "home"
  | "missions"
  | "inventory"
  | "catalogue"
  | "partners"
  | "orders"
  | "analytics"
  | "advisor"
  | "settings"
  | "search"
  | "bell"
  | "arrow"
  | "target"
  | "shield"
  | "trend"
  | "brain";

type VaultIconProps = {
  name: VaultIconName;
  size?: number;
  strokeWidth?: number;
};

export default function VaultIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
}: VaultIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<VaultIconName, ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </>
    ),
    missions: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4V2" />
        <path d="M20 12h2" />
        <path d="M12 20v2" />
        <path d="M4 12H2" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M7 4h10l2 3H5z" />
        <path d="M9 11h6" />
      </>
    ),
    catalogue: (
      <>
        <path d="M8 4 4 7v13h16V7l-4-3" />
        <path d="M8 4c0 2 1.8 3 4 3s4-1 4-3" />
        <path d="M8 12h8" />
      </>
    ),
    partners: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M3 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
        <path d="M11 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
      </>
    ),
    orders: (
      <>
        <path d="M6 5h12l1 15H5z" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
        <path d="M9 12h6" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 20V10" />
        <path d="M9 20V5" />
        <path d="M14 20v-8" />
        <path d="M19 20V3" />
      </>
    ),
    advisor: (
      <>
        <path d="M9 3h6l1 3 3 1v5l-3 1-1 3H9l-1-3-3-1V7l3-1z" />
        <circle cx="12" cy="9.5" r="2.5" />
        <path d="M8.5 20c.7-3 2-4.5 3.5-4.5s2.8 1.5 3.5 4.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3h4.4l.4-3a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="m15 9 6-6" />
        <path d="M17 3h4v4" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </>
    ),
    trend: (
      <>
        <path d="m3 17 6-6 4 4 8-9" />
        <path d="M16 6h5v5" />
      </>
    ),
    brain: (
      <>
        <path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 5 3 3 0 0 0 2 5.5" />
        <path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 5 3 3 0 0 1-2 5.5" />
        <path d="M9.5 4.5v15" />
        <path d="M14.5 4.5v15" />
        <path d="M7 9h2.5" />
        <path d="M14.5 9H17" />
        <path d="M7.5 14h2" />
        <path d="M14.5 14h2" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}
