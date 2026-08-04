import {
  ProductBrain,
} from "@/lib/brain/ProductBrain";

import {
  getCatalogueProducts,
} from "@/lib/catalogue";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

type LiveInventoryRow = {
  product_id: string;
  committed_stock: number | null;
  incoming_stock: number | null;
  last_inventory_sync: string | null;
};

export type LiveInventorySnapshot = {
  generatedAt: string;
  latestSyncAt: string | null;

  totalProducts: number;
  monitoredProducts: number;
  excludedProducts: number;

  healthyProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  negativeStockProducts: number;

  dropshipProducts: number;
  serviceProducts: number;
  doNotRestockProducts: number;
  discontinuedProducts: number;

  unitsOnHand: number;
  committedUnits: number;
  incomingUnits: number;

  healthScore: number;
  productsRequiringAttention: number;
};

function calculateHealthScore({
  healthy,
  low,
  monitored,
}: {
  healthy: number;
  low: number;
  monitored: number;
}): number {
  if (monitored === 0) {
    return 100;
  }

  const weightedHealth =
    healthy + low * 0.5;

  return Math.round(
    (weightedHealth / monitored) * 100,
  );
}

function getLatestSync(
  rows: LiveInventoryRow[],
): string | null {
  const timestamps = rows
    .map((row) => row.last_inventory_sync)
    .filter(
      (value): value is string =>
        Boolean(value),
    )
    .sort(
      (a, b) =>
        new Date(b).getTime() -
        new Date(a).getTime(),
    );

  return timestamps[0] ?? null;
}

export async function getLiveInventorySnapshot(): Promise<LiveInventorySnapshot> {
  const [
    catalogueProducts,
    inventoryResponse,
  ] = await Promise.all([
    getCatalogueProducts(),

    supabaseAdmin
      .from("vault_inventory_intelligence")
      .select(`
        product_id,
        committed_stock,
        incoming_stock,
        last_inventory_sync
      `),
  ]);

  if (inventoryResponse.error) {
    throw new Error(
      inventoryResponse.error.message,
    );
  }

  const inventoryRows =
    (inventoryResponse.data ??
      []) as LiveInventoryRow[];

  const inventoryByProduct =
    new Map(
      inventoryRows.map((row) => [
        row.product_id,
        row,
      ]),
    );

  const profiles =
    ProductBrain.buildMany(
      catalogueProducts.map((product) => {
        const inventory =
          inventoryByProduct.get(
            product.style_id,
          );

        return {
          product,
          inventory: {
            productId:
              product.style_id,

            committedStock:
              inventory?.committed_stock ??
              0,

            incomingStock:
              inventory?.incoming_stock ??
              0,
          },
        };
      }),
    );

  const monitoredProducts =
    profiles.filter(
      (profile) =>
        profile.inventory
          .shouldMonitorStock,
    );

  const healthyProducts =
    monitoredProducts.filter(
      (profile) =>
        profile.inventory.health ===
        "healthy",
    );

  const lowStockProducts =
    monitoredProducts.filter(
      (profile) =>
        profile.inventory.health ===
        "low",
    );

  const outOfStockProducts =
    monitoredProducts.filter(
      (profile) =>
        profile.inventory.health ===
        "out",
    );

  const negativeStockProducts =
    monitoredProducts.filter(
      (profile) =>
        profile.inventory.health ===
        "negative",
    );

  const dropshipProducts =
    profiles.filter(
      (profile) =>
        profile.inventory.isDropship,
    );

  const serviceProducts =
    profiles.filter(
      (profile) =>
        profile.inventory.isService,
    );

  const doNotRestockProducts =
    profiles.filter(
      (profile) =>
        profile.inventory
          .isDoNotRestock,
    );

  const discontinuedProducts =
    profiles.filter(
      (profile) =>
        profile.inventory
          .isDiscontinued,
    );

  const unitsOnHand =
    monitoredProducts.reduce(
      (total, profile) =>
        total +
        profile.inventory.stockOnHand,
      0,
    );

  const committedUnits =
    monitoredProducts.reduce(
      (total, profile) =>
        total +
        profile.inventory.committedStock,
      0,
    );

  const incomingUnits =
    monitoredProducts.reduce(
      (total, profile) =>
        total +
        profile.inventory.incomingStock,
      0,
    );

  const productsRequiringAttention =
    lowStockProducts.length +
    outOfStockProducts.length +
    negativeStockProducts.length;

  return {
    generatedAt:
      new Date().toISOString(),

    latestSyncAt:
      getLatestSync(inventoryRows),

    totalProducts:
      profiles.length,

    monitoredProducts:
      monitoredProducts.length,

    excludedProducts:
      profiles.length -
      monitoredProducts.length,

    healthyProducts:
      healthyProducts.length,

    lowStockProducts:
      lowStockProducts.length,

    outOfStockProducts:
      outOfStockProducts.length,

    negativeStockProducts:
      negativeStockProducts.length,

    dropshipProducts:
      dropshipProducts.length,

    serviceProducts:
      serviceProducts.length,

    doNotRestockProducts:
      doNotRestockProducts.length,

    discontinuedProducts:
      discontinuedProducts.length,

    unitsOnHand,
    committedUnits,
    incomingUnits,

    healthScore:
      calculateHealthScore({
        healthy:
          healthyProducts.length,

        low:
          lowStockProducts.length,

        monitored:
          monitoredProducts.length,
      }),

    productsRequiringAttention,
  };
}
