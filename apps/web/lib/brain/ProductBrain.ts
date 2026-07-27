import type {
  BrainConfidence,
  CatalogueProduct,
  ConfigurationState,
  InventoryStrategy,
} from "@/types/catalogue";

/* ============================================================
   PRODUCT BRAIN CONTRACTS
============================================================ */

export type ProductBrainHealth =
  | "healthy"
  | "low"
  | "out"
  | "negative"
  | "unmonitored";

export type ProductBrainSupplier = {
  id: string | null;
  name: string | null;
};

export type ProductBrainInventory = {
  strategy: InventoryStrategy;
  configurationState: ConfigurationState;

  stockOnHand: number;
  committedStock: number;
  availableStock: number;
  incomingStock: number;

  targetStockDays: number | null;

  isStocked: boolean;
  isDropship: boolean;
  isService: boolean;
  isDoNotRestock: boolean;
  isDiscontinued: boolean;

  shouldMonitorStock: boolean;
  shouldRestock: boolean;

  health: ProductBrainHealth;
};

export type ProductBrainConfiguration = {
  score: number;
  state: ConfigurationState;

  trusted: boolean;
  trustedForReorder: boolean;

  missingRequirements: string[];
  missingRequirementCount: number;

  brainConfidence: BrainConfidence;
};

export type ProductBrainCommercial = {
  currency: string;

  packCost: number | null;
  unitsPerPack: number | null;

  landedCostPerPackGbp: number | null;
  landedCostPerUnit: number | null;

  averageSellingPrice: number | null;
  estimatedGrossProfitPerUnit: number | null;
  estimatedMarginPercent: number | null;
  estimatedReturnOnPackCapitalPercent: number | null;

  trusted: boolean;
};

export type ProductBrainProfile = {
  id: string;
  name: string;

  productType: string | null;
  status: string | null;

  supplier: ProductBrainSupplier;

  inventory: ProductBrainInventory;
  configuration: ProductBrainConfiguration;
  commercial: ProductBrainCommercial;
};

export type ProductBrainInventoryInput = {
  productId: string;

  committedStock?: number | null;
  incomingStock?: number | null;
};

export type ProductBrainBuildInput = {
  product: CatalogueProduct;

  inventory?: ProductBrainInventoryInput;
};

/* ============================================================
   HELPERS
============================================================ */

function normaliseNumber(
  value: number | null | undefined,
): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return value;
}

function getAvailableStock({
  stockOnHand,
  committedStock,
}: {
  stockOnHand: number;
  committedStock: number;
}): number {
  return stockOnHand - committedStock;
}

function isDoNotRestockState(
  state: ConfigurationState,
): boolean {
  return state === "do_not_restock";
}

function isDiscontinuedState(
  state: ConfigurationState,
): boolean {
  return state === "discontinued";
}

function isServiceState(
  state: ConfigurationState,
): boolean {
  return state === "service";
}

function calculateInventoryHealth({
  availableStock,
  shouldMonitorStock,
}: {
  availableStock: number;
  shouldMonitorStock: boolean;
}): ProductBrainHealth {
  if (!shouldMonitorStock) {
    return "unmonitored";
  }

  if (availableStock < 0) {
    return "negative";
  }

  if (availableStock === 0) {
    return "out";
  }

  if (availableStock <= 5) {
    return "low";
  }

  return "healthy";
}

function buildInventory(
  product: CatalogueProduct,
  inventory?: ProductBrainInventoryInput,
): ProductBrainInventory {
  const strategy =
    product.inventory_strategy ?? "stocked";

  const configurationState =
    product.configuration_state;

  const stockOnHand =
    normaliseNumber(
      product.stock_on_hand,
    );

  const committedStock =
    normaliseNumber(
      inventory?.committedStock,
    );

  const incomingStock =
    normaliseNumber(
      inventory?.incomingStock,
    );

  const availableStock =
    getAvailableStock({
      stockOnHand,
      committedStock,
    });

  const isDropship =
    strategy === "dropship";

  const isService =
    strategy === "service" ||
    isServiceState(
      configurationState,
    );

  const isDoNotRestock =
    isDoNotRestockState(
      configurationState,
    );

  const isDiscontinued =
    isDiscontinuedState(
      configurationState,
    );

  const isStocked =
    !isDropship &&
    !isService &&
    !isDiscontinued;

  const shouldMonitorStock =
    isStocked &&
    !isDoNotRestock;

  const shouldRestock =
    shouldMonitorStock &&
    product.restock_enabled &&
    product.trusted_for_reorder;

  return {
    strategy,
    configurationState,

    stockOnHand,
    committedStock,
    availableStock,
    incomingStock,

    targetStockDays:
      product.target_stock_days,

    isStocked,
    isDropship,
    isService,
    isDoNotRestock,
    isDiscontinued,

    shouldMonitorStock,
    shouldRestock,

    health:
      calculateInventoryHealth({
        availableStock,
        shouldMonitorStock,
      }),
  };
}

function buildConfiguration(
  product: CatalogueProduct,
): ProductBrainConfiguration {
  return {
    score:
      product.configuration_score,

    state:
      product.configuration_state,

    trusted:
      product.configuration_trusted,

    trustedForReorder:
      product.trusted_for_reorder,

    missingRequirements: [
      ...product.missing_requirements,
    ],

    missingRequirementCount:
      product.missing_requirement_count,

    brainConfidence:
      product.brain_confidence,
  };
}

function buildCommercial(
  product: CatalogueProduct,
): ProductBrainCommercial {
  const commercial =
    product.commercial_cost;

  return {
    currency:
      commercial.currency,

    packCost:
      commercial.pack_cost,

    unitsPerPack:
      commercial.units_per_pack,

    landedCostPerPackGbp:
      commercial.landed_cost_per_pack_gbp,

    landedCostPerUnit:
      commercial.landed_cost_per_unit,

    averageSellingPrice:
      commercial.average_selling_price,

    estimatedGrossProfitPerUnit:
      commercial.estimated_gross_profit_per_unit,

    estimatedMarginPercent:
      commercial.estimated_margin_percent,

    estimatedReturnOnPackCapitalPercent:
      commercial.estimated_return_on_pack_capital_percent,

    trusted:
      commercial.commercial_cost_trusted,
  };
}

/* ============================================================
   PRODUCT BRAIN
============================================================ */

export const ProductBrain = {
  build({
    product,
    inventory,
  }: ProductBrainBuildInput): ProductBrainProfile {
    return {
      id: product.product_id,
      name: product.product_name,

      productType:
        product.product_type,

      status:
        product.status,

      supplier: {
        id:
          product.supplier_id,

        name:
          product.supplier_company,
      },

      inventory:
        buildInventory(
          product,
          inventory,
        ),

      configuration:
        buildConfiguration(
          product,
        ),

      commercial:
        buildCommercial(
          product,
        ),
    };
  },

  buildMany(
    inputs: ProductBrainBuildInput[],
  ): ProductBrainProfile[] {
    return inputs.map(
      (input) =>
        ProductBrain.build(input),
    );
  },

  getById(
    products: ProductBrainProfile[],
    productId: string,
  ): ProductBrainProfile | null {
    return (
      products.find(
        (product) =>
          product.id === productId,
      ) ?? null
    );
  },

  getInventoryRisks(
    products: ProductBrainProfile[],
  ): ProductBrainProfile[] {
    return products
      .filter(
        (product) =>
          product.inventory
            .shouldMonitorStock &&
          product.inventory.health !==
            "healthy",
      )
      .sort(
        (a, b) =>
          a.inventory.availableStock -
          b.inventory.availableStock,
      );
  },

  getRestockCandidates(
    products: ProductBrainProfile[],
  ): ProductBrainProfile[] {
    return products
      .filter(
        (product) =>
          product.inventory
            .shouldRestock &&
          (
            product.inventory.health ===
              "low" ||
            product.inventory.health ===
              "out" ||
            product.inventory.health ===
              "negative"
          ),
      )
      .sort(
        (a, b) =>
          a.inventory.availableStock -
          b.inventory.availableStock,
      );
  },
} as const;