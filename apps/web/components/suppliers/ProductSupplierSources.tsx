"use client";

import { useMemo } from "react";

import { BrainPill } from "@/components/ui/BrainPill";

import { SupplierIntelligenceEngine } from "@/lib/brain/SupplierIntelligenceEngine";

import type {
  ProductSupplierSource,
} from "@/types/suppliers";

type Props = {
  productId: string;
  sources: ProductSupplierSource[];
};

function formatCurrency(
  value: number | null,
  currency: string,
): string {
  if (value === null) {
    return "Not set";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnitCost(
  source: ProductSupplierSource,
): string {
  if (
    source.packCost === null ||
    source.unitsPerPack === null ||
    source.unitsPerPack <= 0
  ) {
    return "Not available";
  }

  return formatCurrency(
    source.packCost / source.unitsPerPack,
    source.currency,
  );
}

export function ProductSupplierSources({
  productId,
  sources,
}: Props) {
  const comparison = useMemo(
    () =>
      SupplierIntelligenceEngine.compareProductSources({
        productId,
        sources,
      }),
    [productId, sources],
  );

  if (comparison.sources.length === 0) {
    return (
      <section className="product-supplier-sources">
        <header className="product-supplier-sources-header">
          <div>
            <p className="vault-eyebrow">
              Supplier Intelligence
            </p>

            <h3>Product supplier sources</h3>
          </div>
        </header>

        <div className="product-supplier-sources-empty">
          <h4>No supplier sources configured</h4>

          <p>
            Add one or more supplier sources so Vault
            Brain can compare price, lead time and
            preferred purchasing routes.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="product-supplier-sources">
      <header className="product-supplier-sources-header">
        <div>
          <p className="vault-eyebrow">
            Supplier Intelligence
          </p>

          <h3>Product supplier sources</h3>

          <p>
            Compare every active supplier available
            for this product.
          </p>
        </div>

        <BrainPill tone="default">
          {comparison.sources.length}{" "}
          {comparison.sources.length === 1
            ? "source"
            : "sources"}
        </BrainPill>
      </header>

      <div className="product-supplier-summary">
        <article>
          <span>Preferred</span>

          <strong>
            {comparison.preferredSource
              ?.supplierName ?? "Not selected"}
          </strong>
        </article>

        <article>
          <span>Cheapest per unit</span>

          <strong>
            {comparison.cheapestSource
              ?.supplierName ?? "Not available"}
          </strong>

          {comparison.cheapestSource ? (
            <small>
              {formatUnitCost(
                comparison.cheapestSource,
              )}{" "}
              per unit
            </small>
          ) : null}
        </article>

        <article>
          <span>Fastest</span>

          <strong>
            {comparison.fastestSource
              ?.supplierName ?? "Not available"}
          </strong>

          {comparison.fastestSource
            ?.leadTimeDays !== null &&
          comparison.fastestSource
            ?.leadTimeDays !== undefined ? (
            <small>
              {
                comparison.fastestSource
                  .leadTimeDays
              }{" "}
              days
            </small>
          ) : null}
        </article>
      </div>

      <div className="product-supplier-source-list">
        {comparison.sources.map((source) => {
          const isCheapest =
            comparison.cheapestSource?.id ===
            source.id;

          const isFastest =
            comparison.fastestSource?.id ===
            source.id;

          return (
            <article
              key={source.id}
              className={[
                "product-supplier-source-card",
                source.isPreferred
                  ? "is-preferred"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="product-supplier-source-heading">
                <div>
                  <h4>{source.supplierName}</h4>

                  <p>
                    {source.supplierReference
                      ? `Reference: ${source.supplierReference}`
                      : "No supplier reference"}
                  </p>
                </div>

                <div className="product-supplier-source-badges">
                  {source.isPreferred ? (
                    <BrainPill tone="success">
                      Preferred
                    </BrainPill>
                  ) : null}

                  {isCheapest ? (
                    <BrainPill tone="success">
                      Cheapest
                    </BrainPill>
                  ) : null}

                  {isFastest ? (
                    <BrainPill tone="warning">
                      Fastest
                    </BrainPill>
                  ) : null}
                </div>
              </div>

              <div className="product-supplier-source-metrics">
                <span>
                  Pack cost
                  <strong>
                    {formatCurrency(
                      source.packCost,
                      source.currency,
                    )}
                  </strong>
                </span>

                <span>
                  Units per pack
                  <strong>
                    {source.unitsPerPack ??
                      "Not set"}
                  </strong>
                </span>

                <span>
                  Unit cost
                  <strong>
                    {formatUnitCost(source)}
                  </strong>
                </span>

                <span>
                  Lead time
                  <strong>
                    {source.leadTimeDays !== null
                      ? `${source.leadTimeDays} days`
                      : "Not set"}
                  </strong>
                </span>
              </div>

              {source.notes ? (
                <p className="product-supplier-source-notes">
                  {source.notes}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}