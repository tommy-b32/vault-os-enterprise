import MissionControlWorkspace from "@/components/brain/MissionControlWorkspace";
import { createMissions } from "@/lib/missions/MissionEngine";

import type { MissionDraft } from "@/types/missions";

const DEMONSTRATION_MISSIONS: MissionDraft[] = [
  {
    id: "supplier-review-queue",
    type: "supplier-review",
    source: "supplier",
    title: "Complete the supplier review queue",
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
        label: "Products awaiting review",
        value: "18",
      },
      {
        label: "Estimated review time",
        value: "12 minutes",
      },
      {
        label: "Detection confidence",
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
    title: "Resolve missing commercial data",
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
    id: "inventory-restock-opportunity",
    type: "restock",
    source: "inventory",
    title: "Review a developing restock opportunity",
    summary:
      "Inventory levels are becoming constrained across several products while recent demand remains healthy.",
    outcome:
      "Early review can protect availability and reduce the risk of losing sales before stock reaches zero.",
    status: "new",
    score: {
      impact: 76,
      urgency: 78,
      confidence: 84,
    },
    actions: [
      {
        id: "open-inventory-intelligence",
        label: "Review inventory",
        href: "/inventory",
        kind: "primary",
      },
    ],
    evidence: [
      {
        label: "Products affected",
        value: "6",
      },
      {
        label: "Average stock cover",
        value: "8 days",
      },
      {
        label: "Confidence",
        value: "84%",
      },
    ],
    metadata: {
      affectedProducts: 6,
      stockCoverDays: 8,
    },
  },
  {
    id: "catalogue-quality-review",
    type: "catalogue-update",
    source: "catalogue",
    title: "Improve catalogue completeness",
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
        value: "Missing product attributes",
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

export default function MissionsPage() {
  const missions = createMissions(
    DEMONSTRATION_MISSIONS,
  );

  return (
    <MissionControlWorkspace
      missions={missions}
      title="Vault Brain"
      description="Good morning Tom. I’ve analysed your supplier, commercial, inventory and catalogue signals and identified four high-value missions requiring attention."
    />
  );
}