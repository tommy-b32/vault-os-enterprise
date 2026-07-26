import { SupplierReviewWorkspace } from "@/components/suppliers/SupplierReviewWorkspace";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

const demoProducts: CatalogueProduct[] = [
  {
    product_id: "demo-balencia-logo-black",
    product_name: "Balencia Logo Tee Black",

    product_type: "T-Shirt",
    status: "active",

    supplier_id: "exclusive",
    supplier_company: "Exclusive",

    inventory_strategy: "stocked",
    restock_enabled: true,

    pack_profile: "pack",
    supplier_moq_packs: null,
    target_stock_days: 21,

    decision_reason:
      "Core catalogue product supplied by Exclusive.",

    notes: null,

    stock_on_hand: 12,
    complete_packs: 2,
    loose_units: 2,

    configuration_score: 82,
    configuration_state: "ready",

    missing_requirements: [],
    missing_requirement_count: 0,

    configuration_trusted: true,
    trusted_for_reorder: true,

    brain_confidence: "high",

    commercial_cost: {
      currency: "EUR",
      exchange_rate_to_gbp: 0.86,

      pack_cost: 60,
      shipping_cost_per_pack: 8,
      import_cost_per_pack: 2,

      units_per_pack: 5,

      landed_cost_per_pack: 70,
      landed_cost_per_pack_gbp: 60.2,
      landed_cost_per_unit: 12.04,

      average_selling_price: 35,

      estimated_gross_profit_per_unit: 22.96,
      estimated_margin_percent: 65.6,

      estimated_return_on_pack_capital_percent:
        190.7,

      commercial_cost_trusted: true,
      missing_commercial_requirements: [],

      last_supplier_price_update:
        "2026-07-26T00:00:00.000Z",

      commercial_notes:
        "Demonstration commercial data.",
    },
  },

  {
    product_id: "demo-amiri-classic-white",
    product_name: "Amiri Classic Tee White",

    product_type: "T-Shirt",
    status: "active",

    supplier_id: "exclusive",
    supplier_company: "Exclusive",

    inventory_strategy: "stocked",
    restock_enabled: true,

    pack_profile: "pack",
    supplier_moq_packs: null,
    target_stock_days: 18,

    decision_reason:
      "Existing white Amiri product.",

    notes: null,

    stock_on_hand: 7,
    complete_packs: 1,
    loose_units: 2,

    configuration_score: 76,
    configuration_state: "almost_ready",

    missing_requirements: [],
    missing_requirement_count: 0,

    configuration_trusted: true,
    trusted_for_reorder: true,

    brain_confidence: "limited",

    commercial_cost: {
      currency: "EUR",
      exchange_rate_to_gbp: 0.86,

      pack_cost: 62,
      shipping_cost_per_pack: 8,
      import_cost_per_pack: 2,

      units_per_pack: 5,

      landed_cost_per_pack: 72,
      landed_cost_per_pack_gbp: 61.92,
      landed_cost_per_unit: 12.38,

      average_selling_price: 35,

      estimated_gross_profit_per_unit: 22.62,
      estimated_margin_percent: 64.6,

      estimated_return_on_pack_capital_percent:
        182.7,

      commercial_cost_trusted: true,
      missing_commercial_requirements: [],

      last_supplier_price_update:
        "2026-07-26T00:00:00.000Z",

      commercial_notes:
        "Demonstration commercial data.",
    },
  },
];

const reviewCards: SupplierCatalogueCardData[] = [
  {
    id: "review-exclusive-balencia-black",

    supplierId: "exclusive",
    supplierName: "Exclusive",

    catalogueId: "exclusive-summer-2026",
    catalogueName: "Summer T-Shirt Collection 2026",

    pageNumber: 4,

    brand: "Balencia",
    officialProductName:
      "Balenciaga Logo T-Shirt",
    internalReference:
      "Exclusive catalogue page 4",

    colour: "Black",

    packCost: 60,
    packSize: 5,
    currency: "EUR",

    leadTimeDays: 10,

    status: "review",

    linkedProductId: null,
    linkedProductName: null,

    isPreferredSource: true,

    images: [],

    notes:
      "Demo review item awaiting catalogue matching approval.",
  },

  {
    id: "review-exclusive-amiri-white",

    supplierId: "exclusive",
    supplierName: "Exclusive",

    catalogueId: "exclusive-summer-2026",
    catalogueName: "Summer T-Shirt Collection 2026",

    pageNumber: 15,

    brand: "Amiri",
    officialProductName:
      "Amiri Classic Logo T-Shirt",
    internalReference:
      "Exclusive catalogue page 15",

    colour: "White",

    packCost: 62,
    packSize: 5,
    currency: "EUR",

    leadTimeDays: 10,

    status: "review",

    linkedProductId: null,
    linkedProductName: null,

    isPreferredSource: true,

    images: [],

    notes:
      "Second demonstration review item.",
  },
];

const reviewMatches: CatalogueMatchingResult[] = [
  {
    catalogueCardId:
      reviewCards[0].id,

    bestMatch: {
      product: demoProducts[0],
      confidence: 86,

      signals: [
        {
          reason: "same_supplier",
          label: "Same supplier",
          score: 20,
        },
        {
          reason: "brand_match",
          label:
            "Brand appears in product name",
          score: 20,
        },
        {
          reason: "name_similarity",
          label:
            "Product naming similarity",
          score: 31,
        },
        {
          reason: "colour_match",
          label:
            "Colour appears in product name",
          score: 15,
        },
      ],
    },

    alternatives: [
      {
        product: demoProducts[1],
        confidence: 34,
        signals: [
          {
            reason: "same_supplier",
            label: "Same supplier",
            score: 20,
          },
          {
            reason: "name_similarity",
            label:
              "Limited naming similarity",
            score: 14,
          },
        ],
      },
    ],

    requiresReview: true,
    status: "possible_match",
  },

  {
    catalogueCardId:
      reviewCards[1].id,

    bestMatch: {
      product: demoProducts[1],
      confidence: 78,

      signals: [
        {
          reason: "same_supplier",
          label: "Same supplier",
          score: 20,
        },
        {
          reason: "brand_match",
          label:
            "Brand appears in product name",
          score: 20,
        },
        {
          reason: "name_similarity",
          label:
            "Product naming similarity",
          score: 23,
        },
        {
          reason: "colour_match",
          label:
            "Colour appears in product name",
          score: 15,
        },
      ],
    },

    alternatives: [
      {
        product: demoProducts[0],
        confidence: 22,
        signals: [
          {
            reason: "same_supplier",
            label: "Same supplier",
            score: 20,
          },
          {
            reason: "name_similarity",
            label:
              "Low naming similarity",
            score: 2,
          },
        ],
      },
    ],

    requiresReview: true,
    status: "possible_match",
  },
];

const reviewItems = reviewCards.map(
  (card, index) => ({
    card,
    match: reviewMatches[index],
  }),
);

export const dynamic = "force-dynamic";

export default function SupplierCatalogueReviewPage() {
  return (
    <SupplierReviewWorkspace
      items={reviewItems}
    />
  );
}
