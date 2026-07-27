import type {
  VaultBrainOperationalSnapshot,
} from "@/lib/brain/types";

const DEMONSTRATION_GENERATED_AT =
  "2026-07-26T20:45:00.000Z";

const DEMONSTRATION_PERIOD_STARTED_AT =
  "2026-07-26T08:45:00.000Z";

export const DEMONSTRATION_OPERATIONAL_SNAPSHOT: VaultBrainOperationalSnapshot =
  {
    generatedAt: DEMONSTRATION_GENERATED_AT,
    organisationId: "the-fabric-vault",
    userName: "Tom",

    trading: {
      periodStartedAt:
        DEMONSTRATION_PERIOD_STARTED_AT,

      periodEndedAt:
        DEMONSTRATION_GENERATED_AT,

      orderCount: 7,
      grossRevenueGbp: 520,
      netRevenueGbp: 497,
      profitGbp: 218,

      itemsSold: 19,
      averageOrderValueGbp: 74.29,

      newCustomerCount: 4,
      returningCustomerCount: 3,

      comparisonOrderCountPercentage: 16,
      comparisonRevenuePercentage: 12,
      comparisonProfitPercentage: 9,
    },

    inventory: {
      state: "healthy",
      score: 88,

      totalProducts: 143,
      healthyProducts: 132,
      lowStockProducts: 9,
      outOfStockProducts: 2,

      estimatedStockValueGbp: 12480,
    },

    stockImpacts: [
      {
        productId: "moncler-black-badge",
        productName: "Moncler Black Badge",

        unitsSold: 5,
        stockRemaining: 8,
        estimatedStockDaysRemaining: 6,

        reorderRequired: true,
        urgency: "high",

        supplierId: "supplier-tony",
        supplierName: "Tony",
        supplierLeadTimeDays: 12,

        estimatedRevenueAtRiskGbp: 3420,
        confidence: 96,
      },

      {
        productId: "dior-atelier",
        productName: "Dior Atelier",

        unitsSold: 4,
        stockRemaining: 17,
        estimatedStockDaysRemaining: 14,

        reorderRequired: false,
        urgency: "medium",

        supplierId: "supplier-tony",
        supplierName: "Tony",
        supplierLeadTimeDays: 12,

        estimatedRevenueAtRiskGbp: 1120,
        confidence: 84,
      },
    ],

    missions: {
      actionable: 4,
      critical: 0,
      high: 3,

      highestPriorityMissionId:
        "supplier-review-queue",

      highestPriorityMissionTitle:
        "Complete the supplier review queue",

      averageConfidence: 90,
    },

    cash: {
      availableCashGbp: 12540,
      protectedReserveGbp: 3000,
      committedPurchasingGbp: 1800,
      availablePurchasingPowerGbp: 7740,
    },

    sourceStatuses: [
      {
        source: "shopify",
        label: "Shopify",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },

      {
        source: "inventory",
        label: "Inventory",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },

      {
        source: "commercial",
        label: "Commercial",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },

      {
        source: "supplier",
        label: "Suppliers",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },

      {
        source: "catalogue",
        label: "Catalogue",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },

      {
        source: "missions",
        label: "Mission Engine",
        status: "healthy",
        lastUpdatedAt:
          DEMONSTRATION_GENERATED_AT,
      },
    ],
  };