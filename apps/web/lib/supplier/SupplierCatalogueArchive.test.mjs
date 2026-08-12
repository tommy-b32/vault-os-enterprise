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

test("archive queues are isolated and reload from the server", async () => {
  const repository = await readWeb("lib/supplier/SupplierCatalogueArchiveRepository.ts");
  assert.match(repository, /\.eq\("archive_id", archiveId\)\.eq\("review_status", "pending"\)/);
  assert.match(repository, /review_payload as CatalogueReviewQueueItem/);
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
  assert.match(repository, /sourcePage: page/);
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
  assert.match(summary, /select\("parsed_evidence"\).*\.limit\(1\)/s);
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
  for (const label of ["Pending", "Analysed", "Failed", "Review items"]) {
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
  assert.match(page, /SupplierCatalogueArchiveRepository\.list\(\)/);
  assert.match(page, /`\/supplier-catalogue\/\$\{archive\.id\}`/);
  assert.doesNotMatch(page, /const supplierCatalogues|const catalogueStats/);
  await access(new URL("app/supplier-catalogue/[catalogueId]/review/page.tsx", webRoot));
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
