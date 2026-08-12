import Link from "next/link";
import { notFound } from "next/navigation";

import VaultAppShell from "@/components/layout/VaultAppShell";
import { PurchaseOrderApprovalButton } from "@/components/purchase-orders/PurchaseOrderApprovalButton";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getPurchaseOrder } from "@/lib/purchase-orders/PurchaseOrderRepository";

export const dynamic = "force-dynamic";

type SavedPurchaseOrderLine = {
  id: string;
  product_name: string;
  recommended_packs: number;
  recommended_units: number | null;
  units_per_pack: number | null;
  pack_cost_gbp: number | null;
  line_cost_gbp: number | null;
  source_recommendation_type: string;
  recommendation_priority: string | null;
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

          {draft.status === "approved" && draft.approved_at ? (
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

        <footer className="purchase-order-actions">
          <Link href="/purchase-orders">
            ← Back to Purchase Orders
          </Link>

          {draft.status === "draft" ? (
            <PurchaseOrderApprovalButton purchaseOrderId={draft.id} />
          ) : null}

          <button
            disabled
            type="button"
            title="Supplier issue workflow will be added in a later sprint."
          >
            Send to Supplier
          </button>
        </footer>
      </main>
    </VaultAppShell>
  );
}
