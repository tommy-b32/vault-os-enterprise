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

export default async function PurchaseOrdersPage() {
  await requireAuthenticatedOperator();

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

  /*
   * IMPORTANT:
   *
   * Purchase Orders consumes the exact same canonical
   * Purchase Intelligence evaluation as
   * /purchase-intelligence.
   *
   * There is no separate Advisor buying calculation here.
   */
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
                  demand?.demand_score ?? null,

                sales7Days:
                  demand?.sales7Days ?? null,

                sales14Days:
                  demand?.sales14Days ?? null,

                sales30Days:
                  demand?.sales30Days ?? null,

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
                  demand?.demand_score ?? null,

                sales7Days:
                  demand?.sales7Days ?? null,

                sales14Days:
                  demand?.sales14Days ?? null,

                sales30Days:
                  demand?.sales30Days ?? null,

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
            basket.supplier.currency ?? "GBP",

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

  return (
    <VaultAppShell>
      <main className="purchase-order-page">
        <header className="purchase-order-header">
          <div>
            <p className="vault-eyebrow">
              PURCHASE ORDERS
            </p>

            <h1>Purchase Order Builder</h1>

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
              No supplier buying basket is currently
              available
            </h2>

            <p>
              No canonical Supplier Basket currently
              contains replenishment or
              demand-supported bring-forward products.
            </p>

            <a href="/purchase-intelligence">
              Review Purchase Intelligence &rarr;
            </a>
          </section>
        )}
      </main>
    </VaultAppShell>
  );
}