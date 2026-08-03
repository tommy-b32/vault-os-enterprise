"use client";

import {
  useMemo,
} from "react";

import {
  BrainPill,
} from "@/components/ui/BrainPill";

import {
  SupplierIntelligenceEngine,
} from "@/lib/brain/SupplierIntelligenceEngine";

import type {
  ProductSupplierSource,
  SupplierProfile,
  SupplierSourceScore,
} from "@/types/suppliers";

type Props = {
  productId: string;

  sources:
    ProductSupplierSource[];

  supplierProfiles?:
    SupplierProfile[];
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
    source.packCost /
      source.unitsPerPack,
    source.currency,
  );
}

function formatScore(
  value: number | null,
): string {
  return value === null
    ? "Pending"
    : `${value}%`;
}

function findSourceScore(
  source: ProductSupplierSource,
  scores: SupplierSourceScore[],
): SupplierSourceScore | null {
  return (
    scores.find(
      (score) =>
        score.supplierId ===
          source.supplierId &&
        score.supplierName ===
          source.supplierName,
    ) ??
    null
  );
}

export function ProductSupplierSources({
  productId,
  sources,
  supplierProfiles = [],
}: Props) {
  const comparison = useMemo(
    () =>
      SupplierIntelligenceEngine.compareProductSources({
        productId,
        sources,
        supplierProfiles,
      }),
    [
      productId,
      sources,
      supplierProfiles,
    ],
  );

  const recommendedScore =
    comparison.recommendedSource
      ? findSourceScore(
          comparison.recommendedSource,
          comparison.sourceScores,
        )
      : null;

  if (
    comparison.sources.length ===
    0
  ) {
    return (
      <section className="product-supplier-sources">
        <header className="product-supplier-sources-header">
          <div>
            <p className="vault-eyebrow">
              Supplier Intelligence
            </p>

            <h3>
              Product supplier sources
            </h3>
          </div>
        </header>

        <div className="product-supplier-sources-empty">
          <h4>
            No supplier sources configured
          </h4>

          <p>
            Add one or more supplier sources so Vault
            Brain can compare price, lead time,
            reliability and preferred purchasing
            routes.
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

          <h3>
            Product supplier sources
          </h3>

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

      {comparison.recommendedSource &&
      recommendedScore ? (
        <section className="product-supplier-recommendation">
          <div className="product-supplier-recommendation-heading">
            <div>
              <p className="vault-eyebrow">
                Vault Brain Recommendation
              </p>

              <h4>
                {
                  comparison.recommendedSource
                    .supplierName
                }
              </h4>
            </div>

            <div className="product-supplier-recommendation-score">
              <span>
                Overall score
              </span>

              <strong>
                {
                  recommendedScore.overallScore
                }%
              </strong>

              <BrainPill tone="success">
                Recommended
              </BrainPill>
            </div>
          </div>

          <div className="product-supplier-recommendation-metrics">
            <article>
              <span>
                Cost score
              </span>

              <strong>
                {formatScore(
                  recommendedScore.costScore,
                )}
              </strong>
            </article>

            <article>
              <span>
                Lead-time score
              </span>

              <strong>
                {formatScore(
                  recommendedScore.leadTimeScore,
                )}
              </strong>
            </article>

            <article>
              <span>
                Reliability
              </span>

              <strong>
                {formatScore(
                  recommendedScore.reliabilityScore,
                )}
              </strong>
            </article>
          </div>

          <p className="product-supplier-recommendation-reason">
            {recommendedScore.reason}
          </p>
        </section>
      ) : null}

      <div className="product-supplier-summary">
        <article>
          <span>
            Preferred
          </span>

          <strong>
            {comparison.preferredSource
              ?.supplierName ??
              "Not selected"}
          </strong>
        </article>

        <article>
          <span>
            Cheapest per unit
          </span>

          <strong>
            {comparison.cheapestSource
              ?.supplierName ??
              "Not available"}
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
          <span>
            Fastest
          </span>

          <strong>
            {comparison.fastestSource
              ?.supplierName ??
              "Not available"}
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
        {comparison.sources.map(
          (source) => {
            const sourceScore =
              findSourceScore(
                source,
                comparison.sourceScores,
              );

            const isRecommended =
              comparison.recommendedSource
                ?.id === source.id;

            const isCheapest =
              comparison.cheapestSource
                ?.id === source.id;

            const isFastest =
              comparison.fastestSource
                ?.id === source.id;

            return (
              <article
                key={source.id}
                className={[
                  "product-supplier-source-card",

                  source.isPreferred
                    ? "is-preferred"
                    : "",

                  isRecommended
                    ? "is-recommended"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="product-supplier-source-heading">
                  <div>
                    <h4>
                      {
                        source.supplierName
                      }
                    </h4>

                    <p>
                      {source.supplierReference
                        ? `Reference: ${source.supplierReference}`
                        : "No supplier reference"}
                    </p>
                  </div>

                  <div className="product-supplier-source-badges">
                    {isRecommended ? (
                      <BrainPill tone="success">
                        Recommended
                      </BrainPill>
                    ) : null}

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

                {sourceScore ? (
                  <div className="product-supplier-source-score">
                    <span>
                      Vault score
                    </span>

                    <strong>
                      {
                        sourceScore.overallScore
                      }%
                    </strong>
                  </div>
                ) : null}

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
                      {formatUnitCost(
                        source,
                      )}
                    </strong>
                  </span>

                  <span>
                    Lead time

                    <strong>
                      {source.leadTimeDays !==
                      null
                        ? `${source.leadTimeDays} days`
                        : "Not set"}
                    </strong>
                  </span>
                </div>

                {sourceScore ? (
                  <div className="product-supplier-source-intelligence">
                    <span>
                      Cost{" "}
                      <strong>
                        {formatScore(
                          sourceScore.costScore,
                        )}
                      </strong>
                    </span>

                    <span>
                      Lead time{" "}
                      <strong>
                        {formatScore(
                          sourceScore.leadTimeScore,
                        )}
                      </strong>
                    </span>

                    <span>
                      Reliability{" "}
                      <strong>
                        {formatScore(
                          sourceScore.reliabilityScore,
                        )}
                      </strong>
                    </span>
                  </div>
                ) : null}

                {sourceScore ? (
                  <p className="product-supplier-source-reason">
                    {sourceScore.reason}
                  </p>
                ) : null}

                {source.notes ? (
                  <p className="product-supplier-source-notes">
                    {source.notes}
                  </p>
                ) : null}
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}