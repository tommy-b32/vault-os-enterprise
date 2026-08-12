import { NextResponse } from "next/server";
import { requireOperatorRole } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export async function PUT(request: Request, { params }: { params: Promise<{ archiveId: string }> }) {
  try {
    await requireOperatorRole("owner", "operator");
    const { archiveId } = await params;
    const body = await request.json();
    if (body.failed === true) await SupplierCatalogueArchiveRepository.markFailed(archiveId, body.reason ?? "Catalogue processing failed.");
    else if (Array.isArray(body.items)) await SupplierCatalogueArchiveRepository.saveReviewItems({ archiveId, items: body.items });
    else await SupplierCatalogueArchiveRepository.saveAnalysis({ archiveId, session: body.session, items: [] });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalogue archive could not be updated." }, { status: 400 });
  }
}
