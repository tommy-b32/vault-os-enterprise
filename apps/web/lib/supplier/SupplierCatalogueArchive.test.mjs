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

test("review decisions persist before local review advances", async () => {
  const workspace = await readWeb("components/suppliers/SupplierReviewWorkspace.tsx");
  assert.match(workspace, /await persistDecision/);
  assert.match(workspace, /status: "matched"/);
  assert.match(workspace, /status: "skipped"/);
  assert.match(workspace, /status: "create_product"/);
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
