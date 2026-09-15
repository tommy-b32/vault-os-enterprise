import { NextResponse } from "next/server";

import { authorizeApiRequest } from "@/lib/auth/api";
import { analyseProductVision } from "@/lib/ai/analyseProductVision";
import type {
  ProductVisionInput,
} from "@/lib/brain/ProductVisionEngine";

export async function POST(request: Request) {
  const denied = await authorizeApiRequest([
    "owner",
    "operator",
  ]);

  if (denied) {
    return denied;
  }

  try {
    const body = await request.json() as Partial<ProductVisionInput>;
    const analysis = await analyseProductVision({
      productId:
        typeof body.productId === "string"
          ? body.productId
          : "",
      productName:
        typeof body.productName === "string"
          ? body.productName
          : "",
      imageUrl:
        typeof body.imageUrl === "string"
          ? body.imageUrl
          : "",
    });

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Product Vision analysis failed.";
    const isInputError = message.startsWith("A ");

    return NextResponse.json(
      {
        error: isInputError
          ? message
          : "Product Vision analysis failed.",
      },
      { status: isInputError ? 400 : 500 },
    );
  }
}
