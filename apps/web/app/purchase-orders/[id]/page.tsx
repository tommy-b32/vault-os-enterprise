import Link from "next/link";
import { notFound } from "next/navigation";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { PurchaseOrderApprovalButton } from "@/components/purchase-orders/PurchaseOrderApprovalButton";
import { SupplierOrderPreparation } from "@/components/purchase-orders/SupplierOrderPreparation";
import { PurchaseOrderPayment } from "@/components/purchase-orders/PurchaseOrderPayment";
import { PurchaseOrderReceiving } from "@/components/purchase-orders/PurchaseOrderReceiving";
import { PurchaseOrderShipping } from "@/components/purchase-orders/PurchaseOrderShipping";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getPurchaseOrder } from "@/lib/purchase-orders/PurchaseOrderRepository";

export const dynamic = "force-dynamic";

type SavedPurchaseOrderLine = {
  id: string;
  style_id: string;
  product_name: string;
  recommended_packs: number;
  recommended_units: number | null;
  units_per_pack: number | null;
  pack_cost_gbp: number | null;
  line_cost_gbp: number | null;
  source_recommendation_type: string;
  recommendation_priority: string | null;
};

type SavedReceiptLine = {
  id: string;
  purchase_order_line_id: string;
  quantity_received: number;
  non_sellable_quantity: number;
  discrepancy_note: string | null;
  vault_purchase_order_receipt_allocations: Array<{
    id: string;
    variant_id: string;
    quantity_received: number;
  }> | null;
};

type ReceivingVariant = {
  id: string;
  product_id: string;
  source_variant_id: string;
  source_inventory_item_id: string;
  title: string | null;
  option_1: string | null;
  option_2: string | null;
};

type ReceivingLocation = {
  id: string;
  name: string;
  source_location_id: string;
};

type InventoryPostingLine = {
  receipt_allocation_id: string;
  quantity: number;
  vault_purchase_order_inventory_postings: {
    vault_purchase_order_inventory_posting_events: Array<{ event_type: string }>;
  } | null;
};

function money(
  value: number | null,
  currency = "GBP",
) {
  if (value === null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(value);
}

function readableSource(
  source: string,
) {
  if (
    source ===
    "purchase_intelligence_required"
  ) {
    return "Required replenishment";
  }

  if (
    source ===
    "purchase_intelligence_bring_forward"
  ) {
    return "Demand-supported bring-forward";
  }

  return source.replaceAll("_", " ");
}

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  await requireAuthenticatedOperator();

  const { id } = await params;

  const draft = await getPurchaseOrder(id);

  if (!draft) {
    notFound();
  }

  const supplierName =
    draft.vault_suppliers?.[0]?.supplier_name ??
    "Unknown supplier";

  const lines =
    (draft.vault_purchase_order_lines ??
      []) as SavedPurchaseOrderLine[];

  const totalUnits =
    lines.reduce(
      (total: number, line: SavedPurchaseOrderLine) =>
        total +
        (line.recommended_units ?? 0),
      0,
    );
  const payments = [...(draft.vault_purchase_order_payments ?? [])]
    .sort((left, right) => left.payment_date.localeCompare(right.payment_date) || left.created_at.localeCompare(right.created_at));
  const receipts = [...(draft.vault_purchase_order_receipts ?? [])]
    .sort((left, right) => left.received_date.localeCompare(right.received_date) || left.created_at.localeCompare(right.created_at));
  const receivedByLine = new Map<string, number>();
  const nonSellableByLine = new Map<string, number>();
  for (const receipt of receipts) {
    for (const receiptLine of receipt.vault_purchase_order_receipt_lines ?? []) {
      receivedByLine.set(
        receiptLine.purchase_order_line_id,
        (receivedByLine.get(receiptLine.purchase_order_line_id) ?? 0) + receiptLine.quantity_received,
      );
      nonSellableByLine.set(
        receiptLine.purchase_order_line_id,
        (nonSellableByLine.get(receiptLine.purchase_order_line_id) ?? 0) + receiptLine.non_sellable_quantity,
      );
    }
  }
  const productNameByLine = new Map(lines.map((line) => [line.id, line.product_name]));
  const receivingVariants = (draft.receiving_variants ?? []) as ReceivingVariant[];
  const receivingVariantById = new Map(receivingVariants.map((variant) => [variant.id, variant]));
  const postedByAllocation = new Map<string, number>();
  const blockedPostingAllocations = new Set<string>();
  for (const postingLine of (draft.inventory_posting_lines ?? []) as InventoryPostingLine[]) {
    const events = postingLine.vault_purchase_order_inventory_postings?.vault_purchase_order_inventory_posting_events ?? [];
    if (events.some((event) => event.event_type === "shopify_succeeded")) {
      postedByAllocation.set(postingLine.receipt_allocation_id,
        (postedByAllocation.get(postingLine.receipt_allocation_id) ?? 0) + postingLine.quantity);
    } else if (!events.some((event) => event.event_type === "shopify_failed")) {
      blockedPostingAllocations.add(postingLine.receipt_allocation_id);
    }
  }

  return (
    <VaultAppShell>
      <main className="purchase-order-page">
        <header className="purchase-order-header">
          <div>
            <p className="vault-eyebrow">
              SAVED PURCHASE ORDER
            </p>

            <h1>
              {supplierName}
            </h1>

            <p>
              Durable buying-basket snapshot.
              Changes in live Purchase Intelligence
              do not alter this saved draft.
            </p>
          </div>

          <span className="purchase-order-state">
            {draft.status.toUpperCase()}
          </span>
        </header>

        <section className="purchase-order-context">
          <article>
            <span>Created</span>

            <strong>
              {new Intl.DateTimeFormat(
                "en-GB",
                {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              ).format(
                new Date(
                  draft.created_at,
                ),
              )}
            </strong>
          </article>

          <article>
            <span>Total packs</span>

            <strong>
              {draft.total_packs ?? 0}
            </strong>
          </article>

          <article>
            <span>Total units</span>

            <strong>
              {totalUnits}
            </strong>
          </article>

          {draft.approved_at ? (
            <article>
              <span>Approved</span>
              <strong>
                {new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(draft.approved_at))}
                {" by "}
                {draft.approving_operator?.display_name ??
                  draft.approving_operator?.email ??
                  "Vault operator"}
              </strong>
            </article>
          ) : null}

          {draft.ordered_at ? (
            <article>
              <span>Ordered</span>
              <strong>
                {new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(draft.ordered_at))}
                {" by "}
                {draft.ordering_operator?.display_name ??
                  draft.ordering_operator?.email ??
                  "Vault operator"}
              </strong>
            </article>
          ) : null}

          {draft.shipped_at && draft.dispatch_date ? (
            <article>
              <span>Shipped</span>
              <strong>
                Dispatched {new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                }).format(new Date(draft.dispatch_date + "T00:00:00Z"))}
                {" · recorded "}
                {new Intl.DateTimeFormat("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(draft.shipped_at))}
                {" by "}
                {draft.shipping_operator?.display_name ??
                  draft.shipping_operator?.email ??
                  "Vault operator"}
              </strong>
            </article>
          ) : null}

          {draft.received_at ? (
            <article>
              <span>Fully received</span>
              <strong>{new Intl.DateTimeFormat("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(draft.received_at))}</strong>
            </article>
          ) : null}
        </section>

        <section className="purchase-order-supplier-draft">
          <div className="purchase-order-section-heading">
            <div>
              <p className="vault-eyebrow">
                ORDER VALUE
              </p>

              <h2>
                {money(
                  draft.estimated_total_gbp,
                  draft.currency ?? "GBP",
                )}
              </h2>
            </div>

            <span>
              {lines.length}{" "}
              {lines.length === 1
                ? "line"
                : "lines"}
            </span>
          </div>

          <div className="purchase-order-lines-table">
            <div
              className="purchase-order-lines-head"
              aria-hidden="true"
            >
              <span>Product</span>
              <span>Packs</span>
              <span>Units</span>
              <span>Pack cost</span>
              <span>Line cost</span>
              <span>Source</span>
              <span>Priority</span>
            </div>

            {lines.map(
              (line: SavedPurchaseOrderLine) => (
                <article
                  className="purchase-order-editable-line"
                  key={line.id}
                >
                  <div className="purchase-order-product-cell">
                    <strong>
                      {line.product_name}
                    </strong>

                    <span>
                      {readableSource(
                        line.source_recommendation_type,
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Packs
                    </span>

                    <strong>
                      {line.recommended_packs}
                    </strong>
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Units
                    </span>

                    <strong>
                      {line.recommended_units ??
                        "Unavailable"}
                    </strong>

                    {line.units_per_pack !==
                    null ? (
                      <small>
                        {line.units_per_pack} per pack
                      </small>
                    ) : null}
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Pack cost
                    </span>

                    <strong>
                      {money(
                        line.pack_cost_gbp,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Line cost
                    </span>

                    <strong>
                      {money(
                        line.line_cost_gbp,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Source
                    </span>

                    <strong>
                      {readableSource(
                        line.source_recommendation_type,
                      )}
                    </strong>
                  </div>

                  <div>
                    <span className="purchase-order-mobile-label">
                      Priority
                    </span>

                    <strong>
                      {line.recommendation_priority ??
                        "Not recorded"}
                    </strong>
                  </div>
                </article>
              ),
            )}
          </div>

          {draft.reasoning ? (
            <p className="purchase-order-capital-guidance">
              {draft.reasoning}
            </p>
          ) : null}
        </section>

        {["approved", "ordered", "part_paid", "paid", "shipped", "received"].includes(draft.status) ? (
          <SupplierOrderPreparation
            purchaseOrderId={draft.id}
            purchaseOrderStatus={draft.status}
          />
        ) : null}

        {["ordered", "part_paid", "paid", "shipped", "received"].includes(draft.status) ? (
          <PurchaseOrderPayment
            actualTotalGbp={draft.actual_total_gbp}
            estimatedTotalGbp={draft.estimated_total_gbp}
            paidAmountGbp={draft.paid_amount_gbp}
            payments={payments}
            purchaseOrderId={draft.id}
            key={`${draft.id}:${draft.paid_amount_gbp}`}
            status={draft.status}
          />
        ) : null}

        {["ordered", "part_paid", "paid", "shipped", "received"].includes(draft.status) ? (
          <PurchaseOrderShipping
            carrier={draft.carrier}
            dispatchDate={draft.dispatch_date}
            key={draft.id + ":" + draft.status + ":" + (draft.shipped_at ?? "unshipped")}
            purchaseOrderId={draft.id}
            status={draft.status}
            trackingReference={draft.tracking_reference}
          />
        ) : null}

        {["ordered", "part_paid", "paid", "shipped", "received"].includes(draft.status) ? (
          <PurchaseOrderReceiving
            key={`${draft.id}:${draft.status}:${receipts.length}:${Array.from(receivedByLine.values()).reduce((sum, value) => sum + value, 0)}:${Array.from(postedByAllocation.values()).reduce((sum, value) => sum + value, 0)}`}
            lines={lines.map((line) => ({
              id: line.id,
              productName: line.product_name,
              orderedQuantity: line.recommended_units ??
                (line.units_per_pack === null ? null : line.recommended_packs * line.units_per_pack),
              receivedQuantity: receivedByLine.get(line.id) ?? 0,
              nonSellableQuantity: nonSellableByLine.get(line.id) ?? 0,
              variants: receivingVariants
                .filter((variant) =>
                  `${variant.product_id}::${variant.option_1?.trim() || "Default"}` === line.style_id)
                .map((variant) => ({
                  id: variant.id,
                  title: variant.title,
                  size: variant.option_2,
                  sourceVariantId: variant.source_variant_id,
                  inventoryItemId: variant.source_inventory_item_id,
                })),
            }))}
            locations={(draft.receiving_locations ?? []).map((location: ReceivingLocation) => ({
              id: location.id,
              name: location.name,
              sourceLocationId: location.source_location_id,
            }))}
            purchaseOrderId={draft.id}
            receipts={receipts.map((receipt) => ({
              id: receipt.id,
              receivedDate: receipt.received_date,
              createdAt: receipt.created_at,
              locationName: receipt.vault_locations?.name ?? "Unknown Shopify location",
              lines: (receipt.vault_purchase_order_receipt_lines ?? []).map((line: SavedReceiptLine) => ({
                id: line.id,
                purchaseOrderLineId: line.purchase_order_line_id,
                productName: productNameByLine.get(line.purchase_order_line_id) ?? "Unknown PO line",
                quantityReceived: line.quantity_received,
                discrepancyNote: line.discrepancy_note,
                nonSellableQuantity: line.non_sellable_quantity,
                allocations: (line.vault_purchase_order_receipt_allocations ?? []).map((allocation) => ({
                  id: allocation.id,
                  variantId: allocation.variant_id,
                  size: receivingVariantById.get(allocation.variant_id)?.option_2 ?? "Unknown size",
                  quantityReceived: allocation.quantity_received,
                  postedQuantity: postedByAllocation.get(allocation.id) ?? 0,
                  postingBlocked: blockedPostingAllocations.has(allocation.id),
                })),
              })),
            }))}
            status={draft.status}
          />
        ) : null}

        <footer className="purchase-order-actions">
          <Link href="/purchase-orders">
            ← Back to Purchase Orders
          </Link>

          {draft.status === "draft" ? (
            <PurchaseOrderApprovalButton purchaseOrderId={draft.id} />
          ) : null}

          {draft.status === "draft" ? (
            <button
              disabled
              type="button"
              title="Approve this purchase order before supplier preparation."
            >
              Prepare Supplier Order
            </button>
          ) : null}
        </footer>
      </main>
    </VaultAppShell>
  );
}
