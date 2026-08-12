import { NextResponse } from "next/server";

import { requireOperatorRole } from "@/lib/auth/operators";
import { SupplierCatalogueArchiveRepository } from "@/lib/supplier/SupplierCatalogueArchiveRepository";

export async function GET(request: Request, { params }: { params: Promise<{ archiveId: string }> }) {
  try {
    await requireOperatorRole("owner", "operator");
    const { archiveId } = await params;
    const pageNumbers = new URL(request.url).searchParams.getAll("page").map(Number);
    const pages = await SupplierCatalogueArchiveRepository.getSourcePages(archiveId, pageNumbers);
    return NextResponse.json({ pages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalogue source pages could not be loaded." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ archiveId: string }> }) {
  try {
    await requireOperatorRole("owner", "operator");
    const { archiveId } = await params;
    const body = await request.json();
    await SupplierCatalogueArchiveRepository.saveSourcePages({
      archiveId,
      pages: Array.isArray(body.pages) ? body.pages : [],
    });
    return NextResponse.json({ saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Catalogue source pages could not be saved." }, { status: 400 });
  }
}
