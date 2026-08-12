import { NextResponse } from "next/server";
import { requireOperatorRole } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export async function POST(request: Request) {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const body = await request.json();
    const archiveId = await SupplierCatalogueArchiveRepository.create({ operatorId: operator.id, idempotencyKey: body.idempotencyKey, originalFilename: body.originalFilename, details: body.details, pageCount: body.pageCount, sourceDocumentId: body.sourceDocumentId, pages: Array.isArray(body.pages) ? body.pages : [] });
    return NextResponse.json({ archiveId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalogue archive could not be created." }, { status: 400 });
  }
}
