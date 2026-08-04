import MissionControlWorkspace from "@/components/brain/MissionControlWorkspace";

import {
  createExecutiveMemory,
} from "@/lib/brain/ExecutiveMemoryEngine";

import {
  createOperationalSnapshot,
} from "@/lib/brain/createOperationalSnapshot";

import {
  getLiveInventorySnapshot,
} from "@/lib/brain/getLiveInventorySnapshot";

import {
  getPreviousOperationalSnapshot,
  saveOperationalSnapshot,
} from "@/lib/brain/OperationalMemoryRepository";

import {
  createMissions,
} from "@/lib/missions/MissionEngine";

import type {
  MissionDraft,
} from "@/types/missions";

export const dynamic = "force-dynamic";

function createInventoryMission({
  productsRequiringAttention,
  lowStockProducts,
  outOfStockProducts,
  negativeStockProducts,
  healthScore,
}: Awaited<
  ReturnType<
    typeof getLiveInventorySnapshot
  >
>): MissionDraft | null {
  if (productsRequiringAttention === 0) {
    return null;
  }

  const severeProducts =
    outOfStockProducts +
    negativeStockProducts;

  return {
    id: "live-inventory-attention",
    type: "restock",
    source: "inventory",

    title:
      severeProducts > 0
        ? "Resolve live inventory exposure"
        : "Review developing inventory risks",

    summary:
      `${productsRequiringAttention} actively monitored ${
        productsRequiringAttention === 1
          ? "product requires"
          : "products require"
      } attention. ` +
      `${lowStockProducts} are low stock, ` +
      `${outOfStockProducts} are out of stock and ` +
      `${negativeStockProducts} have negative available stock.`,

    outcome:
      "Reviewing the affected stocked products will protect availability while respecting dropship, service, do-not-restock and discontinued catalogue rules.",

    status: "new",

    score: {
      impact:
        severeProducts > 0
          ? 88
          : 74,

      urgency:
        severeProducts > 0
          ? 92
          : 76,

      confidence: 98,
    },

    actions: [
      {
        id: "open-live-inventory",
        label: "Review inventory",
        href: "/inventory",
        kind: "primary",
      },
    ],

    evidence: [
      {
        label: "Products affected",
        value: String(
          productsRequiringAttention,
        ),
      },
      {
        label: "Inventory health",
        value: `${healthScore}%`,
      },
      {
        label: "Low stock",
        value: String(
          lowStockProducts,
        ),
      },
      {
        label: "Unavailable",
        value: String(
          outOfStockProducts +
            negativeStockProducts,
        ),
      },
    ],

    metadata: {
      affectedProducts:
        productsRequiringAttention,

      healthScore,

      lowStockProducts,
      outOfStockProducts,
      negativeStockProducts,
    },
  };
}

const DEMONSTRATION_MISSIONS: MissionDraft[] = [
  {
    id: "supplier-review-queue",
    type: "supplier-review",
    source: "supplier",

    title:
      "Complete the supplier review queue",

    summary:
      "Several detected supplier products are waiting for approval before they can move into the buying workflow.",

    outcome:
      "Reviewed products can progress into the buying basket with cleaner catalogue and supplier data.",

    status: "new",

    score: {
      impact: 86,
      urgency: 92,
      confidence: 96,
    },

    actions: [
      {
        id: "open-review-queue",
        label: "Open review queue",
        href: "/supplier-catalogue/review",
        kind: "primary",
      },
      {
        id: "view-supplier-catalogue",
        label: "View supplier catalogue",
        href: "/supplier-catalogue",
        kind: "secondary",
      },
    ],

    evidence: [
      {
        label:
          "Products awaiting review",
        value: "18",
      },
      {
        label:
          "Estimated review time",
        value: "12 minutes",
      },
      {
        label:
          "Detection confidence",
        value: "96%",
      },
    ],

    metadata: {
      queueSize: 18,
      estimatedMinutes: 12,
    },
  },

  {
    id: "commercial-data-gaps",
    type: "data-quality",
    source: "commercial",

    title:
      "Resolve missing commercial data",

    summary:
      "A group of active products does not yet have complete cost information, preventing accurate margin analysis.",

    outcome:
      "Completing cost data will unlock reliable product margin and purchasing decisions.",

    status: "new",

    score: {
      impact: 82,
      urgency: 70,
      confidence: 91,
    },

    actions: [
      {
        id: "open-commercial-intelligence",
        label: "Review commercial data",
        href: "/commercial",
        kind: "primary",
      },
    ],

    evidence: [
      {
        label: "Products affected",
        value: "9",
      },
      {
        label: "Analysis blocked",
        value: "Margin intelligence",
      },
      {
        label: "Confidence",
        value: "91%",
      },
    ],

    metadata: {
      affectedProducts: 9,
    },
  },

  {
    id: "catalogue-quality-review",
    type: "catalogue-update",
    source: "catalogue",

    title:
      "Improve catalogue completeness",

    summary:
      "Some catalogue records are missing information needed for stronger product matching and future automation.",

    outcome:
      "Improved catalogue records will increase matching accuracy and reduce manual review in later supplier uploads.",

    status: "new",

    score: {
      impact: 64,
      urgency: 48,
      confidence: 88,
    },

    actions: [
      {
        id: "open-catalogue-intelligence",
        label: "Open catalogue",
        href: "/catalogue",
        kind: "primary",
      },
    ],

    evidence: [
      {
        label: "Records affected",
        value: "14",
      },
      {
        label: "Primary issue",
        value:
          "Missing product attributes",
      },
      {
        label: "Confidence",
        value: "88%",
      },
    ],

    metadata: {
      affectedRecords: 14,
    },
  },
];

export default async function MissionsPage() {
  const inventorySnapshot =
    await getLiveInventorySnapshot();
  const inventoryMission =
    createInventoryMission(
      inventorySnapshot,
    );

  const missionDrafts = [
    ...DEMONSTRATION_MISSIONS,

    ...(inventoryMission
      ? [inventoryMission]
      : []),
  ];

  const missions =
    createMissions(
      missionDrafts,
    );

  const operationalSnapshot =
    createOperationalSnapshot({
      inventory:
        inventorySnapshot,

      missions,

      userName: "Tom",
    });

  /*
   * Retrieve the latest historical state before saving the
   * newly generated snapshot.
   */
  const previousSnapshot =
    await getPreviousOperationalSnapshot({
      beforeGeneratedAt:
        operationalSnapshot.generatedAt,
    });

  /*
   * Compare the historical and current operational states.
   */
  const executiveMemory =
    createExecutiveMemory(
      previousSnapshot,
      operationalSnapshot,
    );

  /*
   * Save the current state only after comparison and event
   * generation, preventing it from being compared with itself.
   */
  await saveOperationalSnapshot(
    operationalSnapshot,
  );

  const description =
    executiveMemory.hasPreviousSnapshot
      ? executiveMemory.summary
      : inventorySnapshot
            .productsRequiringAttention >
          0
        ? `Vault Brain is now using live inventory data. ${inventorySnapshot.productsRequiringAttention} monitored ${
            inventorySnapshot.productsRequiringAttention ===
            1
              ? "product requires"
              : "products require"
          } attention and inventory health is ${inventorySnapshot.healthScore}%.`
        : `Vault Brain is now using live inventory data. All ${inventorySnapshot.monitoredProducts} monitored products are currently above the attention threshold and inventory health is ${inventorySnapshot.healthScore}%.`;

  return (
    <MissionControlWorkspace
      missions={missions}
      snapshot={
        operationalSnapshot
      }
      executiveMemory={
        executiveMemory
      }
      title="Executive Intelligence"
      description={
        description
      }
    />
  );
}
