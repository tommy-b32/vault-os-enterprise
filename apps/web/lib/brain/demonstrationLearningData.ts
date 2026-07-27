import type {
  LearningObservation,
} from "@/lib/brain/LearningEngine";

export const DEMONSTRATION_LEARNING_OBSERVATIONS: LearningObservation[] =
  [
    {
      id: "moncler-stockout-01",
      learningKey:
        "moncler-black-badge-stockout-pattern",

      category: "inventory",

      title:
        "Moncler Black Badge repeatedly sells out after entering the reorder window",

      pattern:
        "Moncler Black Badge has repeatedly fallen below seven days of stock before a replacement order was approved.",

      consequence:
        "The product sold out and an estimated £620 of revenue was exposed.",

      recommendation: {
        title:
          "Approve the restock earlier",
        explanation:
          "Review the purchase order as soon as stock cover falls below ten days, rather than waiting until the product reaches critical stock.",
        actionLabel:
          "Review inventory",
        actionHref:
          "/inventory",
      },

      source: "inventory",
      occurredAt:
        "2026-05-18T09:15:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 86,

      valueGbp: 620,
      units: 0,

      tags: [
        "moncler",
        "stockout",
        "reorder",
      ],
    },

    {
      id: "moncler-stockout-02",
      learningKey:
        "moncler-black-badge-stockout-pattern",

      category: "inventory",

      title:
        "Moncler Black Badge repeatedly sells out after entering the reorder window",

      pattern:
        "Moncler Black Badge remained below the recommended stock-cover threshold while the supplier order was delayed.",

      consequence:
        "The product became unavailable for two trading days and approximately £840 of revenue was exposed.",

      recommendation: {
        title:
          "Approve the restock earlier",
        explanation:
          "Review the purchase order as soon as stock cover falls below ten days, rather than waiting until the product reaches critical stock.",
        actionLabel:
          "Review inventory",
        actionHref:
          "/inventory",
      },

      source: "inventory",
      occurredAt:
        "2026-06-09T11:40:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 90,

      valueGbp: 840,
      units: 0,

      tags: [
        "moncler",
        "stockout",
        "reorder",
      ],
    },

    {
      id: "moncler-stockout-03",
      learningKey:
        "moncler-black-badge-stockout-pattern",

      category: "inventory",

      title:
        "Moncler Black Badge repeatedly sells out after entering the reorder window",

      pattern:
        "Demand accelerated after Moncler Black Badge entered the reorder window and the recommended order was not approved immediately.",

      consequence:
        "Stock cover fell to zero before replenishment arrived, exposing approximately £1,180 of revenue.",

      recommendation: {
        title:
          "Approve the restock earlier",
        explanation:
          "Review the purchase order as soon as stock cover falls below ten days, rather than waiting until the product reaches critical stock.",
        actionLabel:
          "Review inventory",
        actionHref:
          "/inventory",
      },

      source: "inventory",
      occurredAt:
        "2026-07-17T13:05:00.000Z",

      outcome: "negative",
      tone: "critical",
      confidence: 94,

      valueGbp: 1180,
      units: 0,

      tags: [
        "moncler",
        "stockout",
        "reorder",
      ],
    },

    {
      id: "supplier-delay-01",
      learningKey:
        "supplier-tony-delay-pattern",

      category: "supplier",

      title:
        "Long supplier delays increase stock and revenue exposure",

      pattern:
        "Orders from Tony taking longer than ten days are repeatedly associated with products entering the critical stock range.",

      consequence:
        "Three products reached fewer than four days of stock before replenishment arrived.",

      recommendation: {
        title:
          "Escalate delayed supplier orders",
        explanation:
          "When Tony's expected lead time exceeds ten days, compare alternative suppliers or increase the order buffer.",
        actionLabel:
          "Review suppliers",
        actionHref:
          "/partners",
      },

      source: "supplier",
      occurredAt:
        "2026-04-26T10:30:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 78,

      units: 3,

      tags: [
        "supplier-tony",
        "delay",
        "lead-time",
      ],
    },

    {
      id: "supplier-delay-02",
      learningKey:
        "supplier-tony-delay-pattern",

      category: "supplier",

      title:
        "Long supplier delays increase stock and revenue exposure",

      pattern:
        "Orders from Tony taking longer than ten days are repeatedly associated with products entering the critical stock range.",

      consequence:
        "A delayed delivery exposed approximately £2,460 of expected revenue across Moncler and Dior products.",

      recommendation: {
        title:
          "Escalate delayed supplier orders",
        explanation:
          "When Tony's expected lead time exceeds ten days, compare alternative suppliers or increase the order buffer.",
        actionLabel:
          "Review suppliers",
        actionHref:
          "/partners",
      },

      source: "supplier",
      occurredAt:
        "2026-05-29T14:20:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 84,

      valueGbp: 2460,

      tags: [
        "supplier-tony",
        "delay",
        "lead-time",
      ],
    },

    {
      id: "supplier-delay-03",
      learningKey:
        "supplier-tony-delay-pattern",

      category: "supplier",

      title:
        "Long supplier delays increase stock and revenue exposure",

      pattern:
        "Orders from Tony taking longer than ten days are repeatedly associated with products entering the critical stock range.",

      consequence:
        "The latest delay placed four products inside their reorder window at the same time.",

      recommendation: {
        title:
          "Escalate delayed supplier orders",
        explanation:
          "When Tony's expected lead time exceeds ten days, compare alternative suppliers or increase the order buffer.",
        actionLabel:
          "Review suppliers",
        actionHref:
          "/partners",
      },

      source: "supplier",
      occurredAt:
        "2026-07-12T08:55:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 89,

      units: 4,

      tags: [
        "supplier-tony",
        "delay",
        "lead-time",
      ],
    },

    {
      id: "two-for-seventy-01",
      learningKey:
        "two-for-seventy-promotion-performance",

      category: "promotion",

      title:
        "The 2-for-£70 promotion increases order value",

      pattern:
        "Orders using the 2-for-£70 offer consistently contain more items than standard full-price orders.",

      consequence:
        "Average order value increased by 17% during the promotion period.",

      recommendation: {
        title:
          "Continue the 2-for-£70 offer",
        explanation:
          "Maintain the promotion while gross profit remains above the agreed commercial threshold.",
        actionLabel:
          "Review commercial data",
        actionHref:
          "/commercial",
      },

      source: "commercial",
      occurredAt:
        "2026-05-03T17:10:00.000Z",

      outcome: "positive",
      tone: "positive",
      confidence: 88,

      percentage: 17,

      tags: [
        "promotion",
        "two-for-seventy",
        "average-order-value",
      ],
    },

    {
      id: "two-for-seventy-02",
      learningKey:
        "two-for-seventy-promotion-performance",

      category: "promotion",

      title:
        "The 2-for-£70 promotion increases order value",

      pattern:
        "Orders using the 2-for-£70 offer consistently contain more items than standard full-price orders.",

      consequence:
        "Average order value increased by 19% and units per order increased by 0.8.",

      recommendation: {
        title:
          "Continue the 2-for-£70 offer",
        explanation:
          "Maintain the promotion while gross profit remains above the agreed commercial threshold.",
        actionLabel:
          "Review commercial data",
        actionHref:
          "/commercial",
      },

      source: "commercial",
      occurredAt:
        "2026-06-02T12:35:00.000Z",

      outcome: "positive",
      tone: "positive",
      confidence: 92,

      percentage: 19,
      units: 1,

      tags: [
        "promotion",
        "two-for-seventy",
        "average-order-value",
      ],
    },

    {
      id: "two-for-seventy-03",
      learningKey:
        "two-for-seventy-promotion-performance",

      category: "promotion",

      title:
        "The 2-for-£70 promotion increases order value",

      pattern:
        "Orders using the 2-for-£70 offer consistently contain more items than standard full-price orders.",

      consequence:
        "The latest campaign increased average order value by 21% without reducing total gross profit.",

      recommendation: {
        title:
          "Continue the 2-for-£70 offer",
        explanation:
          "Maintain the promotion while gross profit remains above the agreed commercial threshold.",
        actionLabel:
          "Review commercial data",
        actionHref:
          "/commercial",
      },

      source: "commercial",
      occurredAt:
        "2026-07-05T18:45:00.000Z",

      outcome: "positive",
      tone: "positive",
      confidence: 95,

      percentage: 21,

      tags: [
        "promotion",
        "two-for-seventy",
        "average-order-value",
      ],
    },

    {
      id: "packing-accuracy-01",
      learningKey:
        "supplier-packing-accuracy-pattern",

      category: "operations",

      title:
        "Supplier packing errors increase customer-service workload",

      pattern:
        "Incorrect or substituted packs create additional support, replacement and refund work.",

      consequence:
        "One inaccurate shipment created six customer-service cases and two replacement orders.",

      recommendation: {
        title:
          "Reduce allocation to inaccurate suppliers",
        explanation:
          "Require a pre-dispatch packing confirmation before approving larger supplier orders.",
        actionLabel:
          "Review suppliers",
        actionHref:
          "/partners",
      },

      source: "supplier",
      occurredAt:
        "2026-05-14T15:25:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 82,

      units: 8,

      tags: [
        "packing",
        "accuracy",
        "customer-service",
      ],
    },

    {
      id: "packing-accuracy-02",
      learningKey:
        "supplier-packing-accuracy-pattern",

      category: "operations",

      title:
        "Supplier packing errors increase customer-service workload",

      pattern:
        "Incorrect or substituted packs create additional support, replacement and refund work.",

      consequence:
        "A later shipment contained nine incorrect packs and delayed catalogue availability.",

      recommendation: {
        title:
          "Reduce allocation to inaccurate suppliers",
        explanation:
          "Require a pre-dispatch packing confirmation before approving larger supplier orders.",
        actionLabel:
          "Review suppliers",
        actionHref:
          "/partners",
      },

      source: "supplier",
      occurredAt:
        "2026-06-21T16:40:00.000Z",

      outcome: "negative",
      tone: "warning",
      confidence: 88,

      units: 9,

      tags: [
        "packing",
        "accuracy",
        "customer-service",
      ],
    },

    {
      id: "purchase-timing-01",
      learningKey:
        "early-restock-purchase-outcome",

      category: "capital",

      title:
        "Earlier restock approval protects revenue without breaching the reserve",

      pattern:
        "Purchase orders approved while products still have more than eight days of stock arrive before availability becomes critical.",

      consequence:
        "The order protected approximately £1,940 of expected revenue while the protected cash reserve remained intact.",

      recommendation: {
        title:
          "Approve high-confidence restocks earlier",
        explanation:
          "Allow Vault Brain to prepare orders once stock cover falls below ten days, subject to final approval.",
        actionLabel:
          "Review capital",
        actionHref:
          "/commercial",
      },

      source: "capital",
      occurredAt:
        "2026-06-13T09:50:00.000Z",

      outcome: "positive",
      tone: "positive",
      confidence: 91,

      valueGbp: 1940,

      tags: [
        "capital",
        "restock",
        "reserve",
      ],
    },

    {
      id: "purchase-timing-02",
      learningKey:
        "early-restock-purchase-outcome",

      category: "capital",

      title:
        "Earlier restock approval protects revenue without breaching the reserve",

      pattern:
        "Purchase orders approved while products still have more than eight days of stock arrive before availability becomes critical.",

      consequence:
        "The latest early restock protected approximately £2,380 of expected revenue and preserved the full cash reserve.",

      recommendation: {
        title:
          "Approve high-confidence restocks earlier",
        explanation:
          "Allow Vault Brain to prepare orders once stock cover falls below ten days, subject to final approval.",
        actionLabel:
          "Review capital",
        actionHref:
          "/commercial",
      },

      source: "capital",
      occurredAt:
        "2026-07-08T10:15:00.000Z",

      outcome: "positive",
      tone: "positive",
      confidence: 94,

      valueGbp: 2380,

      tags: [
        "capital",
        "restock",
        "reserve",
      ],
    },
  ];