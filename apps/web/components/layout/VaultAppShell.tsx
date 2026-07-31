"use client";

import Link from "next/link";
import {
  usePathname,
} from "next/navigation";

import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

type VaultAppShellProps = {
  children: React.ReactNode;

  searchPlaceholder?: string;
  notificationCount?: number;

  systemStatusLabel?: string;
  userName?: string;
};

const navigation = [
  {
    label: "Command Centre",
    icon: "home",
    href: "/",
  },
  {
    label: "Missions",
    icon: "missions",
    href: "/missions",
  },
  {
    label: "Inventory",
    icon: "inventory",
    href: "/inventory",
  },
  {
    label: "Catalogue",
    icon: "catalogue",
    href: "/catalogue",
  },
  {
    label: "Supplier Catalogue",
    icon: "catalogue",
    href: "/supplier-catalogue",
  },
  {
    label: "Match Review",
    icon: "missions",
    href: "/supplier-catalogue/review",
  },
  {
    label: "Partners",
    icon: "partners",
    href: "/partners",
  },
  {
    label: "Orders",
    icon: "orders",
    href: "/orders",
  },
  {
    label: "Analytics",
    icon: "analytics",
    href: "/analytics",
  },
  {
    label: "Advisor",
    icon: "advisor",
    href: "/advisor",
  },
  {
    label: "Settings",
    icon: "settings",
    href: "/settings",
  },
] satisfies Array<{
  label: string;
  icon: VaultIconName;
  href: string;
}>;

function isNavigationItemActive({
  pathname,
  href,
}: {
  pathname: string;
  href: string;
}): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  /*
   * Supplier Catalogue is a parent route with a dedicated
   * Match Review child route. Keep only the exact parent tab
   * active on /supplier-catalogue so the review page can
   * highlight its own navigation item.
   */
  if (href === "/supplier-catalogue") {
    return pathname === "/supplier-catalogue";
  }

  return (
    pathname === href ||
    pathname.startsWith(`${href}/`)
  );
}

function VaultAppShellStyles() {
  return (
    <style>{`
      .vault-app-shell {
        display: grid;
        grid-template-columns:
          220px
          minmax(0, 1fr);
        min-height: 100vh;
        color: #f4f1e9;
        background:
          linear-gradient(
            rgba(255, 255, 255, 0.012) 1px,
            transparent 1px
          ),
          linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.012) 1px,
            transparent 1px
          ),
          #070807;
        background-size: 68px 68px;
      }

      .vault-app-sidebar {
        position: sticky;
        top: 0;
        display: flex;
        height: 100vh;
        flex-direction: column;
        border-right: 1px solid rgba(255, 255, 255, 0.08);
        background:
          linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.018),
            transparent 38%
          ),
          #0c0e0d;
      }

      .vault-app-brand {
        display: flex;
        align-items: center;
        gap: 13px;
        min-height: 72px;
        padding: 0 25px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
        color: #e1b64b;
        font-size: 16px;
        font-weight: 800;
        letter-spacing: 0.03em;
      }

      .vault-app-brand-mark {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        color: #e4b94a;
        font-family: Georgia, serif;
        font-size: 25px;
      }

      .vault-app-nav {
        display: grid;
        gap: 6px;
        padding: 26px 12px;
      }

      .vault-app-nav-item {
        display: flex;
        align-items: center;
        gap: 13px;
        min-height: 49px;
        padding: 0 14px;
        border: 1px solid transparent;
        border-radius: 9px;
        color: #c9ccca;
        font-size: 12px;
        text-decoration: none;
        transition:
          border-color 150ms ease,
          color 150ms ease,
          background 150ms ease,
          transform 150ms ease;
      }

      .vault-app-nav-item svg {
        flex: 0 0 auto;
        color: #d9ad43;
      }

      .vault-app-nav-item:hover {
        color: #f5f5f2;
        background: rgba(255, 255, 255, 0.025);
        transform: translateX(1px);
      }

      .vault-app-nav-item.is-active {
        border-color: rgba(212, 168, 70, 0.42);
        color: #f3f2ed;
        background:
          linear-gradient(
            90deg,
            rgba(212, 168, 70, 0.13),
            rgba(212, 168, 70, 0.035)
          );
        box-shadow:
          inset 2px 0 0 #d8ad43,
          0 0 22px rgba(212, 168, 70, 0.04);
      }

      .vault-app-company {
        display: flex;
        align-items: center;
        gap: 11px;
        margin-top: auto;
        padding: 18px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
      }

      .vault-app-company-mark {
        display: grid;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 50%;
        color: #d8ad43;
        background: #090a09;
      }

      .vault-app-company > div:last-child {
        min-width: 0;
      }

      .vault-app-company strong {
        display: block;
        overflow: hidden;
        color: #f0f1ee;
        font-size: 10px;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .vault-app-company span {
        display: block;
        margin-top: 4px;
        overflow: hidden;
        color: #c99f38;
        font-size: 7px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .vault-app-workspace {
        min-width: 0;
      }

      .vault-app-topbar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-height: 72px;
        padding: 0 27px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(7, 8, 7, 0.94);
        backdrop-filter: blur(16px);
      }

      .vault-app-search {
        display: flex;
        align-items: center;
        gap: 10px;
        width: min(100%, 440px);
        height: 40px;
        padding: 0 11px;
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 9px;
        color: #777b7e;
        background: #080a09;
      }

      .vault-app-search input {
        min-width: 0;
        flex: 1;
        border: 0;
        outline: 0;
        color: #eceeeb;
        background: transparent;
        font: inherit;
        font-size: 12px;
      }

      .vault-app-search input::placeholder {
        color: #696d70;
      }

      .vault-app-search kbd {
        flex: 0 0 auto;
        padding: 4px 7px;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 5px;
        color: #6f7376;
        background: rgba(255, 255, 255, 0.035);
        font-size: 9px;
      }

      .vault-app-topbar-actions {
        display: flex;
        align-items: center;
        gap: 15px;
      }

      .vault-app-icon-button {
        position: relative;
        display: grid;
        width: 36px;
        height: 36px;
        place-items: center;
        border: 0;
        color: #d9ad43;
        background: transparent;
        cursor: pointer;
      }

      .vault-app-notification-count {
        position: absolute;
        top: 0;
        right: -1px;
        display: grid;
        min-width: 17px;
        height: 17px;
        padding: 0 4px;
        place-items: center;
        border: 2px solid #070807;
        border-radius: 999px;
        color: #090a09;
        background: #e5b94a;
        font-size: 8px;
        font-weight: 800;
      }

      .vault-app-system-status {
        display: grid;
        width: 28px;
        height: 28px;
        place-items: center;
        border-radius: 50%;
        background: rgba(48, 139, 80, 0.09);
      }

      .vault-app-system-status span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #61d08a;
        box-shadow:
          0 0 0 4px rgba(97, 208, 138, 0.08),
          0 0 18px rgba(97, 208, 138, 0.4);
      }

      .vault-app-user {
        display: flex;
        align-items: center;
        gap: 9px;
        border: 0;
        color: #f0f1ee;
        background: transparent;
        cursor: pointer;
      }

      .vault-app-avatar {
        display: grid;
        width: 35px;
        height: 35px;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 50%;
        color: #d9ad43;
        background: #111311;
        font-size: 11px;
        font-weight: 700;
      }

      .vault-app-user-name {
        font-size: 12px;
      }

      .vault-app-user-arrow {
        color: #65696c;
        font-size: 11px;
      }

      .vault-app-content {
        min-width: 0;
      }

      @media (max-width: 940px) {
        .vault-app-shell {
          grid-template-columns: 82px minmax(0, 1fr);
        }

        .vault-app-brand {
          justify-content: center;
          padding: 0;
        }

        .vault-app-brand > span:last-child,
        .vault-app-nav-item > span,
        .vault-app-company > div:last-child {
          display: none;
        }

        .vault-app-nav-item {
          justify-content: center;
          padding: 0;
        }

        .vault-app-company {
          justify-content: center;
        }
      }

      @media (max-width: 680px) {
        .vault-app-shell {
          display: block;
        }

        .vault-app-sidebar {
          position: static;
          height: auto;
          border-right: 0;
        }

        .vault-app-brand,
        .vault-app-company {
          display: none;
        }

        .vault-app-nav {
          display: flex;
          overflow-x: auto;
          padding: 9px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .vault-app-nav-item {
          min-width: 44px;
          height: 42px;
          flex: 0 0 auto;
        }

        .vault-app-topbar {
          min-height: 62px;
          padding: 0 14px;
        }

        .vault-app-search {
          width: min(100%, 360px);
        }

        .vault-app-user-name,
        .vault-app-user-arrow {
          display: none;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .vault-app-nav-item {
          transition: none;
        }
      }
    `}</style>
  );
}

export default function VaultAppShell({
  children,
  searchPlaceholder = "Search anything...",
  notificationCount = 0,
  systemStatusLabel = "Vault systems healthy",
  userName = "Tom",
}: VaultAppShellProps) {
  const pathname = usePathname();

  return (
    <main className="vault-app-shell">
      <aside className="vault-app-sidebar">
        <div className="vault-app-brand">
          <span className="vault-app-brand-mark">
            V
          </span>

          <span>VAULT OS</span>
        </div>

        <nav
          aria-label="Primary navigation"
          className="vault-app-nav"
        >
          {navigation.map((item) => {
            const isActive =
              isNavigationItemActive({
                pathname,
                href: item.href,
              });

            return (
              <Link
                className={[
                  "vault-app-nav-item",
                  isActive
                    ? "is-active"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                href={item.href}
                key={item.href}
              >
                <VaultIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="vault-app-company">
          <div className="vault-app-company-mark">
            N
          </div>

          <div>
            <strong>
              The Fabric Vault
            </strong>

            <span>
              Where Luxury Meets Affordability
            </span>
          </div>
        </div>
      </aside>

      <section className="vault-app-workspace">
        <header className="vault-app-topbar">
          <label className="vault-app-search">
            <VaultIcon
              name="search"
              size={18}
            />

            <input
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              type="search"
            />

            <kbd>⌘K</kbd>
          </label>

          <div className="vault-app-topbar-actions">
            <button
              aria-label="Notifications"
              className="vault-app-icon-button"
              type="button"
            >
              <VaultIcon name="bell" />

              {notificationCount > 0 ? (
                <span className="vault-app-notification-count">
                  {notificationCount}
                </span>
              ) : null}
            </button>

            <div
              aria-label={systemStatusLabel}
              className="vault-app-system-status"
              title={systemStatusLabel}
            >
              <span />
            </div>

            <button
              className="vault-app-user"
              type="button"
            >
              <span className="vault-app-avatar">
                {userName
                  .trim()
                  .charAt(0)
                  .toUpperCase() || "T"}
              </span>

              <span className="vault-app-user-name">
                {userName}
              </span>

              <span className="vault-app-user-arrow">
                ⌄
              </span>
            </button>
          </div>
        </header>

        <div className="vault-app-content">
          {children}
        </div>
      </section>

      <VaultAppShellStyles />
    </main>
  );
}