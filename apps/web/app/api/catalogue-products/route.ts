import {
  NextResponse,
} from "next/server";

import {
  getCatalogueProducts,
} from "@/lib/catalogue";

export const dynamic =
  "force-dynamic";

export async function GET() {
  try {
    const products =
      await getCatalogueProducts();

    return NextResponse.json({
      products,
      total:
        products.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The Fabric Vault catalogue could not be loaded.";

    console.error(
      "Catalogue products API failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status: 500,
      },
    );
  }
}