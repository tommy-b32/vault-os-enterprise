import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CatalogueReviewQueueDetails, CatalogueReviewQueueItem } from "@/lib/supplier/CatalogueReviewQueueEngine";
import type { CatalogueAnalysisSession } from "@/lib/supplier/catalogue-analysis-types";
import type { SupplierDocumentPage } from "@/lib/supplier/types";

export type SupplierCatalogueArchiveStatus = "uploading" | "processing" | "ready_for_review" | "in_review" | "completed" | "failed";
export type SupplierCatalogueArchive = {
  id: string; supplierId: string; supplierName: string; originalFilename: string; displayName: string;
  status: SupplierCatalogueArchiveStatus; pageCount: number; detectedProductCount: number;
  matchedProductCount: number; unmatchedProductCount: number; createdAt: string; updatedAt: string;
};

type ArchiveRow = {
  id: string; supplier_id: string; original_filename: string; display_name: string; status: SupplierCatalogueArchiveStatus;
  page_count: number; detected_product_count: number; matched_product_count: number; unmatched_product_count: number;
  created_at: string; updated_at: string; supplier: { supplier_name: string } | Array<{ supplier_name: string }> | null;
};

function mapArchive(row: ArchiveRow): SupplierCatalogueArchive {
  const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
  return { id: row.id, supplierId: row.supplier_id, supplierName: supplier?.supplier_name ?? "Unknown supplier", originalFilename: row.original_filename, displayName: row.display_name, status: row.status, pageCount: row.page_count, detectedProductCount: row.detected_product_count, matchedProductCount: row.matched_product_count, unmatchedProductCount: row.unmatched_product_count, createdAt: row.created_at, updatedAt: row.updated_at };
}

const ARCHIVE_SELECT = `id, supplier_id, original_filename, display_name, status, page_count, detected_product_count, matched_product_count, unmatched_product_count, created_at, updated_at, supplier:vault_suppliers(supplier_name)`;

export const SupplierCatalogueArchiveRepository = {
  async create(input: { operatorId: string; idempotencyKey: string; originalFilename: string; details: CatalogueReviewQueueDetails; pageCount: number; sourceDocumentId: string; pages: SupplierDocumentPage[]; }) {
    const { data: supplier, error: supplierError } = await supabaseAdmin.from("vault_suppliers").select("id").ilike("supplier_name", input.details.supplierName).eq("is_active", true).maybeSingle();
    if (supplierError || !supplier) throw new Error("Choose a canonical active supplier before archiving this catalogue.");
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").upsert({
      supplier_id: supplier.id, original_filename: input.originalFilename, display_name: input.details.collectionName,
      catalogue_type: input.details.catalogueType, lead_time_days: input.details.leadTimeDays,
      created_by_operator_id: input.operatorId, idempotency_key: input.idempotencyKey, status: "processing",
      page_count: input.pageCount, source_metadata: { document_id: input.sourceDocumentId }, failure_reason: null,
    }, { onConflict: "created_by_operator_id,idempotency_key" }).select("id").single();
    if (error || !data) throw new Error("The supplier catalogue archive could not be created.");
    const pageRows = input.pages.map((page) => ({
      archive_id: data.id,
      page_number: page.pageNumber,
      analysis_state: "pending",
      parsed_evidence: {
        pageNumber: page.pageNumber,
        status: "pending",
        extraction: null,
        error: null,
        attempts: 0,
        analysedAt: null,
        sourcePage: page,
      },
      error_message: null,
      analysed_at: null,
    }));
    if (pageRows.length > 0) {
      const { error: pageError } = await supabaseAdmin
        .from("vault_supplier_catalogue_pages")
        .upsert(pageRows, { onConflict: "archive_id,page_number", ignoreDuplicates: true });
      if (pageError) throw new Error("Catalogue source pages could not be archived.");
    }
    return data.id as string;
  },

  async saveAnalysis(input: { archiveId: string; session: CatalogueAnalysisSession; items: CatalogueReviewQueueItem[]; }) {
    const { data: existingPages, error: existingError } = await supabaseAdmin
      .from("vault_supplier_catalogue_pages")
      .select("page_number, analysis_state, parsed_evidence")
      .eq("archive_id", input.archiveId);
    if (existingError) throw new Error("Existing catalogue page state could not be loaded.");
    const existingByPage = new Map((existingPages ?? []).map((page) => [page.page_number, page]));
    const terminalStates = new Set(["complete", "skipped"]);
    const pages = Object.values(input.session.pages).map((page) => {
      const existing = existingByPage.get(page.pageNumber);
      const preserveTerminal = existing && terminalStates.has(existing.analysis_state) && !terminalStates.has(page.status);
      const sourcePage = existing?.parsed_evidence?.sourcePage ?? null;
      return preserveTerminal
        ? null
        : {
            archive_id: input.archiveId,
            page_number: page.pageNumber,
            analysis_state: page.status,
            parsed_evidence: { ...page, sourcePage },
            error_message: page.error,
            analysed_at: page.analysedAt,
          };
    }).filter((page) => page !== null);
    if (pages.length > 0) {
      const { error } = await supabaseAdmin.from("vault_supplier_catalogue_pages").upsert(pages, { onConflict: "archive_id,page_number" });
      if (error) throw new Error("Catalogue page evidence could not be archived.");
    }
    const items = input.items.map((item) => ({
      archive_id: input.archiveId, review_item_id: item.card.id, source_page_number: item.card.pageNumber,
      supplier_product_evidence: item.card, proposed_match: item.match, review_payload: item,
      review_status: "pending", linked_product_id: null, decided_at: null, decided_by_operator_id: null, decision_metadata: {},
    }));
    if (items.length > 0) {
      const { error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").upsert(items, { onConflict: "archive_id,review_item_id", ignoreDuplicates: true });
      if (error) throw new Error("Catalogue review items could not be archived.");
    }
    const { error: readyError } = await supabaseAdmin.from("vault_supplier_catalogue_archives").update({ status: "ready_for_review", failure_reason: null }).eq("id", input.archiveId).in("status", ["processing", "ready_for_review", "failed"]);
    if (readyError) throw new Error("Catalogue archive readiness could not be saved.");
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_supplier_catalogue_archive", { target_archive_id: input.archiveId });
    if (refreshError) throw new Error("Catalogue archive counts could not be refreshed.");
  },

  async getPageSummary(archiveId: string) {
    const [{ data: pages, error: pageError }, { count: reviewItemCount, error: reviewError }] = await Promise.all([
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("analysis_state, parsed_evidence", { count: "exact" }).eq("archive_id", archiveId),
      supabaseAdmin.from("vault_supplier_catalogue_review_items").select("id", { count: "exact", head: true }).eq("archive_id", archiveId),
    ]);
    if (pageError || reviewError) throw new Error("Catalogue analysis summary could not be loaded.");
    const states = (pages ?? []).map((page) => page.analysis_state);
    const resumable = (pages ?? []).filter((page) => {
      if (!["pending", "failed"].includes(page.analysis_state)) return false;
      const sourcePage = page.parsed_evidence?.sourcePage;
      return sourcePage && Array.isArray(sourcePage.images) && sourcePage.images.some((image: { dataUrl?: unknown }) => typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:image/"));
    }).length;
    return {
      total: states.length,
      pending: states.filter((state) => state === "pending" || state === "analysing").length,
      analysed: states.filter((state) => state === "complete" || state === "skipped").length,
      failed: states.filter((state) => state === "failed").length,
      reviewItems: reviewItemCount ?? 0,
      resumable,
    };
  },

  async markFailed(archiveId: string, reason: string) {
    const { error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", archiveId);
    if (error) throw new Error("Catalogue failure state could not be recorded.");
  },

  async list(): Promise<SupplierCatalogueArchive[]> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").select(ARCHIVE_SELECT).order("created_at", { ascending: false });
    if (error) throw new Error("Supplier catalogue archives could not be loaded.");
    return ((data ?? []) as ArchiveRow[]).map(mapArchive);
  },

  async get(archiveId: string): Promise<SupplierCatalogueArchive | null> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").select(ARCHIVE_SELECT).eq("id", archiveId).maybeSingle();
    if (error) throw new Error("Supplier catalogue archive could not be loaded.");
    return data ? mapArchive(data as ArchiveRow) : null;
  },

  async getPendingReviewItems(archiveId: string): Promise<CatalogueReviewQueueItem[]> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").select("review_payload").eq("archive_id", archiveId).eq("review_status", "pending").order("source_page_number", { ascending: true }).order("review_item_id", { ascending: true });
    if (error) throw new Error("Catalogue review queue could not be loaded.");
    return (data ?? []).map((row) => row.review_payload as CatalogueReviewQueueItem);
  },

  async decide(input: { archiveId: string; reviewItemId: string; operatorId: string; status: "matched" | "skipped" | "create_product"; linkedProductId: string | null; metadata?: Record<string, unknown>; }) {
    if (input.status === "matched" && !input.linkedProductId) throw new Error("A matched review decision requires a canonical product.");
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").update({ review_status: input.status, linked_product_id: input.linkedProductId, decided_at: new Date().toISOString(), decided_by_operator_id: input.operatorId, decision_metadata: input.metadata ?? {} }).eq("archive_id", input.archiveId).eq("review_item_id", input.reviewItemId).eq("review_status", "pending").select("id").maybeSingle();
    if (error) throw new Error("The catalogue review decision could not be saved.");
    if (!data) throw new Error("This catalogue item was already resolved or does not belong to this archive.");
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_supplier_catalogue_archive", { target_archive_id: input.archiveId });
    if (refreshError) throw new Error("The review decision was saved but archive counts could not be refreshed.");
  },
} as const;
