import {
  DEMONSTRATION_OPERATIONAL_SNAPSHOT,
} from "@/lib/brain/demonstrationOperationalSnapshot";

import {
  createMissionSummary,
  getHighestPriorityMission,
} from "@/lib/missions/MissionEngine";

import type {
  LiveInventorySnapshot,
} from "@/lib/brain/getLiveInventorySnapshot";

import type {
  VaultBrainOperationalSnapshot,
  InventoryHealthState,
} from "@/lib/brain/types";

import type {
  Mission,
} from "@/types/missions";

type CreateOperationalSnapshotInput = {
  inventory: LiveInventorySnapshot;
  missions: Mission[];
  userName?: string;
};

function getInventoryHealthState(
  score: number,
): InventoryHealthState {
  if (score >= 90) {
    return "excellent";
  }

  if (score >= 75) {
    return "healthy";
  }

  if (score >= 50) {
    return "attention";
  }

  return "critical";
}

export function createOperationalSnapshot({
  inventory,
  missions,
  userName = "Tom",
}: CreateOperationalSnapshotInput): VaultBrainOperationalSnapshot {
  const missionSummary =
    createMissionSummary(missions);

  const highestPriorityMission =
    getHighestPriorityMission(missions);

  const generatedAt =
    new Date().toISOString();

  return {
    /*
     * Trading and cash remain on controlled demonstration
     * values until their live data sources are connected.
     */
    ...DEMONSTRATION_OPERATIONAL_SNAPSHOT,

    generatedAt,
    userName,

    inventory: {
      state:
        getInventoryHealthState(
          inventory.healthScore,
        ),

      score:
        inventory.healthScore,

      totalProducts:
        inventory.monitoredProducts,

      healthyProducts:
        inventory.healthyProducts,

      lowStockProducts:
        inventory.lowStockProducts,

      outOfStockProducts:
        inventory.outOfStockProducts +
        inventory.negativeStockProducts,

      /*
       * A genuine stock valuation requires trusted landed
       * cost data across the monitored product set.
       */
      estimatedStockValueGbp: null,
    },

    /*
     * Do not retain demonstration product-level stock risks.
     * These will be populated later from real Shopify sales
     * velocity, live stock and supplier lead-time data.
     */
    stockImpacts: [],

    missions: {
      actionable:
        missionSummary.actionable,

      critical:
        missionSummary.critical,

      high:
        missionSummary.high,

      highestPriorityMissionId:
        highestPriorityMission?.id ??
        null,

      highestPriorityMissionTitle:
        highestPriorityMission?.title ??
        null,

      averageConfidence:
        missionSummary.averageConfidence,
    },

    sourceStatuses: [
      {
        source: "shopify",
        label: "Shopify trading",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_OPERATIONAL_SNAPSHOT
            .generatedAt,
        message:
          "Controlled trading data active until the live Shopify trading adapter is connected.",
      },

      {
        source: "inventory",
        label: "Inventory",
        status: "healthy",
        lastUpdatedAt:
          inventory.latestSyncAt ??
          inventory.generatedAt,
        message:
          `${inventory.monitoredProducts} stocked products monitored; ${inventory.excludedProducts} excluded by Catalogue rules.`,
      },

      {
        source: "catalogue",
        label: "Catalogue",
        status: "healthy",
        lastUpdatedAt:
          inventory.generatedAt,
        message:
          "Catalogue fulfilment and replenishment rules applied.",
      },

      {
        source: "missions",
        label: "Mission Engine",
        status: "healthy",
        lastUpdatedAt:
          generatedAt,
        message:
          `${missionSummary.actionable} actionable missions ranked.`,
      },

      {
        source: "commercial",
        label: "Commercial",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_OPERATIONAL_SNAPSHOT
            .generatedAt,
        message:
          "Controlled commercial trading values remain active temporarily.",
      },

      {
        source: "capital",
        label: "Capital",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_OPERATIONAL_SNAPSHOT
            .generatedAt,
        message:
          "Controlled cash-position values remain active temporarily.",
      },

      {
        source: "supplier",
        label: "Suppliers",
        status: "healthy",
        lastUpdatedAt:
          inventory.generatedAt,
      },
    ],
  };
}