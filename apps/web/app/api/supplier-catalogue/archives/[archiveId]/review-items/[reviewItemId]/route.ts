import { NextResponse } from "next/server";
import { requireOperatorRole } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export async function PATCH(request: Request, { params }: { params: Promise<{ archiveId: string; reviewItemId: string }> }) {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const { archiveId, reviewItemId } = await params;
    const body = await request.json();
    if (!["matched", "skipped", "create_product"].includes(body.status)) throw new Error("Invalid review decision.");
    await SupplierCatalogueArchiveRepository.decide({ archiveId, reviewItemId, operatorId: operator.id, status: body.status, linkedProductId: body.linkedProductId ?? null, metadata: body.metadata });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Review decision could not be saved." }, { status: 400 });
  }
}
