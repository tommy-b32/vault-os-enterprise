import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CatalogueReviewQueueDetails, CatalogueReviewQueueItem } from "@/lib/supplier/CatalogueReviewQueueEngine";
import type { CatalogueAnalysisSession } from "@/lib/supplier/catalogue-analysis-types";
import type { SupplierDocumentPage } from "@/lib/supplier/types";

const TEMPORARY_SOURCE_BUCKET = "supplier-catalogue-temporary";
const STORED_OBJECT_PREFIX = "vault-object://";

function embeddedImage(value: string): { mimeType: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  return { mimeType: match[1], bytes: Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0)) };
}

async function storeEmbeddedImages(value: unknown, archiveId: string): Promise<unknown> {
  if (typeof value === "string") {
    const image = embeddedImage(value);
    if (!image) return value;
    const digestInput = new Uint8Array(image.bytes.byteLength);
    digestInput.set(image.bytes);
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", digestInput)))
      .map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1];
    const objectPath = `${archiveId}/${digest}.${extension}`;
    const { error } = await supabaseAdmin.storage.from(TEMPORARY_SOURCE_BUCKET)
      .upload(objectPath, image.bytes, { contentType: image.mimeType, upsert: true });
    if (error) throw new Error("Catalogue source image could not be stored safely.");
    return `${STORED_OBJECT_PREFIX}${objectPath}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map((entry) => storeEmbeddedImages(entry, archiveId)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) =>
      [key, await storeEmbeddedImages(entry, archiveId)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

async function restoreStoredImages(value: unknown): Promise<unknown> {
  if (typeof value === "string" && value.startsWith(STORED_OBJECT_PREFIX)) {
    const objectPath = value.slice(STORED_OBJECT_PREFIX.length);
    const { data, error } = await supabaseAdmin.storage.from(TEMPORARY_SOURCE_BUCKET)
      .createSignedUrl(objectPath, 10 * 60);
    if (error || !data?.signedUrl) throw new Error("Catalogue source image is unavailable.");
    return data.signedUrl;
  }
  if (Array.isArray(value)) return Promise.all(value.map(restoreStoredImages));
  if (value && typeof value === "object") {
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) =>
      [key, await restoreStoredImages(entry)] as const));
    return Object.fromEntries(entries);
  }
  return value;
}

async function purgeTemporarySourceObjects(archiveId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.storage.from(TEMPORARY_SOURCE_BUCKET)
    .list(archiveId, { limit: 1000 });
  if (error) throw new Error("Completed catalogue source objects could not be listed for expiry.");
  const paths = (data ?? []).filter((entry) => entry.id).map((entry) => `${archiveId}/${entry.name}`);
  if (paths.length > 0) {
    const { error: removeError } = await supabaseAdmin.storage.from(TEMPORARY_SOURCE_BUCKET).remove(paths);
    if (removeError) throw new Error("Completed catalogue source objects could not be expired.");
  }
  const { error: clearError } = await supabaseAdmin.from("vault_supplier_catalogue_pages")
    .update({ source_objects: [] }).eq("archive_id", archiveId);
  if (clearError) throw new Error("Completed catalogue source references could not be cleared.");
}

export type SupplierCatalogueArchiveStatus = "uploading" | "processing" | "ready_for_review" | "in_review" | "completed" | "superseded" | "failed";
export type SupplierCatalogueArchive = {
  id: string; supplierId: string; supplierName: string; originalFilename: string; displayName: string;
  status: SupplierCatalogueArchiveStatus; isActive: boolean; pageCount: number; detectedProductCount: number;
  matchedProductCount: number; unmatchedProductCount: number; catalogueType: "products" | "footwear" | "accessories";
  leadTimeDays: number | null; sourceDocumentId: string; createdAt: string; updatedAt: string;
};

type ArchiveRow = {
  id: string; supplier_id: string; original_filename: string; display_name: string; status: SupplierCatalogueArchiveStatus;
  is_active: boolean;
  page_count: number; detected_product_count: number; matched_product_count: number; unmatched_product_count: number;
  catalogue_type: "products" | "footwear" | "accessories"; lead_time_days: number | null; source_metadata: { document_id?: string } | null;
  created_at: string; updated_at: string; supplier: { supplier_name: string } | Array<{ supplier_name: string }> | null;
};

function mapArchive(row: ArchiveRow): SupplierCatalogueArchive {
  const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
  return { id: row.id, supplierId: row.supplier_id, supplierName: supplier?.supplier_name ?? "Unknown supplier", originalFilename: row.original_filename, displayName: row.display_name, status: row.status, isActive: row.is_active, pageCount: row.page_count, detectedProductCount: row.detected_product_count, matchedProductCount: row.matched_product_count, unmatchedProductCount: row.unmatched_product_count, catalogueType: row.catalogue_type, leadTimeDays: row.lead_time_days, sourceDocumentId: row.source_metadata?.document_id ?? row.id, createdAt: row.created_at, updatedAt: row.updated_at };
}

const ARCHIVE_SELECT = `id, supplier_id, original_filename, display_name, status, is_active, page_count, detected_product_count, matched_product_count, unmatched_product_count, catalogue_type, lead_time_days, source_metadata, created_at, updated_at, supplier:vault_suppliers(supplier_name)`;

export type SupplierCataloguePageState = {
  pageNumber: number;
  status: CatalogueAnalysisSession["pages"][number]["status"];
  error: string | null;
  analysedAt: string | null;
  hasSourceEvidence: boolean;
};

export type SupplierCatalogueArchiveWithProgress = SupplierCatalogueArchive & {
  analysis: { total: number; analysed: number; failed: number; pending: number; pendingReviewItems: number; catalogueComplete: boolean };
};

export const SupplierCatalogueArchiveRepository = {
  async create(input: { operatorId: string; idempotencyKey: string; originalFilename: string; details: CatalogueReviewQueueDetails; pageCount: number; sourceDocumentId: string; }) {
    const { data: supplier, error: supplierError } = await supabaseAdmin.from("vault_suppliers").select("id").ilike("supplier_name", input.details.supplierName).eq("is_active", true).maybeSingle();
    if (supplierError || !supplier) throw new Error("Choose a canonical active supplier before archiving this catalogue.");
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").upsert({
      supplier_id: supplier.id, original_filename: input.originalFilename, display_name: input.details.collectionName,
      catalogue_type: input.details.catalogueType, lead_time_days: input.details.leadTimeDays,
      created_by_operator_id: input.operatorId, idempotency_key: input.idempotencyKey, status: "processing",
      page_count: input.pageCount, source_metadata: { document_id: input.sourceDocumentId }, failure_reason: null,
    }, { onConflict: "created_by_operator_id,idempotency_key" }).select("id").single();
    if (error || !data) throw new Error("The supplier catalogue archive could not be created.");
    return data.id as string;
  },

  async saveSourcePages(input: { archiveId: string; pages: SupplierDocumentPage[] }) {
    if (input.pages.length === 0 || input.pages.length > 3) throw new Error("Catalogue source pages must be saved in batches of one to three pages.");
    const storedPages = await Promise.all(input.pages.map((page) => storeEmbeddedImages(page, input.archiveId)));
    const pageRows = input.pages.map((page, index) => ({
      archive_id: input.archiveId,
      page_number: page.pageNumber,
      analysis_state: "pending",
      parsed_evidence: {
        pageNumber: page.pageNumber,
        status: "pending",
        extraction: null,
        error: null,
        attempts: 0,
        analysedAt: null,
      },
      source_objects: storedPages[index],
      error_message: null,
      analysed_at: null,
    }));
    if (pageRows.length > 0) {
      const { error: pageError } = await supabaseAdmin
        .from("vault_supplier_catalogue_pages")
        .upsert(pageRows, { onConflict: "archive_id,page_number", ignoreDuplicates: true });
      if (pageError) throw new Error("Catalogue source pages could not be archived.");
    }
  },

  async saveReviewItems(input: { archiveId: string; items: CatalogueReviewQueueItem[] }) {
    if (input.items.length > 5) throw new Error("Catalogue review items must be saved in batches of at most five.");
    const storedItems = await Promise.all(input.items.map((item) => storeEmbeddedImages(item, input.archiveId)));
    const items = input.items.map((item, index) => ({
      archive_id: input.archiveId, review_item_id: item.card.id, source_page_number: item.card.pageNumber,
      supplier_product_evidence: (storedItems[index] as CatalogueReviewQueueItem).card,
      proposed_match: (storedItems[index] as CatalogueReviewQueueItem).match,
      review_payload: storedItems[index],
      review_status: "pending", linked_product_id: null, decided_at: null, decided_by_operator_id: null, decision_metadata: {},
    }));
    if (items.length > 0) {
      const { error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").upsert(items, { onConflict: "archive_id,review_item_id", ignoreDuplicates: true });
      if (error) throw new Error("Catalogue review items could not be archived.");
    }
  },

  async saveAnalysis(input: { archiveId: string; session: CatalogueAnalysisSession; items: CatalogueReviewQueueItem[]; }) {
    const incomingPages = Object.values(input.session.pages);
    const pageNumbers = incomingPages.map((page) => page.pageNumber);
    const { data: existingPages, error: existingError } = pageNumbers.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
          .from("vault_supplier_catalogue_pages")
          .select("page_number, analysis_state")
          .eq("archive_id", input.archiveId)
          .in("page_number", pageNumbers);
    if (existingError) throw new Error("Existing catalogue page state could not be loaded.");
    const existingByPage = new Map((existingPages ?? []).map((page) => [page.page_number, page]));
    const terminalStates = new Set(["complete", "skipped"]);
    const pages = incomingPages.map((page) => {
      const existing = existingByPage.get(page.pageNumber);
      const preserveTerminal = existing && terminalStates.has(existing.analysis_state) && !terminalStates.has(page.status);
      return preserveTerminal
        ? null
        : {
            archive_id: input.archiveId,
            page_number: page.pageNumber,
            analysis_state: page.status,
            parsed_evidence: page,
            error_message: page.error,
            analysed_at: page.analysedAt,
          };
    }).filter((page) => page !== null);
    if (pages.length > 0) {
      const { error } = await supabaseAdmin.from("vault_supplier_catalogue_pages").upsert(pages, { onConflict: "archive_id,page_number" });
      if (error) throw new Error("Catalogue page evidence could not be archived.");
    }
    await this.saveReviewItems({ archiveId: input.archiveId, items: input.items });
    const { error: readyError } = await supabaseAdmin.from("vault_supplier_catalogue_archives").update({ status: "ready_for_review", failure_reason: null }).eq("id", input.archiveId).in("status", ["processing", "ready_for_review", "failed"]);
    if (readyError) throw new Error("Catalogue archive readiness could not be saved.");
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_supplier_catalogue_archive", { target_archive_id: input.archiveId });
    if (refreshError) throw new Error("Catalogue archive counts could not be refreshed.");
  },

  async getPageSummary(archiveId: string) {
    const [{ data: pages, error: pageError }, { data: resumablePage, error: resumableError }, { count: reviewItemCount, error: reviewError }, { count: pendingReviewItemCount, error: pendingReviewError }, { data: archive, error: archiveError }] = await Promise.all([
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("analysis_state", { count: "exact" }).eq("archive_id", archiveId),
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("source_objects").eq("archive_id", archiveId).in("analysis_state", ["pending", "failed"]).limit(1).maybeSingle(),
      supabaseAdmin.from("vault_supplier_catalogue_review_items").select("id", { count: "exact", head: true }).eq("archive_id", archiveId),
      supabaseAdmin.from("vault_supplier_catalogue_review_items").select("id", { count: "exact", head: true }).eq("archive_id", archiveId).eq("review_status", "pending"),
      supabaseAdmin.from("vault_supplier_catalogue_archives").select("page_count").eq("id", archiveId).maybeSingle(),
    ]);
    if (pageError || resumableError || reviewError || pendingReviewError || archiveError) throw new Error("Catalogue analysis summary could not be loaded.");
    const states = (pages ?? []).map((page) => page.analysis_state);
    const expectedTotal = archive?.page_count ?? states.length;
    const missingPages = Math.max(0, expectedTotal - states.length);
    const sourcePage = resumablePage?.source_objects;
    const resumable = sourcePage && Array.isArray(sourcePage.images) && sourcePage.images.some((image: { dataUrl?: unknown }) => typeof image.dataUrl === "string" && image.dataUrl.startsWith(STORED_OBJECT_PREFIX)) ? 1 : 0;
    return {
      total: expectedTotal,
      persistedPages: states.length,
      pending: states.filter((state) => state === "pending" || state === "analysing").length + missingPages,
      analysed: states.filter((state) => state === "complete" || state === "skipped").length,
      failed: states.filter((state) => state === "failed").length,
      reviewItems: reviewItemCount ?? 0,
      pendingReviewItems: pendingReviewItemCount ?? 0,
      resumable,
      catalogueComplete: states.length === expectedTotal && states.length > 0 && states.every((state) => state === "complete" || state === "skipped"),
    };
  },

  async getPageStates(archiveId: string): Promise<SupplierCataloguePageState[]> {
    const [{ data, error }, { data: sourcePages, error: sourceError }] = await Promise.all([
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("page_number, analysis_state, error_message, analysed_at").eq("archive_id", archiveId).order("page_number", { ascending: true }),
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("page_number").eq("archive_id", archiveId).neq("source_objects", []),
    ]);
    if (error || sourceError) throw new Error("Catalogue page states could not be loaded.");
    const sourcePageNumbers = new Set((sourcePages ?? []).map((page) => page.page_number));
    return (data ?? []).map((page) => ({ pageNumber: page.page_number, status: page.analysis_state, error: page.error_message, analysedAt: page.analysed_at, hasSourceEvidence: sourcePageNumbers.has(page.page_number) }));
  },

  async getSourcePages(archiveId: string, pageNumbers: number[]): Promise<SupplierDocumentPage[]> {
    const uniquePageNumbers = Array.from(new Set(pageNumbers.filter(Number.isInteger)));
    if (uniquePageNumbers.length === 0 || uniquePageNumbers.length > 3) throw new Error("Load between one and three catalogue source pages at a time.");
    const { data, error } = await supabaseAdmin
      .from("vault_supplier_catalogue_pages")
      .select("page_number, source_objects")
      .eq("archive_id", archiveId)
      .in("page_number", uniquePageNumbers)
      .order("page_number", { ascending: true });
    if (error) throw new Error("Catalogue source page evidence could not be loaded.");
    return (await Promise.all((data ?? [])
      .map((page) => restoreStoredImages(page.source_objects) as Promise<SupplierDocumentPage>)))
      .filter((page) => page && Array.isArray(page.images) && page.images.some((image) =>
        typeof image.dataUrl === "string" && (image.dataUrl.startsWith("data:image/") || image.dataUrl.startsWith("https://")),
      ));
  },

  async markFailed(archiveId: string, reason: string) {
    const { error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", archiveId);
    if (error) throw new Error("Catalogue failure state could not be recorded.");
  },

  async list(): Promise<SupplierCatalogueArchive[]> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").select(ARCHIVE_SELECT)
      .or("and(status.eq.completed,is_active.eq.true),status.in.(uploading,processing,ready_for_review,in_review)")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Supplier catalogue archives could not be loaded.");
    return ((data ?? []) as ArchiveRow[]).map(mapArchive);
  },

  async listWithProgress(): Promise<SupplierCatalogueArchiveWithProgress[]> {
    const [archives, { data: pages, error: pageError }, { data: reviewItems, error: reviewError }] = await Promise.all([
      this.list(),
      supabaseAdmin.from("vault_supplier_catalogue_pages").select("archive_id, analysis_state"),
      supabaseAdmin.from("vault_supplier_catalogue_review_items").select("archive_id, review_status"),
    ]);
    if (pageError || reviewError) throw new Error("Supplier catalogue progress could not be loaded.");
    return archives.map((archive) => {
      const archivePages = (pages ?? []).filter((page) => page.archive_id === archive.id);
      const states = archivePages.map((page) => page.analysis_state);
      const analysed = states.filter((state) => state === "complete" || state === "skipped").length;
      const failed = states.filter((state) => state === "failed").length;
      const pendingReviewItems = (reviewItems ?? []).filter((item) => item.archive_id === archive.id && item.review_status === "pending").length;
      return { ...archive, analysis: { total: archive.pageCount, analysed, failed, pending: archive.pageCount - analysed - failed, pendingReviewItems, catalogueComplete: states.length === archive.pageCount && archive.pageCount > 0 && analysed === archive.pageCount } };
    });
  },

  async get(archiveId: string): Promise<SupplierCatalogueArchive | null> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_archives").select(ARCHIVE_SELECT).eq("id", archiveId).maybeSingle();
    if (error) throw new Error("Supplier catalogue archive could not be loaded.");
    return data ? mapArchive(data as ArchiveRow) : null;
  },

  async getPendingReviewItems(archiveId: string): Promise<CatalogueReviewQueueItem[]> {
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").select("review_payload").eq("archive_id", archiveId).eq("review_status", "pending").order("source_page_number", { ascending: true }).order("review_item_id", { ascending: true });
    if (error) throw new Error("Catalogue review queue could not be loaded.");
    return Promise.all((data ?? []).map((row) => restoreStoredImages(row.review_payload) as Promise<CatalogueReviewQueueItem>));
  },

  async getReviewItemCount(archiveId: string): Promise<number> {
    const { count, error } = await supabaseAdmin
      .from("vault_supplier_catalogue_review_items")
      .select("id", { count: "exact", head: true })
      .eq("archive_id", archiveId);
    if (error) throw new Error("Catalogue review readiness could not be loaded.");
    return count ?? 0;
  },

  async decide(input: { archiveId: string; reviewItemId: string; operatorId: string; status: "matched" | "skipped" | "create_product"; linkedProductId: string | null; metadata?: Record<string, unknown>; }) {
    if (input.status === "matched" && !input.linkedProductId) throw new Error("A matched review decision requires a canonical product.");
    const { data, error } = await supabaseAdmin.from("vault_supplier_catalogue_review_items").update({ review_status: input.status, linked_product_id: input.linkedProductId, decided_at: new Date().toISOString(), decided_by_operator_id: input.operatorId, decision_metadata: input.metadata ?? {} }).eq("archive_id", input.archiveId).eq("review_item_id", input.reviewItemId).eq("review_status", "pending").select("id").maybeSingle();
    if (error) throw new Error("The catalogue review decision could not be saved.");
    if (!data) throw new Error("This catalogue item was already resolved or does not belong to this archive.");
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_supplier_catalogue_archive", { target_archive_id: input.archiveId });
    if (refreshError) throw new Error("The review decision was saved but archive counts could not be refreshed.");
    const { data: completed } = await supabaseAdmin.from("vault_supplier_catalogue_archives")
      .select("id").eq("id", input.archiveId).eq("status", "completed").maybeSingle();
    if (completed) {
      try {
        await purgeTemporarySourceObjects(input.archiveId);
      } catch (error) {
        console.warn("Completed catalogue temporary-source cleanup is pending.", {
          archiveId: input.archiveId,
          reason: error instanceof Error ? error.message : "Unknown cleanup error",
        });
      }
    }
  },
} as const;
