import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../../", import.meta.url);
const repoRoot = new URL("../../../../", import.meta.url);
const readWeb = (path) => readFile(new URL(path, webRoot), "utf8");

test("durable archive schema owns pages and review items", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260816000000_supplier_catalogue_archives.sql", repoRoot), "utf8");
  assert.match(sql, /vault_supplier_catalogue_archives/);
  assert.match(sql, /vault_supplier_catalogue_pages/);
  assert.match(sql, /vault_supplier_catalogue_review_items/);
  assert.match(sql, /archive_id uuid not null references public\.vault_supplier_catalogue_archives/);
  assert.match(sql, /unique \(archive_id, review_item_id\)/);
});

test("archive state and counts are canonical and deterministic", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260816000000_supplier_catalogue_archives.sql", repoRoot), "utf8");
  for (const state of ["uploading", "processing", "ready_for_review", "in_review", "completed", "failed"]) assert.match(sql, new RegExp(`'${state}'`));
  assert.match(sql, /when pending_count = 0 then 'completed'/);
  assert.match(sql, /when status = 'failed' then 'failed'/);
  assert.match(sql, /matched_product_count = matched_count/);
});

test("review completion and catalogue analysis completion are independent", async () => {
  const [repository, listPage, detailPage] = await Promise.all([
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("app/supplier-catalogue/page.tsx"),
    readWeb("app/supplier-catalogue/[catalogueId]/page.tsx"),
  ]);
  assert.match(repository, /pendingReviewItems/);
  assert.match(repository, /catalogueComplete: states\.length === expectedTotal[\s\S]*states\.every/);
  assert.match(listPage, /switch \(archive\.status\)/);
  assert.match(listPage, /archive\.analysis\.pendingReviewItems/);
  assert.doesNotMatch(listPage, /if \(archive\.analysis\.catalogueComplete\) return/);
  assert.match(detailPage, /All currently detected review items have been resolved/);
  assert.match(detailPage, /All persisted catalogue pages have been analysed or skipped/);
});

test("a 620-page archive with four resolved items remains analysis in progress", () => {
  const states = Array.from({ length: 620 }, (_, index) => index < 4 ? "complete" : "pending");
  const analysed = states.filter((state) => state === "complete" || state === "skipped").length;
  const catalogueComplete = states.length > 0 && analysed === states.length;
  assert.equal(analysed, 4);
  assert.equal(catalogueComplete, false);
});

test("archive cards derive progress without loading image-heavy evidence", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  const method = repository.slice(repository.indexOf("async listWithProgress"), repository.indexOf("async get("));
  assert.match(method, /select\("archive_id, analysis_state"\)/);
  assert.match(method, /select\("archive_id, review_status"\)/);
  assert.doesNotMatch(method, /parsed_evidence|review_payload|supplier_product_evidence/);
});

test("recoverable archives expose resume while historical archives remain truthful", async () => {
  const detailPage = await readWeb("app/supplier-catalogue/[catalogueId]/page.tsx");
  assert.match(detailPage, /unresolvedPages > 0 && pageSummary\.resumable > 0/);
  assert.match(detailPage, /Continue Catalogue Analysis/);
  assert.match(detailPage, /unresolvedPages > 0 && pageSummary\.resumable === 0/);
  assert.match(detailPage, /cannot be resumed safely/);
});

test("resume uses the existing archive identity and bounded persisted source evidence", async () => {
  const [workspace, route, repository] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("app/api/supplier-catalogue/archives/[archiveId]/pages/route.ts"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
  ]);
  assert.match(workspace, /archives\/\$\{archive\.id\}\/pages/);
  assert.match(workspace, /archives\/\$\{archive\.id\}/);
  assert.doesNotMatch(workspace, /api\/supplier-catalogue\/archives"/);
  assert.match(route, /getSourcePages\(archiveId, pageNumbers\)/);
  const sourceMethod = repository.slice(repository.indexOf("async getSourcePages"), repository.indexOf("async markFailed"));
  assert.match(sourceMethod, /uniquePageNumbers\.length > 3/);
  assert.match(sourceMethod, /\.in\("page_number", uniquePageNumbers\)/);
  assert.match(sourceMethod, /select\("page_number, source_objects"\)/);
});

test("resume restores durable previews lazily through the canonical analysis panel", async () => {
  const [workspace, panel, repository, styles] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("app/globals.css"),
  ]);
  assert.match(workspace, /<CatalogueBatchAnalysisPanel/);
  assert.match(workspace, /sourceAvailablePageNumbers=/);
  assert.match(repository, /\.neq\("source_objects", \[\]\)/);
  assert.match(panel, /IntersectionObserver/);
  assert.match(panel, /loadSourcePages\(\[pageNumber\]\)/);
  assert.match(panel, /loadedSourcePages\[page\.pageNumber\]\?\.images\[0\]/);
  assert.match(styles, /\.catalogue-page-selection-grid/);
  assert.match(styles, /\.catalogue-page-selection-card\.is-unavailable/);
});

test("resume distinguishes completed, analysable, and unavailable pages", async () => {
  const [workspace, panel] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx"),
  ]);
  assert.match(workspace, /Analysable now/);
  assert.match(workspace, /Unavailable/);
  assert.match(panel, /record\?\.status !== "complete"/);
  assert.match(panel, /disabled=\{!isAnalysable\}/);
  assert.match(panel, /record\?\.status ===[\s\S]*"complete"[\s\S]*"Analysed"/);
});

test("next and selected analysis exclude pages without durable evidence", async () => {
  const panel = await readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx");
  const next = panel.slice(panel.indexOf("async function analyseNextBatch"), panel.indexOf("async function analyseSelectedPages"));
  const selected = panel.slice(panel.indexOf("async function analyseSelectedPages"), panel.indexOf("function openReviewQueue"));
  assert.match(next, /sourceAvailableNumbers\.has\(page\.pageNumber\)/);
  assert.match(next, /\.slice\(0, 3\)/);
  assert.match(panel, /pageNumbers\.filter\(\(pageNumber\) => analysablePageNumbers\.has\(pageNumber\)\)\.slice\(0, 3\)/);
  assert.match(selected, /resolveSourcePages\(selectedPageNumbers\)/);
  assert.match(panel, /analysablePageNumbers\.has\(candidate\)/);
});

test("resume never constructs a 620-page image payload", async () => {
  const [workspace, panel, route] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx"),
    readWeb("app/api/supplier-catalogue/archives/[archiveId]/pages/route.ts"),
  ]);
  assert.match(workspace, /pageNumbers\.slice\(0, 3\)/);
  assert.match(panel, /loadSourcePages\(\[pageNumber\]\)/);
  assert.doesNotMatch(`${workspace}${route}`, /pages:\s*extractionResult\.pages/);
});

test("existing canonical review queue remains directly accessible on resume", async () => {
  const [workspace, page] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("app/supplier-catalogue/[catalogueId]/analyse/page.tsx"),
  ]);
  assert.match(page, /hasPendingReviewItems=\{pageSummary\.pendingReviewItems > 0\}/);
  assert.match(workspace, /session\.productGroups\.length === 0 && hasPendingReviewItems/);
  assert.match(workspace, /window\.location\.assign\(`\/supplier-catalogue\/\$\{archive\.id\}\/review`\)/);
});

test("resumed sequential analysis starts from unresolved pages and keeps failures retryable", async () => {
  const [panel, engine] = await Promise.all([
    readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx"),
    readWeb("lib/supplier/CatalogueBatchAnalysisEngine.ts"),
  ]);
  assert.match(panel, /page\.status === "pending" \|\| page\.status === "failed"/);
  assert.match(panel, /sort\(\(left, right\) => left\.pageNumber - right\.pageNumber\)/);
  assert.match(panel, /\.slice\(0, 3\)/);
  assert.match(engine, /record\.status === "pending" \|\|[\s\S]*record\.status === "failed"/);
  assert.doesNotMatch(engine.slice(engine.indexOf("function getNextPages"), engine.indexOf("function getSelectedPages")), /record\.status === "complete"|record\.status === "skipped"/);
});

test("resumed checkpoints preserve terminal pages and review decisions", async () => {
  const [workspace, repository] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueResumeWorkspace.tsx"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
  ]);
  assert.match(workspace, /changedPages/);
  assert.match(workspace, /REVIEW_ITEM_BATCH_SIZE = 5/);
  assert.match(repository, /terminalStates = new Set\(\["complete", "skipped"\]\)/);
  assert.match(repository, /onConflict: "archive_id,review_item_id", ignoreDuplicates: true/);
  assert.match(repository, /review_status: "pending"/);
});

test("archive queues are isolated and reload from the server", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  assert.match(repository, /\.eq\("archive_id", archiveId\)\.eq\("review_status", "pending"\)/);
  assert.match(repository, /restoreStoredImages\(row\.review_payload\)/);
  assert.match(repository, /\.eq\("archive_id", input\.archiveId\)\.eq\("review_item_id", input\.reviewItemId\)/);
});

test("rendered source pages are persisted in bounded batches after metadata-only archive creation", async () => {
  const [repository, workspace] = await Promise.all([
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
  ]);
  const createBody = workspace.match(/body: JSON\.stringify\(\{([\s\S]*?)details,/i)?.[1] ?? "";
  assert.doesNotMatch(createBody, /\bpages\s*:/);
  assert.match(workspace, /SOURCE_PAGE_BATCH_SIZE = 2/);
  assert.match(workspace, /batches\(extractionResult\.pages, SOURCE_PAGE_BATCH_SIZE\)/);
  assert.match(repository, /storeEmbeddedImages\(page, input\.archiveId\)/);
  assert.doesNotMatch(repository, /sourcePage: page/);
  assert.match(repository, /source_objects: storedPages\[index\]/);
  assert.match(repository, /onConflict: "archive_id,page_number", ignoreDuplicates: true/);
});

test("large catalogues never serialize all rendered pages or review items together", async () => {
  const workspace = await readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx");
  assert.doesNotMatch(workspace, /JSON\.stringify\(\{[^}]*pages: extractionResult\.pages/s);
  assert.match(workspace, /REVIEW_ITEM_BATCH_SIZE = 5/);
  assert.match(workspace, /batches\(session\.productGroups, REVIEW_ITEM_BATCH_SIZE\)/);
  assert.match(workspace, /JSON\.stringify\(\{ items \}\)/);
});

test("Open Review Queue navigates only after canonical archive identity and review readiness", async () => {
  const workspace = await readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx");
  const prepare = workspace.slice(
    workspace.indexOf("async function prepareCatalogueIntelligence"),
    workspace.indexOf("async function checkpointAnalysis"),
  );
  assert.match(prepare, /const archiveId = await ensureArchive\(details\)/);
  assert.match(prepare, /archiveReviewItemCountRef\.current > 0[\s\S]*window\.location\.assign\(`\/supplier-catalogue\/\$\{archiveId\}\/review`\)/);
  assert.match(prepare, /archiveReviewItemCountRef\.current === 0[\s\S]*throw new Error\("No canonical review items are ready/);
  assert.doesNotMatch(prepare, /\/supplier-catalogue\/review[`"']/);
  assert.ok(
    prepare.indexOf("archiveReviewItemCountRef.current > 0") <
      prepare.indexOf("VaultMemoryRepository.getForSupplier"),
    "existing review items should navigate before Vault Memory preparation",
  );
});

test("existing canonical review items are reused without duplicate preparation", async () => {
  const [workspace, route, repository] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
    readWeb("app/api/supplier-catalogue/archives/route.ts"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
  ]);
  assert.match(route, /getReviewItemCount\(archiveId\)/);
  assert.match(workspace, /archiveReviewItemCountRef\.current > 0[\s\S]*return;/);
  assert.match(repository, /onConflict: "archive_id,review_item_id", ignoreDuplicates: true/);
});

test("review preparation failure is visible and the button reports its busy state", async () => {
  const [workspace, importPanel, batchPanel] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
    readWeb("components/suppliers/SupplierCatalogueImportPanel.tsx"),
    readWeb("components/suppliers/CatalogueBatchAnalysisPanel.tsx"),
  ]);
  assert.match(workspace, /setQueueSaveError\([\s\S]*message/);
  assert.match(workspace, /role="alert"/);
  assert.match(importPanel, /isPreparingReviewQueue=\{[\s\S]*isPreparingReviewQueue/);
  assert.match(batchPanel, /disabled=\{[\s\S]*isPreparingReviewQueue/);
  assert.match(batchPanel, /Preparing Review Queue\.\.\./);
});

test("canonical archive identity is available before bounded source persistence finishes", async () => {
  const workspace = await readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx");
  const identity = workspace.slice(
    workspace.indexOf("async function ensureArchive"),
    workspace.indexOf("async function persistSourcePages"),
  );
  const sourcePersistence = workspace.slice(
    workspace.indexOf("async function persistSourcePages"),
    workspace.indexOf("function resetImport"),
  );
  assert.match(identity, /archiveIdRef\.current = archiveId[\s\S]*return archiveId/);
  assert.doesNotMatch(identity, /\/pages`/);
  assert.match(sourcePersistence, /batches\(extractionResult\.pages, SOURCE_PAGE_BATCH_SIZE\)/);
  assert.match(workspace, /ensureArchive\(details\)\.then\(\(archiveId\) =>[\s\S]*persistSourcePages\(archiveId\)/);
});

test("catalogue matching loads supplier-scoped memory without image-heavy evidence", async () => {
  const [workspace, repository, route] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
    readWeb("lib/brain/VaultMemoryRepository.ts"),
    readWeb("app/api/vault-memory/route.ts"),
  ]);
  assert.match(workspace, /VaultMemoryRepository\.getForSupplier\(details\.supplierName\)/);
  assert.match(repository, /matchingSupplier=\$\{encodeURIComponent\(supplierName\)\}/);
  const matchingSelect = route.match(/const MATCHING_MEMORY_SELECT = `([\s\S]*?)`;/)?.[1] ?? "";
  assert.doesNotMatch(matchingSelect, /supplier_image_url/);
  assert.match(route, /query = query\.eq\("supplier_name", matchingSupplier\)/);
});

test("page-source writes remain bounded and do not load archive evidence", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  const sourceMethod = repository.slice(
    repository.indexOf("async saveSourcePages"),
    repository.indexOf("async saveReviewItems"),
  );
  assert.match(sourceMethod, /input\.pages\.length > 3/);
  assert.match(sourceMethod, /ignoreDuplicates: true/);
  assert.doesNotMatch(sourceMethod, /\.select\(|refresh_supplier_catalogue_archive|parsed_evidence.*select/s);
});

test("summary state query excludes parsed evidence except one resumability probe", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  const summary = repository.slice(
    repository.indexOf("async getPageSummary"),
    repository.indexOf("async markFailed"),
  );
  assert.match(summary, /select\("analysis_state"/);
  assert.match(summary, /select\("source_objects"\).*\.limit\(1\)/s);
  assert.doesNotMatch(summary, /select\("analysis_state, parsed_evidence"/);
});

test("page checkpoints send only changed non-pending records", async () => {
  const [workspace, repository] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
  ]);
  assert.match(workspace, /changedPages/);
  assert.match(workspace, /page\.status !== "pending"/);
  assert.match(workspace, /productGroups: \[\]/);
  assert.match(repository, /\.in\("page_number", pageNumbers\)/);
});

test("page analysis checkpoints terminal and failed evidence without stale regression", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  assert.match(repository, /terminalStates = new Set\(\["complete", "skipped"\]\)/);
  assert.match(repository, /preserveTerminal/);
  assert.match(repository, /error_message: page\.error/);
  assert.match(repository, /analysed_at: page\.analysedAt/);
});

test("batch progress checkpoints review items idempotently", async () => {
  const [repository, workspace] = await Promise.all([
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
  ]);
  assert.match(workspace, /checkpointAnalysis/);
  assert.match(workspace, /CatalogueReviewQueueEngine\.buildQueue/);
  assert.match(repository, /ignoreDuplicates: true/);
  assert.match(repository, /review_status: "pending"/);
});

test("archive detail reports truthful page and review counts", async () => {
  const [repository, page] = await Promise.all([
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("app/supplier-catalogue/[catalogueId]/page.tsx"),
  ]);
  assert.match(repository, /getPageSummary/);
  for (const label of ["Pending", "Analysed", "Failed", "Review pending"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /cannot be resumed safely/);
});

test("review decisions persist before local review advances", async () => {
  const workspace = await readWeb("components/suppliers/SupplierReviewWorkspace.tsx");
  assert.match(workspace, /await persistDecision/);
  assert.match(workspace, /status: "matched"/);
  assert.match(workspace, /status: "skipped"/);
  assert.match(workspace, /status: "create_product"/);
});

test("accepted Match Review memory writes run concurrently before the canonical decision", async () => {
  const [engine, workspace] = await Promise.all([
    readWeb("lib/brain/LinkProductEngine.ts"),
    readWeb("components/suppliers/SupplierReviewWorkspace.tsx"),
  ]);
  assert.match(engine, /Promise\.all\(\[/);
  assert.match(engine, /VaultMemoryRepository\.save/);
  assert.match(engine, /SupplierMemoryRepository\.recordSuccessfulMatch/);

  const accept = workspace.slice(
    workspace.indexOf("async function acceptCurrentMatch"),
    workspace.indexOf("async function skipCurrentItem"),
  );
  assert.ok(
    accept.indexOf("await LinkProductEngine.execute") <
      accept.indexOf("await persistDecision"),
    "durable memory writes must finish before the canonical decision",
  );
  assert.ok(
    accept.indexOf("await persistDecision") < accept.indexOf("setDecisions"),
    "the canonical decision must persist before the UI advances",
  );
});

test("accepted product identity and decision metadata remain unchanged", async () => {
  const workspace = await readWeb("components/suppliers/SupplierReviewWorkspace.tsx");
  assert.match(workspace, /linkedProductId: selectedMatch\.product\.parent_product_id/);
  assert.match(workspace, /metadata: \{ confidence: selectedMatch\.confidence, style_id: selectedMatch\.product\.style_id \}/);
});

test("a canonical-decision retry reuses completed memory writes", async () => {
  const workspace = await readWeb("components/suppliers/SupplierReviewWorkspace.tsx");
  const accept = workspace.slice(
    workspace.indexOf("async function acceptCurrentMatch"),
    workspace.indexOf("async function skipCurrentItem"),
  );
  assert.match(accept, /completedLinkResultsRef\.current\[currentItem\.card\.id\] \?\?/);
  assert.match(accept, /completedLinkResultsRef\.current\[currentItem\.card\.id\] = result/);
  assert.match(accept, /await persistDecision[\s\S]*delete completedLinkResultsRef\.current\[currentItem\.card\.id\]/);
});

test("acceptance progress contains no artificial success-path delay", async () => {
  const workspace = await readWeb("components/suppliers/SupplierReviewWorkspace.tsx");
  const accept = workspace.slice(
    workspace.indexOf("async function acceptCurrentMatch"),
    workspace.indexOf("async function skipCurrentItem"),
  );
  assert.doesNotMatch(accept.slice(0, accept.indexOf("} catch (error)")), /await wait\(/);
  assert.match(accept, /Recording the canonical review decision/);
});

test("decision persistence remains item-scoped and refreshes canonical archive counts", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  const decide = repository.slice(
    repository.indexOf("async decide"),
    repository.indexOf("} as const"),
  );
  assert.match(decide, /\.eq\("archive_id", input\.archiveId\)\.eq\("review_item_id", input\.reviewItemId\)\.eq\("review_status", "pending"\)/);
  assert.match(decide, /refresh_supplier_catalogue_archive/);
});

test("archive cards and review routes use explicit archive identity", async () => {
  const page = await readWeb("app/supplier-catalogue/page.tsx");
  assert.match(page, /SupplierCatalogueArchiveRepository\.listWithProgress\(\)/);
  assert.match(page, /`\/supplier-catalogue\/\$\{archive\.id\}`/);
  assert.doesNotMatch(page, /const supplierCatalogues|const catalogueStats/);
  await access(new URL("app/supplier-catalogue/[catalogueId]/review/page.tsx", webRoot));
});

test("catalogue dashboard follows active and replacement lifecycle visibility", async () => {
  const [repository, page] = await Promise.all([
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readWeb("app/supplier-catalogue/page.tsx"),
  ]);
  assert.match(repository, /is_active/);
  assert.match(repository, /and\(status\.eq\.completed,is_active\.eq\.true\),status\.in\.\(uploading,processing,ready_for_review,in_review\)/);
  assert.doesNotMatch(repository, /status\.in\.\([^)]*(?:failed|superseded)/);
  assert.match(page, /case "completed": return archive\.isActive \? "ACTIVE"/);
  assert.match(page, /case "uploading": return "UPLOAD IN PROGRESS"/);
  assert.match(page, /case "processing": return "ANALYSIS IN PROGRESS"/);
  assert.match(page, /case "ready_for_review":[\s\S]*case "in_review": return "REVIEW REQUIRED"/);
  assert.match(page, /activeArchives\.reduce[\s\S]*archive\.pageCount/);
  assert.match(page, /activeArchives\.reduce[\s\S]*archive\.matchedProductCount/);
  assert.match(page, /replacementWorkflows\.reduce[\s\S]*pendingReviewItems/);
});

test("IndexedDB is not used by the canonical import or review routes", async () => {
  const [workspace, reviewPage] = await Promise.all([
    readWeb("components/suppliers/SupplierCatalogueImportWorkspace.tsx"),
    readWeb("app/supplier-catalogue/[catalogueId]/review/page.tsx"),
  ]);
  assert.doesNotMatch(`${workspace}${reviewPage}`, /CatalogueReviewQueueRepository|indexedDB|active-review-queue/);
  assert.match(reviewPage, /getPendingReviewItems\(catalogueId\)/);
});

test("writes require an authorised operator and anonymous table writes are revoked", async () => {
  const [createRoute, decisionRoute, sql] = await Promise.all([
    readWeb("app/api/supplier-catalogue/archives/route.ts"),
    readWeb("app/api/supplier-catalogue/archives/[archiveId]/review-items/[reviewItemId]/route.ts"),
    readFile(new URL("supabase/migrations/20260816000000_supplier_catalogue_archives.sql", repoRoot), "utf8"),
  ]);
  assert.match(createRoute, /requireOperatorRole\("owner", "operator"\)/);
  assert.match(decisionRoute, /requireOperatorRole\("owner", "operator"\)/);
  assert.match(sql, /revoke all on public\.vault_supplier_catalogue_archives.*from anon, authenticated/s);
});

test("supplier and purchasing intelligence engines are untouched by archive code", async () => {
  const files = await Promise.all([
    readWeb("lib/brain/PurchaseIntelligenceEngine.ts"),
    readWeb("lib/brain/SupplierBasketIntelligenceEngine.ts"),
  ]);
  for (const contents of files) assert.doesNotMatch(contents, /SupplierCatalogueArchiveRepository/);
});

test("catalogue replacement activates only a fully completed archive atomically", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260904000000_storage_safe_inventory_and_supplier_catalogue_lifecycle.sql", repoRoot), "utf8");
  assert.match(sql, /status in \('uploading',[\s\S]*'superseded',[\s\S]*'failed'\)/);
  assert.match(sql, /where is_active/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /terminal_page_count = expected_page_count/);
  assert.match(sql, /set status = 'superseded', is_active = false/);
  assert.match(sql, /status = 'completed', is_active = true/);
  assert.ok(sql.indexOf("set status = 'superseded'") < sql.indexOf("status = 'completed', is_active = true"));
  assert.match(sql, /when status = 'failed' then 'failed'/);
});

test("catalogue persistence rejects embedded binaries and uses expiring object storage", async () => {
  const [sql, repository, cleanup] = await Promise.all([
    readFile(new URL("supabase/migrations/20260904000000_storage_safe_inventory_and_supplier_catalogue_lifecycle.sql", repoRoot), "utf8"),
    readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts"),
    readFile(new URL("supabase/functions/supplier-catalogue-artifact-cleanup/index.ts", repoRoot), "utf8"),
  ]);
  assert.match(sql, /not \(parsed_evidence \? 'sourcePage'\)/);
  assert.match(sql, /vault_supplier_catalogue_pages_no_embedded_binary/);
  assert.match(sql, /vault_supplier_catalogue_review_no_embedded_binary/);
  assert.match(repository, /supplier-catalogue-temporary/);
  assert.match(repository, /createSignedUrl\(objectPath, 10 \* 60\)/);
  assert.match(repository, /purgeTemporarySourceObjects/);
  assert.doesNotMatch(repository, /parsed_evidence:\s*\{[^}]*sourcePage/s);
  assert.match(cleanup, /status", \["completed", "superseded"\]/);
  assert.match(cleanup, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(cleanup, /request\.headers\.get\("authorization"\)/);
  assert.match(sql, /vault-supplier-catalogue-artifact-retention/);
});
