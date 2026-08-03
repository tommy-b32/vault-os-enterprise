import {
  NextResponse,
} from "next/server";

import {
  extractCataloguePage,
} from "@/lib/ai/extractCataloguePage";
import { authorizeApiRequest } from "@/lib/auth/api";

type ExtractPageRequest = {
  pageNumber?: unknown;
  imageDataUrl?: unknown;
};

export async function POST(
  request: Request,
) {
  const denied = await authorizeApiRequest(["owner", "operator"]);
  if (denied) return denied;
  try {
    const body =
      (await request.json()) as ExtractPageRequest;

    const pageNumber =
      typeof body.pageNumber === "number"
        ? body.pageNumber
        : Number(body.pageNumber);

    const imageDataUrl =
      typeof body.imageDataUrl === "string"
        ? body.imageDataUrl
        : "";

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1
    ) {
      return NextResponse.json(
        {
          error:
            "A valid page number is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !imageDataUrl.startsWith(
        "data:image/",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "A valid page image is required.",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * Keep the first milestone intentionally small.
     * A large data URL could otherwise exceed practical
     * request and model limits.
     */
    const maximumImageLength =
      12_000_000;

    if (
      imageDataUrl.length >
      maximumImageLength
    ) {
      return NextResponse.json(
        {
          error:
            "The rendered page image is too large to analyse. Reduce the PDF page rendering scale and try again.",
        },
        {
          status: 413,
        },
      );
    }

    const extraction =
      await extractCataloguePage({
        pageNumber,
        imageDataUrl,
      });

    return NextResponse.json({
      extraction,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "An unknown catalogue extraction error occurred.";

    console.error(
      "Supplier catalogue page extraction failed:",
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
