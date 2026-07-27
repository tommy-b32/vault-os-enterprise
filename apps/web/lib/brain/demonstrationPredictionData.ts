import type {
  PredictionInput,
} from "@/lib/brain/PredictionEngine";

export const DEMONSTRATION_PREDICTION_INPUTS: PredictionInput[] =
  [
    {
      id: "moncler-stockout-forecast",

      category: "inventory",

      title:
        "Moncler Black Badge is likely to sell out within six days",

      summary:
        "Current stock cover is shorter than the expected supplier lead time, creating a high likelihood of a stock-out before replenishment arrives.",

      source: "inventory",

      direction: "risk",
      tone: "critical",

      window: {
        label: "Within 6 days",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-08-01T20:45:00.000Z",
        days: 6,
      },

      predictedValue: 0,
      currentValue: 8,
      thresholdValue: 10,

      potentialRevenueAtRiskGbp:
        3420,

      baseConfidence: 94,
      historicalAccuracy: 91,
      observationCount: 3,

      recommendation: {
        title:
          "Approve the prepared restock today",

        explanation:
          "The current six-day stock cover is shorter than the twelve-day supplier lead time. Approving the order now reduces the likelihood of a repeat stock-out.",

        actionLabel:
          "Review inventory",

        actionHref:
          "/inventory",
      },

      evidence: [
        {
          id: "moncler-current-stock",

          source: "inventory",

          label:
            "Current inventory position",

          explanation:
            "Eight units remain, representing approximately six days of stock cover.",

          confidence: 96,

          value: 6,
          unit: "days",
        },

        {
          id: "moncler-supplier-lead-time",

          source: "supplier",

          label:
            "Supplier lead time",

          explanation:
            "The assigned supplier currently requires approximately twelve days for replenishment.",

          confidence: 92,

          value: 12,
          unit: "days",
        },

        {
          id: "moncler-stockout-history",

          source: "inventory",

          label:
            "Historical stock-out pattern",

          explanation:
            "Three previous delayed restocks resulted in the product becoming unavailable.",

          confidence: 94,

          value: 3,
          unit: "units",
        },
      ],

      tags: [
        "moncler",
        "stockout",
        "reorder",
      ],
    },

    {
      id: "overnight-order-forecast",

      category: "orders",

      title:
        "Tomorrow is likely to generate between 8 and 11 orders",

      summary:
        "Recent trading performance and recurring weekend behaviour indicate another above-average order period.",

      source: "shopify",

      direction: "increase",
      tone: "positive",

      window: {
        label: "Next 24 hours",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-07-27T20:45:00.000Z",
        days: 1,
      },

      predictedRange: {
        minimum: 8,
        maximum: 11,
        unit: "orders",
      },

      currentValue: 7,

      baseConfidence: 84,
      historicalAccuracy: 86,
      observationCount: 12,

      recommendation: {
        title:
          "Prepare fulfilment capacity",

        explanation:
          "Ensure popular products and packing materials are ready for a likely increase in orders during the next trading period.",

        actionLabel:
          "Review orders",

        actionHref:
          "/orders",
      },

      evidence: [
        {
          id: "recent-order-velocity",

          source: "shopify",

          label:
            "Recent order velocity",

          explanation:
            "Seven overnight orders were received, 16% above the comparison period.",

          confidence: 96,

          value: 7,
          unit: "orders",
        },

        {
          id: "weekend-order-pattern",

          source: "commercial",

          label:
            "Recurring weekend pattern",

          explanation:
            "The previous twelve comparable periods averaged between eight and eleven orders.",

          confidence: 88,

          value: 12,
          unit: "orders",
        },
      ],

      tags: [
        "orders",
        "forecast",
        "fulfilment",
      ],
    },

    {
      id: "revenue-forecast",

      category: "revenue",

      title:
        "Revenue is forecast to reach between £590 and £820 tomorrow",

      summary:
        "Current order velocity and the continued performance of the 2-for-£70 promotion support an above-average revenue forecast.",

      source: "commercial",

      direction: "increase",
      tone: "positive",

      window: {
        label: "Next 24 hours",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-07-27T20:45:00.000Z",
        days: 1,
      },

      predictedRange: {
        minimum: 590,
        maximum: 820,
        unit: "gbp",
      },

      currentValue: 520,

      potentialProfitImpactGbp:
        310,

      baseConfidence: 86,
      historicalAccuracy: 84,
      observationCount: 12,

      recommendation: {
        title:
          "Maintain the current promotion",

        explanation:
          "The 2-for-£70 offer is supporting stronger order value without reducing total gross profit in the observed periods.",

        actionLabel:
          "Review commercial data",

        actionHref:
          "/commercial",
      },

      evidence: [
        {
          id: "current-revenue",

          source: "shopify",

          label:
            "Latest trading revenue",

          explanation:
            "The latest overnight period generated £520 from seven orders.",

          confidence: 100,

          value: 520,
          unit: "gbp",
        },

        {
          id: "promotion-performance",

          source: "commercial",

          label:
            "Promotion performance",

          explanation:
            "The 2-for-£70 offer has increased average order value by between 17% and 21% in three observed campaigns.",

          confidence: 95,

          value: 19,
          unit: "percentage",
        },

        {
          id: "average-order-value",

          source: "shopify",

          label:
            "Average order value",

          explanation:
            "Current average order value is approximately £74.",

          confidence: 100,

          value: 74,
          unit: "gbp",
        },
      ],

      tags: [
        "revenue",
        "promotion",
        "forecast",
      ],
    },

    {
      id: "supplier-delay-risk",

      category: "supplier",

      title:
        "Tony’s current lead time is likely to create additional stock exposure",

      summary:
        "The assigned supplier lead time exceeds the remaining stock cover for the highest-risk product.",

      source: "supplier",

      direction: "risk",
      tone: "warning",

      window: {
        label: "Within 12 days",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-08-07T20:45:00.000Z",
        days: 12,
      },

      currentValue: 12,
      thresholdValue: 10,

      potentialRevenueAtRiskGbp:
        3420,

      baseConfidence: 88,
      historicalAccuracy: 85,
      observationCount: 3,

      recommendation: {
        title:
          "Compare an alternative supplier",

        explanation:
          "If Tony cannot reduce the expected lead time below ten days, compare another approved supplier or increase the order buffer.",

        actionLabel:
          "Review suppliers",

        actionHref:
          "/partners",
      },

      evidence: [
        {
          id: "current-lead-time",

          source: "supplier",

          label:
            "Current lead time",

          explanation:
            "The assigned supplier currently requires approximately twelve days.",

          confidence: 92,

          value: 12,
          unit: "days",
        },

        {
          id: "delay-history",

          source: "supplier",

          label:
            "Historical delay outcomes",

          explanation:
            "Three comparable delays were associated with products entering critical stock ranges.",

          confidence: 89,

          value: 3,
          unit: "units",
        },
      ],

      tags: [
        "supplier-tony",
        "delay",
        "lead-time",
      ],
    },

    {
      id: "capital-reserve-forecast",

      category: "capital",

      title:
        "The protected cash reserve should remain intact after the proposed restock",

      summary:
        "Available purchasing power is sufficient to fund the proposed restock while maintaining the protected reserve.",

      source: "capital",

      direction: "stable",
      tone: "positive",

      window: {
        label: "After proposed purchase",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-07-27T20:45:00.000Z",
        days: 1,
      },

      predictedValue: 3000,
      currentValue: 7740,
      thresholdValue: 3000,

      baseConfidence: 93,
      historicalAccuracy: 92,
      observationCount: 2,

      recommendation: {
        title:
          "Proceed subject to final purchase approval",

        explanation:
          "The proposed restock can be funded without using the protected £3,000 reserve, provided no additional committed purchases are added first.",

        actionLabel:
          "Review capital",

        actionHref:
          "/commercial",
      },

      evidence: [
        {
          id: "available-purchasing-power",

          source: "capital",

          label:
            "Available purchasing power",

          explanation:
            "Vault Brain currently calculates £7,740 of available purchasing power.",

          confidence: 96,

          value: 7740,
          unit: "gbp",
        },

        {
          id: "protected-reserve",

          source: "capital",

          label:
            "Protected reserve",

          explanation:
            "The current protected cash reserve is £3,000.",

          confidence: 100,

          value: 3000,
          unit: "gbp",
        },
      ],

      tags: [
        "capital",
        "reserve",
        "restock",
      ],
    },

    {
      id: "mission-priority-forecast",

      category: "mission",

      title:
        "The supplier review queue is likely to remain today’s highest-value mission",

      summary:
        "Inventory exposure, supplier lead time and historical stock-out outcomes all support keeping the supplier review at the top of the mission queue.",

      source: "missions",

      direction: "stable",
      tone: "info",

      window: {
        label: "Today",
        startsAt:
          "2026-07-26T20:45:00.000Z",
        endsAt:
          "2026-07-27T00:00:00.000Z",
        days: 1,
      },

      baseConfidence: 90,
      historicalAccuracy: 89,
      observationCount: 4,

      recommendation: {
        title:
          "Complete the supplier review first",

        explanation:
          "Resolving the supplier and restock decision addresses the largest current inventory and revenue exposure.",

        actionLabel:
          "Open missions",

        actionHref:
          "/missions",
      },

      evidence: [
        {
          id: "mission-ranking",

          source: "missions",

          label:
            "Current mission ranking",

          explanation:
            "The supplier review queue is already ranked as the highest-priority mission.",

          confidence: 90,
        },

        {
          id: "inventory-risk-support",

          source: "inventory",

          label:
            "Inventory risk",

          explanation:
            "Moncler Black Badge has approximately six days of stock remaining.",

          confidence: 96,

          value: 6,
          unit: "days",
        },

        {
          id: "historical-learning-support",

          source: "inventory",

          label:
            "Historical learning",

          explanation:
            "Three previous delayed restocks resulted in product unavailability and revenue exposure.",

          confidence: 94,

          value: 3,
          unit: "units",
        },
      ],

      tags: [
        "mission",
        "priority",
        "supplier-review",
      ],
    },
  ];