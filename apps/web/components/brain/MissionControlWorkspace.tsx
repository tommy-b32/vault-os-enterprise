"use client";

import Link from "next/link";

import MissionControlStyles from "@/components/brain/MissionControlStyles";
import LiveIntelligenceFeed from "@/components/brain/workspace/LiveIntelligenceFeed";
import MemoryInsights from "@/components/brain/workspace/MemoryInsights";
import MissionCard from "@/components/brain/workspace/MissionCard";
import MissionMetric from "@/components/brain/workspace/MissionMetric";
import MorningBriefing from "@/components/brain/workspace/MorningBriefing";
import VaultBrainStartup from "@/components/brain/workspace/VaultBrainStartup";
import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

import LiveIntelligenceFeedStyles from "@/styles/LiveIntelligenceFeedStyles";
import MemoryInsightsStyles from "@/styles/MemoryInsightsStyles";
import PredictionInsightsStyles from "@/styles/PredictionInsightsStyles";
import PredictionInsights from "@/components/brain/workspace/PredictionInsights";
import VaultBrainStartupStyles from "@/styles/VaultBrainStartupStyles";

import {
  createMissionSummary,
  getActionableMissions,
  getHighestPriorityMission,
} from "@/lib/missions/MissionEngine";

import type {
  VaultBrainOperationalSnapshot,
} from "@/lib/brain/types";

import type { Mission } from "@/types/missions";

type MissionControlWorkspaceProps = {
  missions: Mission[];
  snapshot: VaultBrainOperationalSnapshot;
  title?: string;
  description?: string;
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
  icon: VaultIconName;
  href: string;
  active?: boolean;
}>;

export default function MissionControlWorkspace({
  missions,
  snapshot,
  title = "Vault Brain",
  description = "Your retail operating system has analysed the latest business activity and ranked the highest-value actions.",
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
          <span className="vault-brand-mark">
            V
          </span>

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
              <VaultIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="vault-company">
          <div className="vault-company-mark">
            ✦
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

      <section className="vault-workspace">
        <header className="vault-topbar">
          <label className="vault-search">
            <VaultIcon
              name="search"
              size={19}
            />

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
              <VaultIcon name="bell" />

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

            <button
              className="vault-user"
              type="button"
            >
              <span className="vault-avatar">
                T
              </span>

              <span>Tom</span>

              <span className="vault-user-arrow">
                ⌄
              </span>
            </button>
          </div>
        </header>

        <VaultBrainStartup durationMs={900}>
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
                  <i />
                  Shopify connected
                </span>

                <span>
                  <i />
                  Inventory synced 2 min ago
                </span>

                <span>
                  <i />
                  Vault Brain online
                </span>

                <span>
                  <i />
                  0 sync errors
                </span>
              </section>

              <MorningBriefing snapshot={snapshot} />

              {highestPriorityMission ? (
                <section className="mission-featured-section">
                  <div className="vault-section-heading">
                    <div>
                      <span className="vault-eyebrow">
                        Highest-value mission
                      </span>
                    </div>

                    <span className="mission-ranking-note">
                      Ranked by impact, urgency and confidence
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

                  <h2>
                    No active missions
                  </h2>

                  <p>
                    Vault Brain has not detected any actions
                    requiring attention.
                  </p>
                </section>
              )}

              {remainingMissions.length > 0 ? (
                <section className="mission-queue-section">
                  <div className="vault-section-heading">
                    <div>
                      <span className="vault-eyebrow">
                        Today&apos;s priorities
                      </span>

                      <h2>
                        Next best actions
                      </h2>
                    </div>

                    <button
                      className="vault-text-button"
                      type="button"
                    >
                      View all

                      <VaultIcon
                        name="arrow"
                        size={16}
                      />
                    </button>
                  </div>

                  <div className="mission-queue-grid">
                    {remainingMissions.map(
                      (mission) => (
                        <MissionCard
                          key={mission.id}
                          mission={mission}
                        />
                      ),
                    )}
                  </div>
                </section>
              ) : null}

              <LiveIntelligenceFeed />

              <MemoryInsights />
              <PredictionInsights />
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
        </VaultBrainStartup>
      </section>

      <MissionControlStyles />
      <VaultBrainStartupStyles />
      <LiveIntelligenceFeedStyles />
      <MemoryInsightsStyles />
      <PredictionInsightsStyles />
    </main>
  );
}