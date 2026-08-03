import {
  createHash,
} from "node:crypto";

import {
  NextResponse,
} from "next/server";

import {
  analyseProductVision,
} from "@/lib/ai/analyseProductVision";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";
import { authorizeApiRequest } from "@/lib/auth/api";

type StyleCatalogueRow =
  Record<string, unknown>;

type VisionIndexRequest = {
  limit?: unknown;
  force?: unknown;
};

type NormalisedStyleProduct = {
  productId: string;
  productName: string;
  imageUrl: string;
};

type ExistingVisionRow = {
  product_id: string;
  image_hash: string | null;
  analysed_at: string | null;
  vision_version: number | null;
};

const DEFAULT_BATCH_LIMIT = 15;
const MAX_BATCH_LIMIT = 30;
const ANALYSIS_CONCURRENCY = 3;
const CURRENT_PRODUCT_VISION_VERSION = 2;

function readString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function firstString(
  row: StyleCatalogueRow,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value =
      readString(
        row[key],
      );

    if (value) {
      return value;
    }
  }

  return null;
}

function isValidImageUrl(
  value: string,
): boolean {
  return (
    value.startsWith("https://") ||
    value.startsWith("http://") ||
    value.startsWith("data:image/")
  );
}

function createImageHash(
  imageUrl: string,
): string {
  return createHash("sha256")
    .update(imageUrl)
    .digest("hex");
}

function readBatchLimit(
  value: unknown,
): number {
  const numericValue =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(
      numericValue,
    )
  ) {
    return DEFAULT_BATCH_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_BATCH_LIMIT,
      Math.floor(
        numericValue,
      ),
    ),
  );
}

function readBoolean(
  value: unknown,
): boolean {
  return (
    value === true ||
    value === "true" ||
    value === 1 ||
    value === "1"
  );
}

function normaliseStyleProduct(
  row: StyleCatalogueRow,
): NormalisedStyleProduct | null {
  const productId =
    firstString(
      row,
      [
        "style_id",
        "catalogue_style_id",
        "product_style_id",
        "variant_group_id",
        "product_id",
        "shopify_product_id",
        "id",
      ],
    );

  const productName =
    firstString(
      row,
      [
        "style_name",
        "catalogue_name",
        "product_name",
        "display_name",
        "title",
        "name",
      ],
    );

  const imageUrl =
    firstString(
      row,
      [
        "style_image_url",
        "featured_image_url",
        "product_image_url",
        "image_url",
        "featured_image",
        "image_src",
        "image",
      ],
    );

  if (
    !productId ||
    !productName ||
    !imageUrl ||
    !isValidImageUrl(
      imageUrl,
    )
  ) {
    return null;
  }

  return {
    productId,
    productName,
    imageUrl,
  };
}

async function loadStyleCatalogue(): Promise<
  NormalisedStyleProduct[]
> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "vault_style_catalogue_intelligence",
    )
    .select("*");

  if (error) {
    throw new Error(
      `Unable to load the style catalogue: ${error.message}`,
    );
  }

  const rows =
    (data ?? []) as
      StyleCatalogueRow[];

  const products =
    rows
      .map(
        normaliseStyleProduct,
      )
      .filter(
        (
          product,
        ): product is NormalisedStyleProduct =>
          product !== null,
      );

  const uniqueProducts =
    new Map<
      string,
      NormalisedStyleProduct
    >();

  for (
    const product of products
  ) {
    if (
      !uniqueProducts.has(
        product.productId,
      )
    ) {
      uniqueProducts.set(
        product.productId,
        product,
      );
    }
  }

  return [
    ...uniqueProducts.values(),
  ];
}

async function loadExistingVision(): Promise<
  Map<string, ExistingVisionRow>
> {
  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "vault_product_vision",
    )
    .select(`
      product_id,
      image_hash,
      analysed_at,
      vision_version
    `);

  if (error) {
    throw new Error(
      `Unable to load Product Vision records: ${error.message}`,
    );
  }

  const existing =
    new Map<
      string,
      ExistingVisionRow
    >();

  for (
    const row of
      (data ?? []) as
        ExistingVisionRow[]
  ) {
    existing.set(
      row.product_id,
      row,
    );
  }

  return existing;
}

function needsAnalysis({
  product,
  existing,
  force,
}: {
  product: NormalisedStyleProduct;
  existing: ExistingVisionRow | undefined;
  force: boolean;
}): boolean {
  if (force) {
    return true;
  }

  if (!existing) {
    return true;
  }

  if (!existing.analysed_at) {
    return true;
  }

  if (
    existing.image_hash !==
    createImageHash(product.imageUrl)
  ) {
    return true;
  }

  return (
    (existing.vision_version ?? 1) <
    CURRENT_PRODUCT_VISION_VERSION
  );
}

export async function GET() {
  const denied = await authorizeApiRequest();
  if (denied) return denied;
  try {
    const [
      catalogue,
      existingVision,
    ] = await Promise.all([
      loadStyleCatalogue(),
      loadExistingVision(),
    ]);

    const pending =
      catalogue.filter(
        (product) =>
          needsAnalysis({
            product,
            existing:
              existingVision.get(
                product.productId,
              ),
            force: false,
          }),
      );

    return NextResponse.json({
      totalCatalogueProducts:
        catalogue.length,

      analysedProducts:
        catalogue.length -
        pending.length,

      pendingProducts:
        pending.length,

      nextProducts:
        pending
          .slice(
            0,
            DEFAULT_BATCH_LIMIT,
          )
          .map(
            (product) => ({
              productId:
                product.productId,

              productName:
                product.productName,

              imageUrl:
                product.imageUrl,
            }),
          ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to read Product Vision index status.";

    console.error(
      "Product Vision index status failed:",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  const denied = await authorizeApiRequest(["owner", "operator"]);
  if (denied) return denied;
  try {
    let body:
      VisionIndexRequest =
        {};

    try {
      body =
        (await request.json()) as
          VisionIndexRequest;
    } catch {
      body = {};
    }

    const limit =
      readBatchLimit(
        body.limit,
      );

    const force =
      readBoolean(
        body.force,
      );

    const [
      catalogue,
      existingVision,
    ] = await Promise.all([
      loadStyleCatalogue(),
      loadExistingVision(),
    ]);

    const pendingBeforeRun =
      catalogue.filter(
        (product) =>
          needsAnalysis({
            product,
            existing:
              existingVision.get(
                product.productId,
              ),
            force,
          }),
      );

    const batch =
      pendingBeforeRun.slice(
        0,
        limit,
      );

    const completed: Array<{
      productId: string;
      productName: string;
      model: string;
      analysedAt: string;
    }> = [];

    const failed: Array<{
      productId: string;
      productName: string;
      error: string;
    }> = [];

    for (
      let batchStart = 0;
      batchStart < batch.length;
      batchStart += ANALYSIS_CONCURRENCY
    ) {
      const workerBatch =
        batch.slice(
          batchStart,
          batchStart +
            ANALYSIS_CONCURRENCY,
        );

      const workerResults =
        await Promise.all(
          workerBatch.map(
            async (product) => {
              try {
                const analysis =
                  await analyseProductVision(
                    product,
                  );

                const analysedAt =
                  new Date().toISOString();

                const imageHash =
                  createImageHash(
                    product.imageUrl,
                  );

                const {
                  error: saveError,
                } = await supabaseAdmin
                  .from(
                    "vault_product_vision",
                  )
                  .upsert(
                    {
                      product_id:
                        product.productId,

                      vision_json:
                        analysis.vision,

                      image_url:
                        product.imageUrl,

                      image_hash:
                        imageHash,

                      vision_version:
                        CURRENT_PRODUCT_VISION_VERSION,

                      model:
                        analysis.model,

                      analysed_at:
                        analysedAt,

                      updated_at:
                        analysedAt,
                    },
                    {
                      onConflict:
                        "product_id",
                    },
                  );

                if (saveError) {
                  throw new Error(
                    saveError.message,
                  );
                }

                return {
                  success: true as const,

                  productId:
                    product.productId,

                  productName:
                    product.productName,

                  model:
                    analysis.model,

                  analysedAt,
                };
              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : "Unknown analysis error.";

                console.error(
                  `Product Vision failed for ${product.productId}:`,
                  error,
                );

                return {
                  success: false as const,

                  productId:
                    product.productId,

                  productName:
                    product.productName,

                  error:
                    message,
                };
              }
            },
          ),
        );

      for (
        const result of workerResults
      ) {
        if (result.success) {
          completed.push({
            productId:
              result.productId,

            productName:
              result.productName,

            model:
              result.model,

            analysedAt:
              result.analysedAt,
          });
        } else {
          failed.push({
            productId:
              result.productId,

            productName:
              result.productName,

            error:
              result.error,
          });
        }
      }
    }

    const remainingProducts =
      Math.max(
        0,
        pendingBeforeRun.length -
        completed.length,
      );

    return NextResponse.json({
      success:
        failed.length === 0,

      force,

      batchLimit:
        limit,

      totalCatalogueProducts:
        catalogue.length,

      pendingBeforeRun:
        pendingBeforeRun.length,

      attempted:
        batch.length,

      completedCount:
        completed.length,

      failedCount:
        failed.length,

      remainingProducts,

      complete:
        remainingProducts === 0,

      completed,

      failed,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to run the Product Vision indexer.";

    console.error(
      "Product Vision indexing failed:",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
