import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import {
  parseProductVision,
} from "@/lib/vision/parseProductVision";

import type {
  ProductVision,
} from "@/types/product-vision";

type ProductVisionDatabaseRow = {
  product_id: string;

  vision_json: unknown;

  image_url: string | null;
  image_hash: string | null;

  model: string | null;

  analysed_at: string | null;

  vision_version: number | null;
};

const PRODUCT_VISION_SELECT = `
  product_id,
  vision_json,
  image_url,
  image_hash,
  model,
  analysed_at,
  vision_version
`;

function parseRow(
  row: ProductVisionDatabaseRow,
): ProductVision {
  return parseProductVision({
    productId: row.product_id,

    visionJson: row.vision_json,

    analysedAt: row.analysed_at,
    imageUrl: row.image_url,
    imageHash: row.image_hash,
    model: row.model,
    visionVersion: row.vision_version,
  });
}

async function getAll():
  Promise<ProductVision[]> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("vault_product_vision")
    .select(PRODUCT_VISION_SELECT);

  if (error) {
    throw new Error(
      `Unable to load Product Vision: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as ProductVisionDatabaseRow[];

  return rows.map(parseRow);
}

async function getMapByProductId():
  Promise<Map<string, ProductVision>> {
  const visions = await getAll();

  return new Map(
    visions.map(
      (vision) => [
        vision.product_id,
        vision,
      ],
    ),
  );
}

async function getByProductId(
  productId: string,
): Promise<ProductVision | null> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("vault_product_vision")
    .select(PRODUCT_VISION_SELECT)
    .eq(
      "product_id",
      productId,
    )
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load Product Vision for ${productId}: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return parseRow(
    data as ProductVisionDatabaseRow,
  );
}

export const ProductVisionRepository = {
  getAll,
  getMapByProductId,
  getByProductId,
};