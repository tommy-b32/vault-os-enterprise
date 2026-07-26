"use client";

import Link from "next/link";

import {
  createMissionSummary,
  getActionableMissions,
  getHighestPriorityMission,
} from "@/lib/missions/MissionEngine";

import type { Mission } from "@/types/missions";

import MissionPriorityBadge from "@/components/brain/workspace/MissionPriorityBadge";

type MissionControlWorkspaceProps = {
  missions: Mission[];
  title?: string;
  description?: string;
};

type IconName =
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

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
}: IconProps) {
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

  const paths: Record<IconName, React.ReactNode> = {
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
    active: true,
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
  icon: IconName;
  href: string;
  active?: boolean;
}>;

function formatMissionSource(source: string): string {
  return source
    .split("-")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function MissionAction({
  mission,
}: {
  mission: Mission;
}) {
  const primaryAction = mission.actions.find(
    (action) => action.kind === "primary",
  );

  if (!primaryAction?.href) {
    return null;
  }

  return (
    <Link
      className="vault-primary-button mission-action-button"
      href={primaryAction.href}
    >
      {primaryAction.label}
      <Icon name="arrow" size={16} />
    </Link>
  );
}

function MissionCard({
  mission,
  featured = false,
}: {
  mission: Mission;
  featured?: boolean;
}) {
  const secondaryActions = mission.actions.filter(
    (action) =>
      action.kind === "secondary" && action.href,
  );

  return (
    <article
      className={[
        "vault-panel",
        "mission-card",
        featured ? "mission-card-featured" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="mission-card-topline">
        <div className="mission-card-identity">
          <MissionPriorityBadge mission={mission} />

          <span className="mission-source">
            {formatMissionSource(mission.source)}
          </span>
        </div>

        <span className="mission-confidence">
          <strong>{mission.score.confidence}%</strong>
          {" confidence"}
        </span>
      </div>

      <div className="mission-copy">
        <h3>{mission.title}</h3>
        <p>{mission.summary}</p>
      </div>

      <div className="mission-outcome">
        <span className="mission-outcome-icon">
          <Icon name="target" size={20} />
        </span>

        <div>
          <span className="vault-card-kicker">
            Expected outcome
          </span>

          <p>{mission.outcome}</p>
        </div>
      </div>

      {mission.evidence.length > 0 ? (
        <div className="mission-evidence-grid">
          {mission.evidence.map((item) => (
            <div
              className="mission-evidence"
              key={`${mission.id}-${item.label}`}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mission-card-actions">
        <MissionAction mission={mission} />

        {secondaryActions.map((action) => (
          <Link
            className="vault-secondary-button mission-secondary-action"
            href={action.href as string}
            key={action.id}
          >
            {action.label}
          </Link>
        ))}
      </div>
    </article>
  );
}

function MissionMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: IconName;
}) {
  return (
    <article className="vault-card mission-metric-card">
      <div className="mission-metric-label">
        <span className="vault-card-icon">
          <Icon name={icon} />
        </span>

        <span>{label}</span>
      </div>

      <strong>{value}</strong>
    </article>
  );
}

export default function MissionControlWorkspace({
  missions,
  title = "Mission Control",
  description = "Vault Brain has analysed the business and ranked the highest-value actions.",
}: MissionControlWorkspaceProps) {
  const actionableMissions =
    getActionableMissions(missions);

  const highestPriorityMission =
    getHighestPriorityMission(missions);

  const remainingMissions = highestPriorityMission
    ? actionableMissions.filter(
        (mission) =>
          mission.id !== highestPriorityMission.id,
      )
    : actionableMissions;

  const summary = createMissionSummary(missions);

  return (
    <main className="vault-shell">
      <aside className="vault-sidebar">
        <div className="vault-brand">
          <span className="vault-brand-mark">V</span>
          <span>VAULT OS</span>
        </div>

        <nav
          aria-label="Primary navigation"
          className="vault-nav"
        >
          {navigation.map((item) => (
            <Link
              className={`vault-nav-item ${
                item.active ? "is-active" : ""
              }`}
              href={item.href}
              key={item.label}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="vault-company">
          <div className="vault-company-mark">✦</div>

          <div>
            <strong>The Fabric Vault</strong>
            <span>Where Luxury Meets Affordability</span>
          </div>
        </div>
      </aside>

      <section className="vault-workspace">
        <header className="vault-topbar">
          <label className="vault-search">
            <Icon name="search" size={19} />

            <input
              aria-label="Search Vault OS"
              placeholder="Search anything..."
              type="search"
            />

            <kbd>⌘K</kbd>
          </label>

          <div className="vault-topbar-actions">
            <button
              aria-label="Notifications"
              className="vault-icon-button"
              type="button"
            >
              <Icon name="bell" />
              <span className="vault-notification-count">
                3
              </span>
            </button>

            <div
              className="vault-heartbeat"
              title="Vault systems healthy"
            >
              <span />
            </div>

            <button className="vault-user" type="button">
              <span className="vault-avatar">T</span>
              <span>Tom</span>
              <span className="vault-user-arrow">⌄</span>
            </button>
          </div>
        </header>

        <div className="vault-content mission-control-content">
          <section className="mission-control-workspace">
            <header className="mission-control-header">
              <div className="vault-page-heading">
                <p className="vault-eyebrow">
                  Vault Brain
                </p>

                <h1>{title}</h1>

                <p>{description}</p>
              </div>

              <section className="mission-metrics">
  <MissionMetric
    icon="target"
    label="Active Missions"
    value={summary.actionable}
  />

  <MissionMetric
    icon="shield"
    label="Urgent Attention"
    value={summary.critical}
  />

  <MissionMetric
    icon="trend"
    label="High-Value Actions"
    value={summary.high}
  />

  <MissionMetric
    icon="brain"
    label="Brain Confidence"
    value={`${summary.averageConfidence}%`}
  />
</section>
            </header>

            <section className="vault-status-strip">
              <span>
                <i /> Shopify connected
              </span>

              <span>
                <i /> Inventory synced 2 min ago
              </span>

              <span>
                <i /> Vault Brain online
              </span>

              <span>
                <i /> 0 sync errors
              </span>
            </section>

            {highestPriorityMission ? (
              <section className="mission-featured-section">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">
                      Highest-value mission
                    </span>
                  </div>

                  <span className="mission-ranking-note">
                    Ranked by impact, urgency and
                    confidence
                  </span>
                </div>

                <MissionCard
                  featured
                  mission={highestPriorityMission}
                />
              </section>
            ) : (
              <section className="vault-panel mission-empty-state">
                <span className="vault-eyebrow">
                  Vault Brain
                </span>

                <h2>No active missions</h2>

                <p>
                  Vault Brain has not detected any
                  actions requiring attention.
                </p>
              </section>
            )}

            {remainingMissions.length > 0 ? (
              <section className="mission-queue-section">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">
                      Mission queue
                    </span>

                    <h2>Next best actions</h2>
                  </div>

                  <button
                    className="vault-text-button"
                    type="button"
                  >
                    View all
                    <Icon name="arrow" size={16} />
                  </button>
                </div>

                <div className="mission-queue-grid">
                  {remainingMissions.map((mission) => (
                    <MissionCard
                      key={mission.id}
                      mission={mission}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        </div>

        <footer className="vault-quick-actions">
          <span className="vault-eyebrow">
            Quick Actions
          </span>

          <div>
            <button type="button">
              ＋ Add product
            </button>

            <button type="button">
              ▣ Create order
            </button>

            <button type="button">
              ◉ Message partner
            </button>

            <button type="button">
              ▤ Generate report
            </button>

            <button type="button">
              ⌁ View analytics
            </button>
          </div>
        </footer>
      </section>

      <style>{`
        .mission-control-content {
          display: block;
        }

        .mission-control-workspace {
          width: 100%;
          min-width: 0;
        }

        .mission-control-header {
          display: grid;
          grid-template-columns:
            minmax(280px, 1fr)
            minmax(560px, 1.2fr);
          align-items: end;
          gap: 32px;
        }

        .mission-control-header
          .vault-page-heading
          > p:last-child {
          max-width: 620px;
          color: var(--vault-muted, #95989c);
          line-height: 1.65;
        }

        .mission-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .mission-metric-card {
          min-height: 112px;
          padding: 18px;
        }

        .mission-metric-label {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #b6b6b6;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .mission-metric-card > strong {
          display: block;
          margin-top: 12px;
          color: #f7f7f7;
          font-size: 27px;
          line-height: 1;
        }

        .mission-featured-section,
        .mission-queue-section {
          margin-top: 22px;
        }

        .mission-ranking-note {
          color: #6f7378;
          font-size: 12px;
        }

        .mission-card {
          padding: 20px;
          overflow: hidden;
        }

        .mission-card-featured {
          padding: 24px;
          border-color: rgba(212, 168, 70, 0.55);
          background:
            radial-gradient(
              circle at 72% 18%,
              rgba(212, 168, 70, 0.08),
              transparent 32%
            ),
            linear-gradient(
              135deg,
              rgba(212, 168, 70, 0.055),
              rgba(255, 255, 255, 0.012) 45%
            ),
            #101210;
          box-shadow:
            inset 0 0 0 1px rgba(212, 168, 70, 0.04),
            0 18px 55px rgba(0, 0, 0, 0.24);
        }

        .mission-card-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .mission-card-identity {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .mission-priority {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 25px;
          padding: 4px 11px;
          border: 1px solid;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .mission-priority i {
          opacity: 0.55;
          font-style: normal;
        }

        .mission-priority-critical {
          color: #ffaaa5;
          border-color: rgba(230, 73, 64, 0.56);
          background: rgba(129, 31, 26, 0.3);
        }

        .mission-priority-high {
          color: #f1cb4e;
          border-color: rgba(212, 168, 70, 0.55);
          background: rgba(104, 77, 4, 0.26);
        }

        .mission-priority-medium {
          color: #91d8f3;
          border-color: rgba(44, 151, 193, 0.55);
          background: rgba(15, 76, 101, 0.32);
        }

        .mission-priority-low {
          color: #a4a7aa;
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.035);
        }

        .mission-source {
          overflow: hidden;
          color: #74777a;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-overflow: ellipsis;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .mission-confidence {
          color: #888b8e;
          font-size: 11px;
          white-space: nowrap;
        }

        .mission-confidence strong {
          color: #d4a846;
          font-weight: 700;
        }

        .mission-copy {
          margin-top: 18px;
        }

        .mission-copy h3 {
          margin: 0;
          color: #f7f7f7;
          font-size: 19px;
          line-height: 1.25;
        }

        .mission-card-featured .mission-copy h3 {
          font-size: clamp(24px, 2vw, 30px);
        }

        .mission-copy p {
          margin: 10px 0 0;
          color: #96999c;
          font-size: 13px;
          line-height: 1.6;
        }

        .mission-outcome {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-top: 18px;
          padding: 13px 15px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 10px;
          background: rgba(0, 0, 0, 0.22);
        }

        .mission-outcome-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 1px solid rgba(212, 168, 70, 0.28);
          border-radius: 50%;
          color: #e0b53f;
          background: rgba(212, 168, 70, 0.08);
        }

        .mission-outcome p {
          margin: 4px 0 0;
          color: #d6d6d6;
          font-size: 12px;
          line-height: 1.45;
        }

        .mission-evidence-grid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 10px;
          margin-top: 12px;
        }

        .mission-evidence {
          min-width: 0;
          padding: 12px 14px;
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 9px;
          background: rgba(255, 255, 255, 0.022);
        }

        .mission-evidence span {
          display: block;
          overflow: hidden;
          color: #777b7e;
          font-size: 10px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .mission-evidence strong {
          display: block;
          margin-top: 6px;
          color: #f0f0f0;
          font-size: 13px;
          line-height: 1.3;
        }

        .mission-card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }

        .mission-action-button,
        .mission-secondary-action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          text-decoration: none;
        }

        .mission-queue-grid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 14px;
        }

        .mission-queue-grid .mission-card {
          display: flex;
          min-width: 0;
          flex-direction: column;
        }

        .mission-queue-grid
          .mission-card-actions {
          margin-top: auto;
          padding-top: 14px;
        }

        .mission-empty-state {
          margin-top: 24px;
          padding: 42px;
          text-align: center;
        }

        .mission-empty-state h2 {
          margin: 10px 0 0;
        }

        .mission-empty-state p {
          color: #898c8f;
        }

        @media (max-width: 1280px) {
          .mission-control-header {
            grid-template-columns: 1fr;
          }

          .mission-metrics {
            max-width: none;
          }

          .mission-queue-grid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }
        }

        @media (max-width: 900px) {
          .mission-metrics {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }

          .mission-queue-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .mission-control-header {
            gap: 20px;
          }

          .mission-card-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .mission-evidence-grid {
            grid-template-columns: 1fr;
          }

          .mission-card-featured {
            padding: 18px;
          }

          .mission-ranking-note {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}