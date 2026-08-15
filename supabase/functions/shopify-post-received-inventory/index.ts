import { createClient } from "npm:@supabase/supabase-js@2";
import { adjustReceivedInventory, assertCurrentInventoryIdentities, assertInventoryWriteScope, type InventoryPostingChange } from "../_shared/shopify/inventory-adjustment.ts";

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method !== "POST") return respond({ success: false, error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ success: false, error: "Supabase service configuration unavailable" }, 500);
  if (request.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return respond({ success: false, error: "Inventory posting requires the authenticated Vault server action" }, 403);
  }
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let postingId: string | null = null;
  let mutationDispatched = false;
  try {
    const body = await request.json() as { purchaseOrderId?: string; receiptId?: string; operatorId?: string; idempotencyKey?: string; allocations?: Array<{ receiptAllocationId: string; quantity: number }> };
    const { data: reservation, error: reserveError } = await supabase.rpc("reserve_vault_purchase_order_inventory_posting", {
      target_purchase_order_id: body.purchaseOrderId, target_receipt_id: body.receiptId, target_operator_id: body.operatorId,
      target_idempotency_key: body.idempotencyKey,
      target_allocations: (body.allocations ?? []).map((item) => ({ receipt_allocation_id: item.receiptAllocationId, quantity: item.quantity })),
    }).single();
    if (reserveError) throw reserveError;
    postingId = reservation.posting_id;
    if (!reservation.created) {
      if (reservation.posting_state === "succeeded") return respond({ success: true, postingId, transitioned: false });
      if (reservation.posting_state === "failed") return respond({ success: false, postingId, error: "This posting attempt failed safely; start a new operation to retry." }, 409);
      return respond({ success: false, postingId, error: "This posting outcome is pending or unknown; retry is blocked to prevent duplicate stock." }, 409);
    }
    const { data: posting, error: postingError } = await supabase.from("vault_purchase_order_inventory_postings")
      .select(`id, idempotency_key, shopify_location_id_snapshot, vault_purchase_order_inventory_posting_lines(quantity, shopify_variant_id_snapshot, shopify_inventory_item_id_snapshot)`)
      .eq("id", postingId).single();
    if (postingError) throw postingError;
    const changes: InventoryPostingChange[] = posting.vault_purchase_order_inventory_posting_lines.map(
      (line: { quantity: number; shopify_variant_id_snapshot: string; shopify_inventory_item_id_snapshot: string }) => ({
        quantity: line.quantity, variantId: line.shopify_variant_id_snapshot,
        inventoryItemId: line.shopify_inventory_item_id_snapshot, locationId: posting.shopify_location_id_snapshot,
      }));
    await assertInventoryWriteScope();
    await assertCurrentInventoryIdentities(changes);
    mutationDispatched = true;
    const result = await adjustReceivedInventory({ postingId, idempotencyKey: posting.idempotency_key, changes });
    if (result.userErrors.length || !result.inventoryAdjustmentGroup) {
      await supabase.rpc("append_vault_purchase_order_inventory_posting_event", { target_posting_id: postingId,
        target_event_type: "shopify_failed", target_response_payload: result });
      return respond({ success: false, postingId, error: result.userErrors.map((error) => error.message).join("; ") || "Shopify rejected the inventory adjustment" }, 422);
    }
    await supabase.rpc("append_vault_purchase_order_inventory_posting_event", { target_posting_id: postingId,
      target_event_type: "shopify_succeeded", target_shopify_reference: result.inventoryAdjustmentGroup.referenceDocumentUri,
      target_response_payload: result });
    const sync = await supabase.functions.invoke("shopify-inventory-sync", { body: {} });
    await supabase.rpc("append_vault_purchase_order_inventory_posting_event", { target_posting_id: postingId,
      target_event_type: sync.error ? "inventory_sync_request_failed" : "inventory_sync_requested",
      target_response_payload: sync.error ? { error: sync.error.message } : { response: sync.data } });
    return respond({ success: true, postingId, transitioned: true, inventorySyncRequested: !sync.error,
      warning: sync.error ? "Shopify stock was posted, but inventory sync could not be requested." : null });
  } catch (error) {
    if (postingId) await supabase.rpc("append_vault_purchase_order_inventory_posting_event", { target_posting_id: postingId,
      target_event_type: mutationDispatched ? "shopify_outcome_unknown" : "shopify_failed",
      target_response_payload: { error: error instanceof Error ? error.message : "Unexpected posting error" } });
    return respond({ success: false, postingId, error: error instanceof Error ? error.message : "Unexpected posting error" }, 500);
  }
});
