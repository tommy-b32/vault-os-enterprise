"use client";

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { savePurchaseOrderDraft } from "@/app/purchase-orders/actions";
import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { BuyingIntelligenceEngine } from "@/lib/brain/BuyingIntelligenceEngine";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import type { SupplierMinimum } from "@/lib/supplier/SupplierMinimum";

export type PurchaseOrderDraftLine = {
  id: string;
  supplierId: string;
  productName: string;
  supplierName: string;

  /**
   * Quantity is supplier packs.
   */
  suggestedQuantity: number;

  unitsPerPack: number | null;
  packCost: number | null;
  currency: string;

  demandStatus:
    | "ACTIVE"
    | "SLOW"
    | "DORMANT"
    | "NO_EVIDENCE"
    | null;

  urgency:
    | "CRITICAL"
    | "HIGH"
    | "MEDIUM"
    | "LOW"
    | null;

  demandScore: number | null;

  sales7Days: number | null;
  sales14Days: number | null;
  sales30Days: number | null;

  explanation: string;

  supplierMoqPacks: number | null;

  sourceType:
    | "required"
    | "bring_forward";
};

export type SupplierDraftOrder = {
  supplierId: string;
  supplierName: string;

  leadTimeDays: number | null;

  minimumOrderValue: number | null;
  minimumOrderPacks: number | null;
  minimumOrderCurrency: string;

  supplierMinimum: SupplierMinimum;

  currency: string;

  purchasingState:
    | "READY_TO_ORDER"
    | "MINIMUM_NOT_JUSTIFIED"
    | "BUILD_BASKET"
    | "NO_DEMAND";

  requiredPacks: number;
  advisoryPacks: number;
  intelligentBasketPacks: number;

  remainingShortfallPacks:
    | number
    | null;

  minimumSupportedByDemand: boolean;
  qualificationBlockers: string[];

  lines: PurchaseOrderDraftLine[];
};

type PurchaseOrderDraftWorkspaceProps = {
  orders: SupplierDraftOrder[];
  wallet: PurchasingWalletData | null;
  walletUnavailable: boolean;
};

type DraftSaveState =
  | {
      state: "idle";
    }
  | {
      state: "success";
      draftIds: string[];
    }
  | {
      state: "error";
      message: string;
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

function formatState(
  value: string,
): string {
  return value.replaceAll("_", " ");
}

function createIdempotencyKey(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function PurchaseOrderDraftWorkspace({
  orders,
  wallet,
  walletUnavailable,
}: PurchaseOrderDraftWorkspaceProps) {
  const [quantities, setQuantities] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      orders.flatMap((order) =>
        order.lines.map((line) => [
          `${order.supplierId}:${line.id}`,
          line.suggestedQuantity,
        ]),
      ),
    ),
  );

  const [saveState, setSaveState] =
    useState<DraftSaveState>({
      state: "idle",
    });

  const [isSaving, startSaving] =
    useTransition();

  const idempotencyKeys = useRef<
    Record<string, string>
  >({});

  const summary = useMemo(() => {
    const orderSummaries = orders.map(
      (order) => {
        const lines = order.lines.map(
          (line) => {
            const quantityKey =
              `${order.supplierId}:${line.id}`;

            const quantity =
              quantities[quantityKey] ??
              line.suggestedQuantity;

            const buying =
              BuyingIntelligenceEngine.analyse({
                id: line.id,
                productName:
                  line.productName,
                supplierName:
                  line.supplierName,
                packs: quantity,
                packCost: line.packCost,
                currency: line.currency,
              });

            return {
              line,
              quantity,
              estimatedCost:
                buying.estimatedCost,

              quantityChanged:
                quantity !==
                line.suggestedQuantity,

              moqSatisfied:
                line.supplierMoqPacks ===
                  null ||
                quantity >=
                  line.supplierMoqPacks,
            };
          },
        );

        const hasMissingCosts =
          lines.some(
            (entry) =>
              entry.estimatedCost ===
              null,
          );

        const totalCost =
          hasMissingCosts
            ? null
            : lines.reduce(
                (total, entry) =>
                  total +
                  (entry.estimatedCost ??
                    0),
                0,
              );

        const totalPacks =
          lines.reduce(
            (total, entry) =>
              total + entry.quantity,
            0,
          );

        const totalUnits =
          lines.reduce(
            (total, entry) =>
              total +
              (entry.line.unitsPerPack ===
              null
                ? 0
                : entry.quantity *
                  entry.line
                    .unitsPerPack),
            0,
          );

        const valueMinimumSatisfied =
          order.minimumOrderValue ===
            null ||
          order.minimumOrderCurrency !==
            order.currency ||
          totalCost === null
            ? null
            : totalCost >=
              order.minimumOrderValue;

        const packMinimumSatisfied =
          order.minimumOrderPacks ===
          null
            ? null
            : totalPacks >=
              order.minimumOrderPacks;

        return {
          order,
          lines,
          totalCost,
          totalPacks,
          totalUnits,
          valueMinimumSatisfied,
          packMinimumSatisfied,
        };
      },
    );

    const hasMissingOrderTotals =
      orderSummaries.some(
        (order) =>
          order.totalCost === null,
      );

    const basketCost =
      hasMissingOrderTotals
        ? null
        : orderSummaries.reduce(
            (total, order) =>
              total +
              (order.totalCost ?? 0),
            0,
          );

    const capital =
      wallet && basketCost !== null
        ? CapitalEngine.reviewPosition({
            ledgerBalanceGbp:
              wallet.ledger_balance_gbp,

            protectedReserveGbp:
              wallet.protected_reserve_gbp,

            committedOrdersGbp:
              wallet.committed_orders_gbp,

            manualSpendingLimitGbp:
              wallet.manual_spending_limit_gbp,

            proposedPurchaseGbp:
              basketCost,

            walletAvailable:
              !walletUnavailable,

            walletLastUpdated:
              wallet.wallet_last_updated,
          })
        : null;

    return {
      orders: orderSummaries,
      basketCost,
      capital,
    };
  }, [
    orders,
    quantities,
    wallet,
    walletUnavailable,
  ]);

  const lineCount = orders.reduce(
    (total, order) =>
      total + order.lines.length,
    0,
  );

  const requiredLineCount =
    orders.reduce(
      (total, order) =>
        total +
        order.lines.filter(
          (line) =>
            line.sourceType ===
            "required",
        ).length,
      0,
    );

  const bringForwardLineCount =
    lineCount - requiredLineCount;

  const hasMoqFailure =
    summary.orders.some((order) =>
      order.lines.some(
        (line) => !line.moqSatisfied,
      ),
    );

  async function persistDrafts() {
    setSaveState({
      state: "idle",
    });

    const draftIds: string[] = [];

    for (const supplierSummary of summary.orders) {
      const {
        order,
        lines,
        totalCost,
        totalPacks,
        totalUnits,
      } = supplierSummary;

      if (
        lines.some(
          (entry) =>
            !entry.moqSatisfied,
        )
      ) {
        throw new Error(
          `${order.supplierName} contains a quantity below its product MOQ.`,
        );
      }

      let idempotencyKey =
        idempotencyKeys.current[
          order.supplierId
        ];

      if (!idempotencyKey) {
        idempotencyKey =
          createIdempotencyKey();

        idempotencyKeys.current[
          order.supplierId
        ] = idempotencyKey;
      }

      const result =
        await savePurchaseOrderDraft({
          supplierId:
            order.supplierId,

          idempotencyKey,

          currency: order.currency,

          estimatedTotalGbp:
            totalCost,

          totalPacks,

          /*
           * Purchase Intelligence does not expose
           * Advisor confidence. Do not manufacture one.
           */
          recommendationConfidence:
            null,

          reasoning:
            `Draft saved from canonical Purchase Intelligence supplier basket for ${order.supplierName}.`,

          sourceSnapshot: {
            source:
              "purchase_intelligence",

            supplierId:
              order.supplierId,

            supplierName:
              order.supplierName,

            purchasingState:
              order.purchasingState,

            requiredPacks:
              order.requiredPacks,

            advisoryPacks:
              order.advisoryPacks,

            intelligentBasketPacks:
              order.intelligentBasketPacks,

            selectedTotalPacks:
              totalPacks,

            selectedTotalUnits:
              totalUnits,

            selectedEstimatedTotalGbp:
              totalCost,

            minimumOrderValue:
              order.minimumOrderValue,

            minimumOrderPacks:
              order.minimumOrderPacks,

            minimumOrderCurrency:
              order.minimumOrderCurrency,

            remainingShortfallPacks:
              order.remainingShortfallPacks,

            minimumSupportedByDemand:
              order.minimumSupportedByDemand,

            qualificationBlockers:
              order.qualificationBlockers,
          },

          lines: lines.map(
            ({
              line,
              quantity,
              estimatedCost,
            }) => ({
              styleId:
                line.id,

              productName:
                line.productName,

              supplierId:
                order.supplierId,

              recommendedPacks:
                quantity,

              recommendedUnits:
                line.unitsPerPack ===
                null
                  ? null
                  : quantity *
                    line.unitsPerPack,

              unitsPerPack:
                line.unitsPerPack,

              productMoqPacks:
                line.supplierMoqPacks,

              packCostGbp:
                line.packCost,

              lineCostGbp:
                estimatedCost,

              expectedProfitGbp:
                null,

              recommendationConfidence:
                null,

              recommendationPriority:
                line.urgency,

              sourceRecommendationType:
                line.sourceType ===
                "required"
                  ? "purchase_intelligence_required"
                  : "purchase_intelligence_bring_forward",

              sourceSnapshot: {
                source:
                  "purchase_intelligence",

                styleId:
                  line.id,

                productName:
                  line.productName,

                supplierName:
                  line.supplierName,

                sourceType:
                  line.sourceType,

                demandStatus:
                  line.demandStatus,

                urgency:
                  line.urgency,

                demandScore:
                  line.demandScore,

                sales7Days:
                  line.sales7Days,

                sales14Days:
                  line.sales14Days,

                sales30Days:
                  line.sales30Days,

                originalSuggestedPacks:
                  line.suggestedQuantity,

                selectedPacks:
                  quantity,

                quantityChanged:
                  quantity !==
                  line.suggestedQuantity,

                unitsPerPack:
                  line.unitsPerPack,

                explanation:
                  line.explanation,
              },
            }),
          ),
        });

      if (!result.success) {
        throw new Error(
          result.error,
        );
      }

      draftIds.push(
        result.draftId,
      );
    }

    return draftIds;
  }

  function handleSaveDraft() {
    startSaving(() => {
      void persistDrafts()
        .then((draftIds) => {
          setSaveState({
            state: "success",
            draftIds,
          });
        })
        .catch((error) => {
          setSaveState({
            state: "error",
            message:
              error instanceof Error
                ? error.message
                : "Purchase-order draft could not be saved.",
          });
        });
    });
  }

  return (
    <>
      <section className="purchase-order-context">
        <article>
          <span>
            Supplier baskets
          </span>

          <strong>
            {orders.length}
          </strong>

          <p>
            Canonical Supplier Basket
            Intelligence results.
          </p>
        </article>

        <article>
          <span>
            Required products
          </span>

          <strong>
            {requiredLineCount}
          </strong>

          <p>
            Products currently required for
            replenishment.
          </p>
        </article>

        <article>
          <span>
            Bring-forward options
          </span>

          <strong>
            {bringForwardLineCount}
          </strong>

          <p>
            Demand-supported additions selected
            toward supplier minimums.
          </p>
        </article>
      </section>

      {summary.orders.map(
        ({
          order,
          lines,
          totalCost,
          totalPacks,
          totalUnits,
          valueMinimumSatisfied,
          packMinimumSatisfied,
        }) => (
          <section
            className="purchase-order-supplier-draft"
            key={order.supplierId}
          >
            <div className="purchase-order-section-heading">
              <div>
                <p className="vault-eyebrow">
                  BUYING BASKET
                </p>

                <h2>
                  {order.supplierName}
                </h2>

                <p>
                  {order.leadTimeDays ===
                  null
                    ? "Lead time unavailable"
                    : `${order.leadTimeDays} day lead time`}

                  {" · "}

                  {formatState(
                    order.purchasingState,
                  )}
                </p>
              </div>

              <span>
                {lines.length}{" "}
                {lines.length === 1
                  ? "line"
                  : "lines"}
              </span>
            </div>

            <div className="purchase-order-supplier-totals">
              <div>
                <span>
                  Required packs
                </span>

                <strong>
                  {order.requiredPacks}
                </strong>
              </div>

              <div>
                <span>
                  Bring-forward packs
                </span>

                <strong>
                  {order.advisoryPacks}
                </strong>
              </div>

              <div>
                <span>
                  Intelligent basket
                </span>

                <strong>
                  {
                    order.intelligentBasketPacks
                  }{" "}
                  packs
                </strong>
              </div>
            </div>

            {order.purchasingState ===
              "MINIMUM_NOT_JUSTIFIED" ? (
              <p className="purchase-order-source-warning">
                Current demand does not justify
                enough additional products to
                reach the supplier minimum.
                Saving remains a draft only and
                does not place an order.
              </p>
            ) : null}

            {order.qualificationBlockers.length > 0 ? (
              <div className="purchase-order-source-warning">
                <strong>Approval blockers</strong>
                <ul>
                  {order.qualificationBlockers.map((reason) => (
                    <li key={reason}>{reason.replaceAll("_", " ")}</li>
                  ))}
                </ul>
                <p>This basket may be saved as preparation, but these gates will be rerun before approval.</p>
              </div>
            ) : null}

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
                <span>Demand</span>
                <span>Urgency</span>
              </div>

              {lines.map(
                ({
                  line,
                  quantity,
                  estimatedCost,
                  moqSatisfied,
                }) => {
                  const quantityKey =
                    `${order.supplierId}:${line.id}`;

                  return (
                    <article
                      className="purchase-order-editable-line"
                      key={quantityKey}
                    >
                      <div className="purchase-order-product-cell">
                        <strong>
                          {line.productName}
                        </strong>

                        <span>
                          {line.sourceType ===
                          "required"
                            ? "Required replenishment"
                            : "Demand-supported bring-forward"}
                        </span>

                        <p>
                          {line.explanation}
                        </p>
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Packs
                        </span>

                        <small>
                          Suggested{" "}
                          {
                            line.suggestedQuantity
                          }
                        </small>

                        <input
                          aria-label={`Pack quantity for ${line.productName}`}
                          min={1}
                          onChange={(
                            event,
                          ) => {
                            const next =
                              Math.max(
                                1,
                                Number(
                                  event
                                    .target
                                    .value,
                                ) || 1,
                              );

                            delete idempotencyKeys
                              .current[
                              line.supplierId
                            ];

                            setSaveState({
                              state:
                                "idle",
                            });

                            setQuantities(
                              (
                                current,
                              ) => ({
                                ...current,
                                [quantityKey]:
                                  next,
                              }),
                            );
                          }}
                          step={1}
                          type="number"
                          value={quantity}
                        />

                        {!moqSatisfied ? (
                          <small className="is-warning">
                            Below product MOQ
                          </small>
                        ) : null}
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Units
                        </span>

                        <strong>
                          {line.unitsPerPack ===
                          null
                            ? "Unavailable"
                            : quantity *
                              line.unitsPerPack}
                        </strong>

                        {line.unitsPerPack !==
                        null ? (
                          <small>
                            {
                              line.unitsPerPack
                            }{" "}
                            per pack
                          </small>
                        ) : null}
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Pack cost
                        </span>

                        <strong>
                          {line.packCost ===
                          null
                            ? "Unavailable"
                            : formatCurrency(
                                line.packCost,
                                line.currency,
                              )}
                        </strong>
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Line cost
                        </span>

                        <strong>
                          {estimatedCost ===
                          null
                            ? "Unavailable"
                            : formatCurrency(
                                estimatedCost,
                                line.currency,
                              )}
                        </strong>
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Demand
                        </span>

                        <strong>
                          {line.demandStatus ??
                            "Unavailable"}
                        </strong>

                        {line.demandScore !==
                        null ? (
                          <small>
                            Score{" "}
                            {
                              line.demandScore
                            }
                          </small>
                        ) : null}
                      </div>

                      <div>
                        <span className="purchase-order-mobile-label">
                          Urgency
                        </span>

                        <strong
                          className={
                            line.urgency ===
                              "CRITICAL" ||
                            line.urgency ===
                              "HIGH"
                              ? "is-warning"
                              : "is-ready"
                          }
                        >
                          {line.urgency ??
                            "Not applicable"}
                        </strong>
                      </div>
                    </article>
                  );
                },
              )}
            </div>

            <div className="purchase-order-supplier-totals">
              <div>
                <span>
                  Supplier basket cost
                </span>

                <strong>
                  {totalCost === null
                    ? "Unavailable"
                    : formatCurrency(
                        totalCost,
                        order.currency,
                      )}
                </strong>
              </div>

              <div>
                <span>
                  Total packs / units
                </span>

                <strong>
                  {totalPacks} packs
                  {totalUnits > 0
                    ? ` / ${totalUnits} units`
                    : ""}
                </strong>
              </div>

              <div>
                <span>
                  Supplier pack minimum
                </span>

                <strong
                  className={
                    packMinimumSatisfied ===
                    false
                      ? "is-warning"
                      : "is-ready"
                  }
                >
                  {order.minimumOrderPacks ===
                  null
                    ? "Unavailable"
                    : order.minimumOrderPacks ===
                        0
                      ? "Not applicable"
                      : packMinimumSatisfied
                        ? "Satisfied"
                        : `${order.minimumOrderPacks} packs required`}
                </strong>
              </div>

              <div>
                <span>
                  Supplier value minimum
                </span>

                <strong
                  className={
                    valueMinimumSatisfied ===
                    false
                      ? "is-warning"
                      : "is-ready"
                  }
                >
                  {order.minimumOrderValue ===
                  null
                    ? "Unavailable"
                    : valueMinimumSatisfied ===
                        null
                      ? "Comparison unavailable"
                      : valueMinimumSatisfied
                        ? "Satisfied"
                        : formatCurrency(
                            order.minimumOrderValue,
                            order.minimumOrderCurrency,
                          )}
                </strong>
              </div>
            </div>
          </section>
        ),
      )}

      <section className="purchase-order-wallet">
        <div className="purchase-order-section-heading">
          <div>
            <p className="vault-eyebrow">
              ORDER SUMMARY
            </p>

            <h2>
              Purchasing wallet impact
            </h2>
          </div>

          <span>
            {summary.capital
              ? formatState(
                  summary.capital.state,
                )
              : "Unavailable"}
          </span>
        </div>

        <div className="purchase-order-wallet-grid">
          <article>
            <span>
              Total basket cost
            </span>

            <strong>
              {summary.basketCost === null
                ? "Unavailable"
                : formatCurrency(
                    summary.basketCost,
                  )}
            </strong>
          </article>

          <article>
            <span>
              Reserve-safe capacity remaining
            </span>

            <strong>
              {summary.capital
                ? formatCurrency(
                    summary.capital
                      .remainingPurchasingPowerGbp,
                  )
                : "Unavailable"}
            </strong>
          </article>

          <article>
            <span>
              Cash after purchase
            </span>

            <strong>
              {summary.capital
                ? formatCurrency(
                    summary.capital
                      .projectedCashAfterPurchaseGbp,
                  )
                : "Unavailable"}
            </strong>
          </article>

          <article>
            <span>
              Protected reserve
            </span>

            <strong>
              {summary.capital
                ? summary.capital
                    .reserveProtected
                  ? "Protected"
                  : "Not protected"
                : "Unavailable"}
            </strong>
          </article>
        </div>

        {walletUnavailable ? (
          <p className="purchase-order-source-warning">
            Purchasing wallet data is currently
            unavailable.
          </p>
        ) : summary.capital ? (
          <p className="purchase-order-capital-guidance">
            {summary.capital.explanation}
          </p>
        ) : null}
      </section>

      {saveState.state === "success" ? (
        <section className="purchase-order-capital-guidance">
          <strong>
            Draft saved successfully.
          </strong>

          <p>
            {saveState.draftIds.length ===
            1
              ? "1 supplier purchase-order draft has been saved."
              : `${saveState.draftIds.length} supplier purchase-order drafts have been saved.`}
          </p>
        </section>
      ) : null}

      {saveState.state === "error" ? (
        <p className="purchase-order-source-warning">
          {saveState.message}
        </p>
      ) : null}

      <footer className="purchase-order-actions">
        <Link href="/purchase-intelligence">
          Review Purchase Intelligence
        </Link>

        <button
          disabled={
            isSaving ||
            hasMoqFailure ||
            summary.orders.length === 0
          }
          onClick={handleSaveDraft}
          type="button"
          title={
            hasMoqFailure
              ? "Resolve quantities below product MOQ before saving."
              : "Save the current canonical supplier baskets as durable purchase-order drafts."
          }
        >
          {isSaving
            ? "Saving Draft..."
            : "Save Draft"}
        </button>

        <button
          disabled
          type="button"
          title="PDF export is not connected yet"
        >
          Export PDF
        </button>

        <button
          disabled
          type="button"
          title="WhatsApp order generation is not connected yet"
        >
          Generate WhatsApp Order
        </button>
      </footer>
    </>
  );
}
