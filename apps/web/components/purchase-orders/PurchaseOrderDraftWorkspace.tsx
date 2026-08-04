"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PurchasingWalletData } from "@/components/commercial/PurchasingWallet";
import { BuyingIntelligenceEngine } from "@/lib/brain/BuyingIntelligenceEngine";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";

export type PurchaseOrderDraftLine = {
  id: string;
  productName: string;
  supplierName: string;
  suggestedQuantity: number;
  packCost: number | null;
  currency: string;
  expectedProfit: number | null;
  confidence: number;
  explanation: string;
  priority: string;
  supplierMoqPacks: number | null;
};

export type SupplierDraftOrder = {
  supplierName: string;
  leadTimeDays: number | null;
  minimumOrderValue: number | null;
  minimumOrderCurrency: string;
  currency: string;
  lines: PurchaseOrderDraftLine[];
};

type PurchaseOrderDraftWorkspaceProps = {
  orders: SupplierDraftOrder[];
  advisorConfidence: number | null;
  wallet: PurchasingWalletData | null;
  walletUnavailable: boolean;
};

function formatCurrency(value: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatState(value: string): string {
  return value.replaceAll("_", " ");
}

export function PurchaseOrderDraftWorkspace({
  orders,
  advisorConfidence,
  wallet,
  walletUnavailable,
}: PurchaseOrderDraftWorkspaceProps) {
  const [quantities, setQuantities] = useState<
    Record<string, number>
  >(() =>
    Object.fromEntries(
      orders.flatMap((order) =>
        order.lines.map((line) => [
          line.id,
          line.suggestedQuantity,
        ]),
      ),
    ),
  );

  const summary = useMemo(() => {
    const orderSummaries = orders.map((order) => {
      const lines = order.lines.map((line) => {
        const quantity = quantities[line.id] ?? line.suggestedQuantity;
        const buying = BuyingIntelligenceEngine.analyse({
          id: line.id,
          productName: line.productName,
          supplierName: line.supplierName,
          packs: quantity,
          packCost: line.packCost,
          currency: line.currency,
        });

        return {
          line,
          quantity,
          estimatedCost: buying.estimatedCost,
          quantityChanged: quantity !== line.suggestedQuantity,
          moqSatisfied:
            line.supplierMoqPacks === null ||
            quantity >= line.supplierMoqPacks,
        };
      });
      const hasMissingCosts = lines.some(
        (entry) => entry.estimatedCost === null,
      );
      const totalCost = hasMissingCosts
        ? null
        : lines.reduce(
            (total, entry) => total + (entry.estimatedCost ?? 0),
            0,
          );
      const minimumOrderSatisfied =
        order.minimumOrderValue === null ||
        order.minimumOrderCurrency !== order.currency ||
        totalCost === null
          ? null
          : totalCost >= order.minimumOrderValue;

      return {
        order,
        lines,
        totalCost,
        minimumOrderSatisfied,
      };
    });
    const hasMissingOrderTotals = orderSummaries.some(
      (order) => order.totalCost === null,
    );
    const basketCost = hasMissingOrderTotals
      ? null
      : orderSummaries.reduce(
          (total, order) => total + (order.totalCost ?? 0),
          0,
        );
    const capital =
      wallet && basketCost !== null
        ? CapitalEngine.reviewPosition({
            ledgerBalanceGbp: wallet.ledger_balance_gbp,
            protectedReserveGbp: wallet.protected_reserve_gbp,
            committedOrdersGbp: wallet.committed_orders_gbp,
            manualSpendingLimitGbp: wallet.manual_spending_limit_gbp,
            proposedPurchaseGbp: basketCost,
          })
        : null;

    return {
      orders: orderSummaries,
      basketCost,
      capital,
    };
  }, [orders, quantities, wallet]);

  const lineCount = orders.reduce(
    (total, order) => total + order.lines.length,
    0,
  );

  return (
    <>
      <section className="purchase-order-context">
        <article>
          <span>Draft supplier orders</span>
          <strong>{orders.length}</strong>
          <p>Advisor recommendations grouped by canonical supplier.</p>
        </article>
        <article>
          <span>Recommended products</span>
          <strong>{lineCount}</strong>
          <p>Existing qualifying Advisor recommendations.</p>
        </article>
        <article>
          <span>Advisor confidence</span>
          <strong>
            {advisorConfidence !== null
              ? `${advisorConfidence}%`
              : "Not ready"}
          </strong>
          <p>Average confidence from the staged recommendations.</p>
        </article>
      </section>

      {summary.orders.map(({ order, lines, totalCost, minimumOrderSatisfied }) => (
        <section className="purchase-order-supplier-draft" key={order.supplierName}>
          <div className="purchase-order-section-heading">
            <div>
              <p className="vault-eyebrow">Draft Purchase Order</p>
              <h2>{order.supplierName}</h2>
              <p>
                {order.leadTimeDays === null
                  ? "Lead time unavailable"
                  : `${order.leadTimeDays} day lead time`}
                {order.minimumOrderValue === null
                  ? " · Minimum order unavailable"
                  : ` · Minimum order ${formatCurrency(
                      order.minimumOrderValue,
                      order.minimumOrderCurrency,
                    )}`}
              </p>
            </div>
            <span>{lines.length} lines</span>
          </div>

          <div className="purchase-order-lines-table">
            <div className="purchase-order-lines-head" aria-hidden="true">
              <span>Product</span>
              <span>Quantity</span>
              <span>Supplier cost</span>
              <span>Line cost</span>
              <span>Expected profit</span>
              <span>Confidence</span>
              <span>Status</span>
            </div>

            {lines.map(({ line, quantity, estimatedCost, quantityChanged, moqSatisfied }) => (
              <article className="purchase-order-editable-line" key={line.id}>
                <div className="purchase-order-product-cell">
                  <strong>{line.productName}</strong>
                  <span>{line.supplierName}</span>
                  <p>{line.explanation}</p>
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Quantity
                  </span>
                  <small>Suggested {line.suggestedQuantity}</small>
                  <input
                    aria-label={`Quantity for ${line.productName}`}
                    min={1}
                    onChange={(event) => {
                      const next = Math.max(1, Number(event.target.value) || 1);
                      setQuantities((current) => ({
                        ...current,
                        [line.id]: next,
                      }));
                    }}
                    type="number"
                    value={quantity}
                  />
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Supplier cost
                  </span>
                  <strong>
                    {line.packCost === null
                      ? "Unavailable"
                      : formatCurrency(line.packCost, line.currency)}
                  </strong>
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Line cost
                  </span>
                  <strong>
                    {estimatedCost === null
                      ? "Unavailable"
                      : formatCurrency(estimatedCost, line.currency)}
                  </strong>
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Expected profit
                  </span>
                  <strong>
                    {line.expectedProfit === null
                      ? "Unavailable"
                      : formatCurrency(line.expectedProfit)}
                  </strong>
                  {quantityChanged && line.expectedProfit !== null ? (
                    <small>At suggested quantity</small>
                  ) : null}
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Confidence
                  </span>
                  <strong>{line.confidence}%</strong>
                </div>
                <div>
                  <span className="purchase-order-mobile-label">
                    Status
                  </span>
                  <strong className={moqSatisfied ? "is-ready" : "is-warning"}>
                    {moqSatisfied
                      ? formatState(line.priority)
                      : "Below MOQ"}
                  </strong>
                </div>
              </article>
            ))}
          </div>

          <div className="purchase-order-supplier-totals">
            <div>
              <span>Supplier order total</span>
              <strong>
                {totalCost === null
                  ? "Unavailable"
                  : formatCurrency(totalCost, order.currency)}
              </strong>
            </div>
            <div>
              <span>Supplier minimum order</span>
              <strong className={minimumOrderSatisfied === false ? "is-warning" : "is-ready"}>
                {order.minimumOrderValue === null
                  ? "Unavailable"
                  : minimumOrderSatisfied === null
                    ? "Currency comparison unavailable"
                    : minimumOrderSatisfied
                    ? "Satisfied"
                    : "Attention required"}
              </strong>
            </div>
          </div>

          {lines.some((entry) => !entry.moqSatisfied) ? (
            <p className="purchase-order-source-warning">
              One or more quantities are below the existing product MOQ.
            </p>
          ) : null}
        </section>
      ))}

      <section className="purchase-order-wallet">
        <div className="purchase-order-section-heading">
          <div>
            <p className="vault-eyebrow">Order Summary</p>
            <h2>Purchasing wallet impact</h2>
          </div>
          <span>
            {summary.capital
              ? formatState(summary.capital.state)
              : "Unavailable"}
          </span>
        </div>

        <div className="purchase-order-wallet-grid">
          <article>
            <span>Total basket cost</span>
            <strong>
              {summary.basketCost === null
                ? "Unavailable"
                : formatCurrency(summary.basketCost)}
            </strong>
          </article>
          <article>
            <span>Reserve-safe capacity remaining</span>
            <strong>
              {summary.capital
                ? formatCurrency(summary.capital.remainingPurchasingPowerGbp)
                : "Unavailable"}
            </strong>
          </article>
          <article>
            <span>Cash after purchase</span>
            <strong>
              {summary.capital
                ? formatCurrency(summary.capital.projectedCashAfterPurchaseGbp)
                : "Unavailable"}
            </strong>
          </article>
          <article>
            <span>Protected reserve</span>
            <strong>
              {summary.capital
                ? summary.capital.reserveProtected
                  ? "Protected"
                  : "Not protected"
                : "Unavailable"}
            </strong>
          </article>
        </div>

        {walletUnavailable ? (
          <p className="purchase-order-source-warning">
            Purchasing wallet data is currently unavailable.
          </p>
        ) : summary.capital ? (
          <p className="purchase-order-capital-guidance">
            {summary.capital.explanation}
          </p>
        ) : null}
      </section>

      <footer className="purchase-order-actions">
        <Link href="/supplier-catalogue/review">Review Basket</Link>
        <button disabled type="button" title="Draft persistence is not connected yet">
          Save Draft
        </button>
        <button disabled type="button" title="PDF export is not connected yet">
          Export PDF
        </button>
        <button disabled type="button" title="WhatsApp order generation is not connected yet">
          Generate WhatsApp Order
        </button>
      </footer>
    </>
  );
}
