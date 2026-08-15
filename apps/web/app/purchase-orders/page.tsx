import Link from "next/link";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import VaultAppShell from "@/components/layout/VaultAppShell";
import {
  PurchaseOrderDraftWorkspace,
  type SupplierDraftOrder,
} from "@/components/purchase-orders/PurchaseOrderDraftWorkspace";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import {
  PurchaseIntelligenceEngine,
  type PurchaseIntelligenceSupplier,
} from "@/lib/brain/PurchaseIntelligenceEngine";
import { getCatalogueData } from "@/lib/catalogue";
import { InventorySyncRepository } from "@/lib/inventory/InventorySyncRepository";
import { getPurchaseOrders } from "@/lib/purchase-orders/PurchaseOrderRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";

export const dynamic = "force-dynamic";

type SupplierRow = {
  id: string;
  supplier_name: string;
  is_active: boolean;
  default_lead_time_days: number | null;
  minimum_order_value: number | null;
  currency_code: string | null;
};

type SupplierRuleRow = {
  supplier_id: string;
  minimum_order_packs: number | null;
};

function formatCurrency(
  value: number,
  currency = "GBP",
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function PurchaseOrdersPage() {
  await requireAuthenticatedOperator();

  const savedDraftsPromise = getPurchaseOrders();

  const [
    catalogue,
    freshness,
    walletResult,
    suppliersResult,
    rulesResult,
  ] = await Promise.all([
    getCatalogueData(),
    InventorySyncRepository.getFreshness(),

    supabaseAdmin
      .from("vault_purchasing_wallet")
      .select(`
        ledger_balance_gbp,
        protected_reserve_gbp,
        committed_orders_gbp,
        calculated_purchasing_power_gbp,
        available_purchasing_power_gbp,
        manual_spending_limit_gbp,
        reserve_override_allowed,
        wallet_last_updated,
        wallet_freshness_threshold_minutes,
        purchasing_power_state
      `)
      .single(),

    supabaseAdmin
      .from("vault_suppliers")
      .select(`
        id,
        supplier_name,
        is_active,
        default_lead_time_days,
        minimum_order_value,
        currency_code
      `)
      .order("supplier_name", {
        ascending: true,
      }),

    supabaseAdmin
      .from("vault_supplier_purchasing_rules")
      .select(`
        supplier_id,
        minimum_order_packs
      `),
  ]);

  const sourceError =
    walletResult.error ??
    suppliersResult.error ??
    rulesResult.error;

  if (sourceError) {
    throw new Error(
      `Unable to load purchase-order intelligence: ${sourceError.message}`,
    );
  }

  const wallet =
    walletResult.data as PurchasingWalletData;

  const supplierRows =
    (suppliersResult.data ?? []) as SupplierRow[];

  const supplierRules =
    (rulesResult.data ?? []) as SupplierRuleRow[];

  const minimumPacksBySupplier = new Map(
    supplierRules.map((rule) => [
      rule.supplier_id,
      rule.minimum_order_packs,
    ]),
  );

  const suppliers: PurchaseIntelligenceSupplier[] =
    supplierRows.map((supplier) => ({
      id: supplier.id,
      name: supplier.supplier_name,
      active: supplier.is_active,
      currency: supplier.currency_code,
      minimumOrderValue:
        supplier.minimum_order_value,
      minimumOrderPacks:
        minimumPacksBySupplier.get(
          supplier.id,
        ) ?? null,
    }));

  const evaluation =
    PurchaseIntelligenceEngine.evaluate({
      products: catalogue.products,
      suppliers,
      wallet,
      inventoryTrusted:
        freshness.syncStatus === "current",
    });

  const demandByStyle = new Map(
    evaluation.demands.map((demand) => [
      demand.styleId,
      demand,
    ]),
  );

  const productByStyle = new Map(
    catalogue.products.map((product) => [
      product.style_id,
      product,
    ]),
  );

  const supplierRowById = new Map(
    supplierRows.map((supplier) => [
      supplier.id,
      supplier,
    ]),
  );

  const orders: SupplierDraftOrder[] =
    evaluation.baskets
      .filter(
        (basket) =>
          basket.top_products.length > 0 ||
          basket.additional_qualifying_products
            .length > 0,
      )
      .map((basket) => {
        const supplier =
          supplierRowById.get(
            basket.supplier.id,
          );

        const supplierMinimum =
          SupplierMinimumContract.create({
            value:
              basket.supplier_minimum_value,
            currency:
              basket.supplier.currency,
            minimumOrderPacks:
              basket.supplier_minimum_packs,
          });

        const requiredLines =
          basket.top_products.map(
            (basketProduct) => {
              const product =
                productByStyle.get(
                  basketProduct.style_id,
                );

              const demand =
                demandByStyle.get(
                  basketProduct.style_id,
                );

              return {
                id: basketProduct.style_id,
                supplierId:
                  basket.supplier.id,
                productName:
                  basketProduct.product_name,
                supplierName:
                  basket.supplier.name,

                suggestedQuantity:
                  basketProduct.required_packs,

                unitsPerPack:
                  demand?.unitsPerPack ??
                  product?.commercial_cost
                    .units_per_pack ??
                  null,

                packCost:
                  product?.commercial_cost
                    .landed_cost_per_pack_gbp ??
                  null,

                currency: "GBP",

                demandStatus:
                  demand?.demand_status ??
                  null,

                urgency:
                  demand?.urgency ?? null,

                demandScore:
                  demand?.demand_score ??
                  null,

                sales7Days:
                  demand?.sales7Days ??
                  null,

                sales14Days:
                  demand?.sales14Days ??
                  null,

                sales30Days:
                  demand?.sales30Days ??
                  null,

                explanation:
                  "Currently required for replenishment by canonical Purchase Intelligence.",

                supplierMoqPacks:
                  demand?.productMoqPacks ??
                  product?.supplier_moq_packs ??
                  null,

                sourceType:
                  "required" as const,
              };
            },
          );

        const bringForwardLines =
          basket.additional_qualifying_products.map(
            (basketProduct) => {
              const product =
                productByStyle.get(
                  basketProduct.style_id,
                );

              const demand =
                demandByStyle.get(
                  basketProduct.style_id,
                );

              return {
                id: basketProduct.style_id,
                supplierId:
                  basket.supplier.id,
                productName:
                  basketProduct.product_name,
                supplierName:
                  basket.supplier.name,

                suggestedQuantity:
                  basketProduct.required_packs,

                unitsPerPack:
                  demand?.unitsPerPack ??
                  product?.commercial_cost
                    .units_per_pack ??
                  null,

                packCost:
                  product?.commercial_cost
                    .landed_cost_per_pack_gbp ??
                  null,

                currency: "GBP",

                demandStatus:
                  demand?.demand_status ??
                  null,

                urgency:
                  demand?.urgency ?? null,

                demandScore:
                  demand?.demand_score ??
                  null,

                sales7Days:
                  demand?.sales7Days ??
                  null,

                sales14Days:
                  demand?.sales14Days ??
                  null,

                sales30Days:
                  demand?.sales30Days ??
                  null,

                explanation:
                  "Demand-supported bring-forward option selected by Supplier Basket Intelligence.",

                supplierMoqPacks:
                  demand?.productMoqPacks ??
                  product?.supplier_moq_packs ??
                  null,

                sourceType:
                  "bring_forward" as const,
              };
            },
          );

        return {
          qualificationBlockers:
            evaluation.qualifications.find((entry) => entry.supplier.id === basket.supplier.id)?.blockers ?? [],

          supplierId:
            basket.supplier.id,

          supplierName:
            basket.supplier.name,

          leadTimeDays:
            supplier?.default_lead_time_days ??
            null,

          minimumOrderValue:
            basket.supplier_minimum_value,

          minimumOrderPacks:
            basket.supplier_minimum_packs,

          minimumOrderCurrency:
            basket.supplier.currency ??
            "GBP",

          supplierMinimum,

          currency: "GBP",

          purchasingState:
            basket.purchasing_state,

          requiredPacks:
            basket.required_packs,

          advisoryPacks:
            basket.advisory_supported_packs,

          intelligentBasketPacks:
            basket.intelligent_basket_packs,

          remainingShortfallPacks:
            basket.remaining_shortfall_packs,

          minimumSupportedByDemand:
            basket.minimum_supported_by_demand,

          lines: [
            ...requiredLines,
            ...bringForwardLines,
          ],
        };
      });

  const savedDrafts =
    await savedDraftsPromise;

  return (
    <VaultAppShell>
      <main className="purchase-order-page">
        <header className="purchase-order-header">
          <div>
            <p className="vault-eyebrow">
              PURCHASE ORDERS
            </p>

            <h1>
              Purchase Order Builder
            </h1>

            <p>
              Build durable supplier drafts from
              canonical Purchase Intelligence and
              Supplier Basket recommendations.
            </p>
          </div>

          <span className="purchase-order-state">
            {orders.length > 0
              ? `${orders.length} supplier ${
                  orders.length === 1
                    ? "basket"
                    : "baskets"
                } available`
              : "No buying basket"}
          </span>
        </header>

        {orders.length > 0 ? (
          <PurchaseOrderDraftWorkspace
            orders={orders}
            wallet={wallet}
            walletUnavailable={false}
          />
        ) : (
          <section className="purchase-order-empty purchase-order-readiness-empty">
            <p className="vault-eyebrow">
              PURCHASE INTELLIGENCE
            </p>

            <h2>
              No supplier buying basket is
              currently available
            </h2>

            <p>
              No canonical Supplier Basket
              currently contains replenishment
              or demand-supported bring-forward
              products.
            </p>

            <Link href="/purchase-intelligence">
              Review Purchase Intelligence →
            </Link>
          </section>
        )}

        <section className="purchase-order-saved-section">
          <div className="purchase-order-section-heading">
            <div>
              <p className="vault-eyebrow">
                SAVED PURCHASE ORDERS
              </p>

              <h2>Saved purchase orders</h2>

              <p>
                Durable draft and approved snapshots of buying baskets.
              </p>
            </div>

            <span>
              {savedDrafts.length}{" "}
              {savedDrafts.length === 1
                ? "order"
                : "orders"}
            </span>
          </div>

          {savedDrafts.length === 0 ? (
            <section className="purchase-order-empty">
              <h3>
                No saved purchase-order drafts yet
              </h3>

              <p>
                Use Save Draft on a buying basket
                to create the first durable
                purchase order.
              </p>
            </section>
          ) : (
            <div className="purchase-order-saved-grid">
              {savedDrafts.map((draft) => {
                const supplierName =
                  draft.vault_suppliers?.[0]?.supplier_name ??
                  "Unknown supplier";

                const lines =
                  draft.vault_purchase_order_lines ??
                  [];

                const totalUnits =
                  lines.reduce(
                    (total, line) =>
                      total +
                      (line.recommended_units ??
                        0),
                    0,
                  );

                const requiredLines =
                  lines.filter(
                    (line) =>
                      line.source_recommendation_type ===
                      "purchase_intelligence_required",
                  ).length;

                const bringForwardLines =
                  lines.filter(
                    (line) =>
                      line.source_recommendation_type ===
                      "purchase_intelligence_bring_forward",
                  ).length;

                return (
                  <Link
                    className="purchase-order-saved-card"
                    href={`/purchase-orders/${draft.id}`}
                    key={draft.id}
                  >
                    <div className="purchase-order-section-heading">
                      <div>
                        <p className="vault-eyebrow">
                          {draft.status.toUpperCase()}
                        </p>

                        <h3>
                          {supplierName}
                        </h3>
                      </div>

                      <span>
                        {formatDate(
                          draft.created_at,
                        )}
                      </span>
                    </div>

                    <div className="purchase-order-supplier-totals">
                      <div>
                        <span>
                          Total cost
                        </span>

                        <strong>
                          {draft.estimated_total_gbp ===
                          null
                            ? "Unavailable"
                            : formatCurrency(
                                draft.estimated_total_gbp,
                                draft.currency ??
                                  "GBP",
                              )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Packs / units
                        </span>

                        <strong>
                          {draft.total_packs ??
                            0}{" "}
                          packs
                          {totalUnits > 0
                            ? ` / ${totalUnits} units`
                            : ""}
                        </strong>
                      </div>

                      <div>
                        <span>Lines</span>

                        <strong>
                          {lines.length}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Required /
                          bring-forward
                        </span>

                        <strong>
                          {requiredLines} /{" "}
                          {bringForwardLines}
                        </strong>
                      </div>
                    </div>

                    <p>
                      Open saved purchase order →
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </VaultAppShell>
  );
}
