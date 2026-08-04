"use client";

import {
  useActionState,
  useState,
} from "react";

import {
  INITIAL_COMMERCIAL_ACTION_STATE,
  updateCommercialCosts,
} from "@/app/catalogue/commercial-actions";

import { CommercialReviewCard } from "@/components/catalogue/editor/commercial/CommercialReviewCard";
import { useCommercialCalculator } from "@/components/catalogue/editor/commercial/useCommercialCalculator";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

type ProductCommercialTabProps = {
  product: CatalogueProduct;
};

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
  const [saveState, saveAction, isSaving] = useActionState(
    updateCommercialCosts,
    INITIAL_COMMERCIAL_ACTION_STATE,
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] =
    useState(false);

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

  const calculations =
    useCommercialCalculator({
      currency,
      exchangeRateToGbp,
      packCost,
      shippingCost,
      importCost,
      averageSellingPrice,
      unitsPerPack:
        commercial.units_per_pack,
    });

  const efficiency = getEfficiencyState(
    calculations.returnOnCapital,
  );

  const packCostEntered =
    packCost.trim() !== "" &&
    Number(packCost) > 0;

  const sellingPriceEntered =
    averageSellingPrice.trim() !== "" &&
    Number(averageSellingPrice) > 0;

  return (
    <form
      action={saveAction}
      className="product-editor-section commercial-editor"
      onChange={() => setHasUnsavedChanges(true)}
    >
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
        name="parent_product_id"
        type="hidden"
        value={product.parent_product_id}
      />
      <input
        name="supplier_id"
        type="hidden"
        value={product.supplier_id ?? ""}
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
            defaultValue={commercial.units_per_pack ?? ""}
            min="1"
            name="units_per_pack"
            placeholder="Required for unit economics"
            step="1"
            type="number"
          />

          <small>
            Pre-filled from a recognised pack profile; enter the
            canonical pack size when no reliable profile value exists.
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

      <div className="commercial-metrics-heading">
        <span>Unsaved calculation preview</span>
        <small>Canonical values are recalculated by the database after save.</small>
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

      <CommercialReviewCard
        calculations={calculations}
        packCostEntered={packCostEntered}
        productConfigured={
          product.configuration_trusted
        }
        sellingPriceEntered={
          sellingPriceEntered
        }
        supplierAssigned={
          Boolean(product.supplier_id)
        }
        unitsPerPack={
          commercial.units_per_pack
        }
      />

      <section className="commercial-canonical-metrics">
        <div className="commercial-metrics-heading">
          <span>Canonical saved metrics</span>
          <strong>
            {commercial.commercial_cost_trusted
              ? "Trusted"
              : "Incomplete"}
          </strong>
        </div>

        <div className="commercial-calculation-grid">
          <article>
            <span>Landed pack cost GBP</span>
            <strong>
              {commercial.landed_cost_per_pack_gbp === null
                ? "Unavailable"
                : formatCurrency(
                    commercial.landed_cost_per_pack_gbp,
                    "GBP",
                  )}
            </strong>
          </article>
          <article>
            <span>Landed unit cost</span>
            <strong>
              {commercial.landed_cost_per_unit === null
                ? "Unavailable"
                : formatCurrency(commercial.landed_cost_per_unit, "GBP")}
            </strong>
          </article>
          <article>
            <span>Gross profit per unit</span>
            <strong>
              {commercial.estimated_gross_profit_per_unit === null
                ? "Unavailable"
                : formatCurrency(
                    commercial.estimated_gross_profit_per_unit,
                    "GBP",
                  )}
            </strong>
          </article>
          <article>
            <span>Gross margin</span>
            <strong>
              {commercial.estimated_margin_percent === null
                ? "Unavailable"
                : `${commercial.estimated_margin_percent.toFixed(1)}%`}
            </strong>
          </article>
          <article>
            <span>Return on capital</span>
            <strong>
              {commercial.estimated_return_on_pack_capital_percent === null
                ? "Unavailable"
                : `${commercial.estimated_return_on_pack_capital_percent.toFixed(
                    1,
                  )}%`}
            </strong>
          </article>
        </div>

        {commercial.missing_commercial_requirements.length > 0 ? (
          <p>
            Missing: {commercial.missing_commercial_requirements
              .map((requirement) => requirement.replaceAll("_", " "))
              .join(", ")}.
          </p>
        ) : null}
      </section>

      <footer className="commercial-save-footer">
        <div>
          <strong>
            {isSaving
              ? "Saving commercial data"
              : saveState.status === "error"
                ? "Validation error"
                : saveState.status === "success"
                  ? saveState.commercialState === "trusted"
                    ? "Saved and trusted"
                    : "Saved but incomplete"
                  : hasUnsavedChanges
                    ? "Unsaved changes"
                    : "Canonical data unchanged"}
          </strong>
          <p aria-live="polite">
            {saveState.message ||
              "Enter real supplier costs and selling data, then save."}
          </p>
          {saveState.missingRequirements.length > 0 ? (
            <small>
              Missing: {saveState.missingRequirements
                .map((requirement) => requirement.replaceAll("_", " "))
                .join(", ")}
            </small>
          ) : null}
        </div>

        <button
          disabled={isSaving}
          onClick={() => setHasUnsavedChanges(false)}
          type="submit"
        >
          {isSaving ? "Saving…" : "Save commercial data"}
        </button>
      </footer>
    </form>
  );
}
