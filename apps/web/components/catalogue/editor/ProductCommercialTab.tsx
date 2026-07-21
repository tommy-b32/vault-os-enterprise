"use client";

import {
  useMemo,
  useState,
} from "react";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type ProductCommercialTabProps = {
  product: CatalogueProduct;
};

function toNumber(
  value: string,
  fallback = 0,
): number {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

function formatCurrency(
  value: number,
  currency: string,
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getEfficiencyState(
  returnOnCapital: number | null,
): {
  label: string;
  stars: number;
} {
  if (returnOnCapital === null) {
    return {
      label: "Awaiting data",
      stars: 0,
    };
  }

  if (returnOnCapital >= 200) {
    return {
      label: "Excellent",
      stars: 5,
    };
  }

  if (returnOnCapital >= 150) {
    return {
      label: "Strong",
      stars: 4,
    };
  }

  if (returnOnCapital >= 100) {
    return {
      label: "Healthy",
      stars: 3,
    };
  }

  if (returnOnCapital >= 50) {
    return {
      label: "Weak",
      stars: 2,
    };
  }

  return {
    label: "Poor",
    stars: 1,
  };
}

export function ProductCommercialTab({
  product,
}: ProductCommercialTabProps) {
  const commercial = product.commercial_cost;

  const [currency, setCurrency] =
    useState(commercial.currency ?? "GBP");

  const [
    exchangeRateToGbp,
    setExchangeRateToGbp,
  ] = useState(
    String(
      commercial.exchange_rate_to_gbp ?? 1,
    ),
  );

  const [packCost, setPackCost] =
    useState(
      commercial.pack_cost === null
        ? ""
        : String(commercial.pack_cost),
    );

  const [shippingCost, setShippingCost] =
    useState(
      commercial.shipping_cost_per_pack === null
        ? ""
        : String(
            commercial.shipping_cost_per_pack,
          ),
    );

  const [importCost, setImportCost] =
    useState(
      commercial.import_cost_per_pack === null
        ? ""
        : String(
            commercial.import_cost_per_pack,
          ),
    );

  const [averageSellingPrice, setAverageSellingPrice] =
    useState(
      commercial.average_selling_price === null
        ? ""
        : String(
            commercial.average_selling_price,
          ),
    );

  const [lastSupplierUpdate, setLastSupplierUpdate] =
    useState(
      commercial.last_supplier_price_update ?? "",
    );

  const calculations = useMemo(() => {
    const pack = toNumber(packCost);
    const shipping = toNumber(shippingCost);
    const imports = toNumber(importCost);
    const exchangeRate =
      currency === "GBP"
        ? 1
        : toNumber(exchangeRateToGbp, 1);

    const unitsPerPack =
      commercial.units_per_pack ?? 0;

    const sellingPrice =
      toNumber(averageSellingPrice);

    const landedSupplierCurrency =
      pack + shipping + imports;

    const landedGbp =
      landedSupplierCurrency * exchangeRate;

    const costPerUnit =
      unitsPerPack > 0
        ? landedGbp / unitsPerPack
        : null;

    const grossProfit =
      costPerUnit !== null &&
      sellingPrice > 0
        ? sellingPrice - costPerUnit
        : null;

    const marginPercent =
      grossProfit !== null &&
      sellingPrice > 0
        ? (grossProfit / sellingPrice) * 100
        : null;

    const returnOnCapital =
      grossProfit !== null &&
      costPerUnit !== null &&
      costPerUnit > 0
        ? (grossProfit / costPerUnit) * 100
        : null;

    return {
      landedSupplierCurrency,
      landedGbp,
      costPerUnit,
      grossProfit,
      marginPercent,
      returnOnCapital,
    };
  }, [
    averageSellingPrice,
    commercial.units_per_pack,
    currency,
    exchangeRateToGbp,
    importCost,
    packCost,
    shippingCost,
  ]);

  const efficiency = getEfficiencyState(
    calculations.returnOnCapital,
  );

  return (
    <section className="product-editor-section commercial-editor">
      <div className="product-editor-section-heading">
        <div>
          <p className="vault-eyebrow">
            Commercial Intelligence
          </p>

          <h3>Costs, margin and return</h3>
        </div>

        <p>
          Enter replacement costs and Vault Brain will
          calculate the product economics instantly.
        </p>
      </div>

      <input
        name="product_id"
        type="hidden"
        value={product.product_id}
      />

      <div className="product-editor-grid">
        <label>
          <span>Supplier currency</span>

          <select
            name="currency"
            onChange={(event) =>
              setCurrency(event.target.value)
            }
            value={currency}
          >
            <option value="GBP">GBP</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="TRY">TRY</option>
          </select>
        </label>

        <label>
          <span>Exchange rate to GBP</span>

          <input
            disabled={currency === "GBP"}
            min="0.000001"
            name="exchange_rate_to_gbp"
            onChange={(event) =>
              setExchangeRateToGbp(
                event.target.value,
              )
            }
            step="0.000001"
            type="number"
            value={
              currency === "GBP"
                ? "1"
                : exchangeRateToGbp
            }
          />

          <small>
            Enter the GBP value of one unit of the
            supplier currency.
          </small>
        </label>

        <label>
          <span>Pack cost</span>

          <input
            min="0"
            name="pack_cost"
            onChange={(event) =>
              setPackCost(event.target.value)
            }
            placeholder="Example: 60"
            step="0.01"
            type="number"
            value={packCost}
          />
        </label>

        <label>
          <span>Shipping per pack</span>

          <input
            min="0"
            name="shipping_cost_per_pack"
            onChange={(event) =>
              setShippingCost(
                event.target.value,
              )
            }
            placeholder="Example: 3.50"
            step="0.01"
            type="number"
            value={shippingCost}
          />
        </label>

        <label>
          <span>Import cost per pack</span>

          <input
            min="0"
            name="import_cost_per_pack"
            onChange={(event) =>
              setImportCost(
                event.target.value,
              )
            }
            placeholder="Example: 0"
            step="0.01"
            type="number"
            value={importCost}
          />
        </label>

        <label>
          <span>Units per pack</span>

          <input
            disabled
            type="number"
            value={
              commercial.units_per_pack ?? ""
            }
          />

          <small>
            Derived from the saved pack profile where
            possible.
          </small>
        </label>

        <label>
          <span>Average selling price</span>

          <input
            min="0"
            name="average_selling_price"
            onChange={(event) =>
              setAverageSellingPrice(
                event.target.value,
              )
            }
            placeholder="Example: 40"
            step="0.01"
            type="number"
            value={averageSellingPrice}
          />
        </label>

        <label>
          <span>Supplier price updated</span>

          <input
            name="last_supplier_price_update"
            onChange={(event) =>
              setLastSupplierUpdate(
                event.target.value,
              )
            }
            type="date"
            value={lastSupplierUpdate}
          />
        </label>
      </div>

      <div className="commercial-calculation-grid">
        <article>
          <span>Landed pack cost</span>
          <strong>
            {formatCurrency(
              calculations.landedSupplierCurrency,
              currency,
            )}
          </strong>
        </article>

        <article>
          <span>Landed pack cost GBP</span>
          <strong>
            {formatCurrency(
              calculations.landedGbp,
              "GBP",
            )}
          </strong>
        </article>

        <article>
          <span>Cost per unit</span>
          <strong>
            {calculations.costPerUnit === null
              ? "—"
              : formatCurrency(
                  calculations.costPerUnit,
                  "GBP",
                )}
          </strong>
        </article>

        <article>
          <span>Gross profit per unit</span>
          <strong>
            {calculations.grossProfit === null
              ? "—"
              : formatCurrency(
                  calculations.grossProfit,
                  "GBP",
                )}
          </strong>
        </article>

        <article>
          <span>Gross margin</span>
          <strong>
            {calculations.marginPercent === null
              ? "—"
              : `${calculations.marginPercent.toFixed(
                  1,
                )}%`}
          </strong>
        </article>

        <article>
          <span>Return on capital</span>
          <strong>
            {calculations.returnOnCapital === null
              ? "—"
              : `${calculations.returnOnCapital.toFixed(
                  1,
                )}%`}
          </strong>
        </article>
      </div>

      <div className="commercial-efficiency-card">
        <div>
          <span>Capital efficiency</span>
          <strong>{efficiency.label}</strong>
        </div>

        <div
          aria-label={`${efficiency.stars} out of 5 stars`}
          className="commercial-efficiency-stars"
        >
          {Array.from({ length: 5 }).map(
            (_, index) => (
              <span
                className={
                  index < efficiency.stars
                    ? "is-active"
                    : ""
                }
                key={index}
              >
                ★
              </span>
            ),
          )}
        </div>
      </div>
    </section>
  );
}