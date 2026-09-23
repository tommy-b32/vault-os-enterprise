import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchHistoricalShopifyOrders } from "../_shared/shopify/orders.ts";
import { buildFinancialEvidence, persistFinancialEvidence } from "../_shared/shopify/financial-evidence.ts";

const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ORDERS = 50;
const TABLES = [
  ["applications", "vault_shopify_discount_application_observations", ["source", "shopify_order_id", "application_index", "order_source_updated_at"]],
  ["allocations", "vault_shopify_line_discount_allocation_observations", ["source", "shopify_order_id", "shopify_line_item_id", "application_index", "order_source_updated_at"]],
  ["refunds", "vault_shopify_refund_observations", ["source", "shopify_refund_id", "refund_source_updated_at"]],
  ["refund_lines", "vault_shopify_refund_line_observations", ["source", "shopify_refund_id", "shopify_refund_line_item_id", "refund_source_updated_at"]],
  ["refund_transactions", "vault_shopify_refund_transaction_observations", ["source", "shopify_order_transaction_id", "refund_source_updated_at"]],
  ["completeness", "vault_shopify_financial_capture_completeness_observations", ["source", "shopify_order_id", "order_source_updated_at"]],
] as const;
const SOURCE_FIELDS: Record<string, string[]> = {
  applications: ["application_type", "code", "title", "description", "allocation_method", "target_selection", "target_type", "pricing_value_type", "pricing_value", "pricing_currency"],
  allocations: ["allocated_shop_amount", "allocated_shop_currency", "allocated_presentment_amount", "allocated_presentment_currency"],
  refunds: ["shopify_order_id", "refund_created_at", "refund_processed_at", "total_refunded_amount", "currency"],
  refund_lines: ["shopify_order_id", "shopify_line_item_id", "quantity", "price_amount", "subtotal_amount", "tax_amount", "currency", "restocked", "restock_type", "restock_location_id"],
  refund_transactions: ["shopify_order_id", "shopify_refund_id", "parent_transaction_id", "transaction_kind", "transaction_status", "gateway", "amount", "currency", "transaction_created_at", "processed_at", "is_test"],
  completeness: ["evidence_mode", "discount_application_count", "discount_allocation_count", "refund_count", "refund_line_count", "refund_transaction_count", "discount_applications_complete", "line_items_complete", "refunds_complete", "refund_lines_complete", "refund_transactions_complete", "fingerprint_contract_version", "source_content_fingerprint"],
};

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function same(left: string, right: string) { const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
function timestamp(value: unknown, field: string) { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`INVALID_${field}`); return value; }
function requestBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_REPAIR_REQUEST");
  const body = value as Record<string, unknown>; const createdFrom = timestamp(body.created_from, "CREATED_FROM"); const createdBefore = timestamp(body.created_before, "CREATED_BEFORE");
  if (Date.parse(createdFrom) >= Date.parse(createdBefore) || Date.parse(createdBefore) - Date.parse(createdFrom) > MAX_WINDOW_MS || Date.parse(createdBefore) > Date.now()) throw new Error("INVALID_REPAIR_BOUNDS");
  if (typeof body.dry_run !== "boolean") throw new Error("DRY_RUN_REQUIRED");
  return { createdFrom, createdBefore, dryRun: body.dry_run };
}

export function rowsForInspection(payload: Record<string, unknown>, family: string): Record<string, unknown>[] {
  const value = payload[family];
  if (family === "completeness") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_FINANCIAL_COMPLETENESS_PAYLOAD");
    return [value as Record<string, unknown>];
  }
  if (!Array.isArray(value)) throw new Error("INVALID_FINANCIAL_EVIDENCE_PAYLOAD");
  return value as Record<string, unknown>[];
}

async function inspect(supabase: any, payload: any) {
  let wouldInsert = 0, noOp = 0, conflicts = 0;
  for (const [family, table, keys] of TABLES) for (const row of rowsForInspection(payload, family)) {
    let query = supabase.from(table).select("*");
    for (const key of keys) query = query.eq(key, row[key]);
    const { data, error } = await query.maybeSingle(); if (error) throw error;
    if (!data) { wouldInsert++; continue; }
    if (data.fingerprint_contract_version === "shopify-source-content-v1" && data.source_content_fingerprint === row.source_content_fingerprint) noOp++;
    else if (data.fingerprint_contract_version === "legacy-full-row-v1" && SOURCE_FIELDS[family].every((field) => data[field] === row[field])) noOp++;
    else conflicts++;
  }
  return { wouldInsert, noOp, conflicts };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ success: false, error: "Method not allowed" }, 405);
  const secret = Deno.env.get("VAULT_ORDER_SYNC_SECRET"); const provided = request.headers.get("x-vault-sync-secret");
  if (!secret) return response({ success: false, error: "Repair authentication unavailable" }, 500);
  if (!provided || !same(provided, secret)) return response({ success: false, error: "Unauthorized" }, 401);
  const startedAt = new Date().toISOString(); let input: ReturnType<typeof requestBody> | null = null; let supabase: any;
  try {
    input = requestBody(await request.json());
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("REPAIR_STORAGE_UNAVAILABLE");
    supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const orders = await fetchHistoricalShopifyOrders(input.createdFrom, input.createdBefore);
    if (orders.length > MAX_ORDERS) throw new Error("REPAIR_WINDOW_TOO_LARGE");
    const totals = { applications: 0, allocations: 0, refunds: 0, refund_lines: 0, refund_transactions: 0, wouldInsert: 0, noOp: 0, conflicts: 0 };
    const payloads = orders.map((order) => buildFinancialEvidence(order, startedAt, "historical"));
    for (const payload of payloads) { const evidence = payload as any; const report = await inspect(supabase, evidence); totals.applications += evidence.applications.length; totals.allocations += evidence.allocations.length; totals.refunds += evidence.refunds.length; totals.refund_lines += evidence.refund_lines.length; totals.refund_transactions += evidence.refund_transactions.length; totals.wouldInsert += report.wouldInsert; totals.noOp += report.noOp; totals.conflicts += report.conflicts; }
    if (totals.conflicts) throw new Error("FINANCIAL_SOURCE_VERSION_CONFLICT");
    if (!input.dryRun) for (const payload of payloads) await persistFinancialEvidence(supabase, payload);
    await supabase.from("vault_c2_historical_financial_repair_runs").insert({ created_from: input.createdFrom, created_before: input.createdBefore, execution_mode: input.dryRun ? "dry_run" : "write", state: "completed", started_at: startedAt, completed_at: new Date().toISOString(), orders_scanned: orders.length, applications_found: totals.applications, allocations_found: totals.allocations, refunds_found: totals.refunds, refund_lines_found: totals.refund_lines, refund_transactions_found: totals.refund_transactions, would_insert_count: totals.wouldInsert, no_op_count: totals.noOp, conflict_count: totals.conflicts });
    return response({ success: true, mode: input.dryRun ? "dry_run" : "write", created_from: input.createdFrom, created_before: input.createdBefore, orders_scanned: orders.length, ...totals });
  } catch (error) {
    if (supabase && input) await supabase.from("vault_c2_historical_financial_repair_runs").insert({ created_from: input.createdFrom, created_before: input.createdBefore, execution_mode: input.dryRun ? "dry_run" : "write", state: "failed", started_at: startedAt, completed_at: new Date().toISOString(), error_code: error instanceof Error ? error.message : "REPAIR_FAILED" });
    return response({ success: false, error: error instanceof Error ? error.message : "REPAIR_FAILED" }, 400);
  }
});
