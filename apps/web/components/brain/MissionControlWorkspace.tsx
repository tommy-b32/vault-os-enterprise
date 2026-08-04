"use client";

import Link from "next/link";

import ExecutiveMemory from "@/components/brain/workspace/ExecutiveMemory";
import MemoryInsights from "@/components/brain/workspace/MemoryInsights";
import MissionCard from "@/components/brain/workspace/MissionCard";
import MissionMetric from "@/components/brain/workspace/MissionMetric";
import MorningBriefing from "@/components/brain/workspace/MorningBriefing";
import PredictionInsights from "@/components/brain/workspace/PredictionInsights";
import TodaysAnalysis from "@/components/brain/workspace/TodaysAnalysis";
import VaultBrainStartup from "@/components/brain/workspace/VaultBrainStartup";
import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

import MissionControlStyles from "@/components/brain/MissionControlStyles";

import MemoryInsightsStyles from "@/styles/MemoryInsightsStyles";
import PredictionInsightsStyles from "@/styles/PredictionInsightsStyles";
import VaultBrainStartupStyles from "@/styles/VaultBrainStartupStyles";

import type {
  ExecutiveMemoryResult,
} from "@/lib/brain/ExecutiveMemoryEngine";

import type {
  VaultBrainOperationalSnapshot,
} from "@/lib/brain/types";

import {
  createMissionSummary,
  getHighestPriorityMission,
} from "@/lib/missions/MissionEngine";

import type {
  Mission,
} from "@/types/missions";

type MissionControlWorkspaceProps = {
  missions: Mission[];

  snapshot:
    VaultBrainOperationalSnapshot;

  executiveMemory:
    ExecutiveMemoryResult;

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
    label: "Vault Brain",
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
    label: "Supplier Catalogue",
    icon: "catalogue",
    href: "/supplier-catalogue",
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
  executiveMemory,
  title = "Vault Brain",
  description =
    "...",
}: MissionControlWorkspaceProps) {
  const highestPriorityMission =
    getHighestPriorityMission(
      missions,
    );

  const summary =
    createMissionSummary(
      missions,
    );

  return (
    <main className="vault-shell">
      <aside className="vault-sidebar">
        <div className="vault-brand">
          <span className="vault-brand-mark">
            V
          </span>

          <span>
            VAULT OS
          </span>
        </div>

        <nav
          aria-label="Primary navigation"
          className="vault-nav"
        >
          {navigation.map(
            (item) => (
              <Link
                className={`vault-nav-item ${
                  item.active
                    ? "is-active"
                    : ""
                }`}
                href={
                  item.href
                }
                key={
                  item.label
                }
              >
                <VaultIcon
                  name={
                    item.icon
                  }
                />

                <span>
                  {
                    item.label
                  }
                </span>
              </Link>
            ),
          )}
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

            <kbd>
              ⌘K
            </kbd>
          </label>

          <div className="vault-topbar-actions">
            <button
              aria-label="Notifications"
              className="vault-icon-button"
              type="button"
            >
              <VaultIcon
                name="bell"
              />

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

              <span>
                Tom
              </span>

              <span className="vault-user-arrow">
                ⌄
              </span>
            </button>
          </div>
        </header>

        <VaultBrainStartup
          durationMs={900}
        >
          <div className="vault-content mission-control-content">
            <section className="mission-control-workspace">
              <header className="mission-control-header">
                <div className="vault-page-heading">
                  <p className="vault-eyebrow">
                    VAULT BRAIN
                  </p>

                  <h1>
                    {title}
                  </h1>

                  <p>
                    {description}
                  </p>
                </div>

                <section className="mission-metrics mission-confidence-metric">
                  <MissionMetric
                    icon="brain"
                    label="Brain Confidence"
                    value={`${summary.averageConfidence}%`}
                  />
                </section>
              </header>

              <MorningBriefing
                snapshot={
                  snapshot
                }
              />

              <TodaysAnalysis analysis={executiveMemory} />

              <ExecutiveMemory
                memory={
                  executiveMemory
                }
              />

              {highestPriorityMission ? (
                <section className="mission-featured-section">
                  <div className="vault-section-heading">
                    <div>
                      <span className="vault-eyebrow">
                        Highest Value Mission
                      </span>
                    </div>

                    <span className="mission-ranking-note">
                      Ranked by impact, urgency and confidence
                    </span>
                  </div>

                  <MissionCard
                    featured
                    mission={
                      highestPriorityMission
                    }
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

              <PredictionInsights />

              <MemoryInsights />

              {/* TODO Sprint 12.2: Move Product Vision, Catalogue Intelligence,
                  Vision Index, Indexing Engine, Catalogue Readiness, Commercial
                  Readiness and Catalogue Health to Catalogue. */}
            </section>
          </div>

        </VaultBrainStartup>
      </section>

      <MissionControlStyles />
      <VaultBrainStartupStyles />
      <MemoryInsightsStyles />
      <PredictionInsightsStyles />
    </main>
  );
}
