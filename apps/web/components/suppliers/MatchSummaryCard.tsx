"use client";

import "./MatchSummaryCard.css";

import type {
  ReactNode,
} from "react";

import {
  BrainPill,
} from "@/components/ui/BrainPill";

import type {
  CatalogueProductMatch,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

type MatchSummaryProps = {
  bestMatch: CatalogueProductMatch | null;
  actions?: ReactNode;
};

type VisualComparisonProps = {
  bestMatch: CatalogueProductMatch | null;
  card: SupplierCatalogueCardData;
};

type ComparisonRow = {
  label: string;
  supplierValue: string | null;
  catalogueValue: string | null;
};

function normaliseText(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function valuesMatch(
  supplierValue: string | null,
  catalogueValue: string | null,
): boolean {
  const supplier =
    normaliseText(
      supplierValue,
    );

  const catalogue =
    normaliseText(
      catalogueValue,
    );

  return (
    supplier.length > 0 &&
    catalogue.length > 0 &&
    (
      supplier === catalogue ||
      supplier.includes(catalogue) ||
      catalogue.includes(supplier)
    )
  );
}

function displayValue(
  value: string | null,
): string {
  return value?.trim() ||
    "Not identified";
}

function getConfidenceTone(
  confidence: number,
):
  | "success"
  | "warning"
  | "danger" {
  if (confidence >= 92) {
    return "success";
  }

  if (confidence >= 55) {
    return "warning";
  }

  return "danger";
}

export function MatchSummaryCard({
  bestMatch,
  actions = null,
}: MatchSummaryProps) {
  return (
    <div className="match-summary-card-layout">
      <div className="supplier-product-review-v2-match">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Recommendation
          </p>

          <h3>
            {bestMatch
              ? bestMatch.product.product_name
              : "Create or link manually"}
          </h3>

          <p>
            {bestMatch
              ? "Vault Brain compared identity, visible branding and distinctive visual details."
              : "No identity-safe catalogue match was found for this supplier item."}
          </p>
        </div>

        {bestMatch ? (
          <div className="supplier-product-review-v2-confidence">
            <span>
              Confidence
            </span>

            <strong>
              {bestMatch.confidence}%
            </strong>

            <BrainPill
              tone={getConfidenceTone(
                bestMatch.confidence,
              )}
            >
              {bestMatch.confidence >= 92
                ? "Strong match"
                : bestMatch.confidence >= 55
                  ? "Review suggested"
                  : "Low confidence"}
            </BrainPill>
          </div>
        ) : (
          <BrainPill tone="danger">
            Manual review
          </BrainPill>
        )}
      </div>

      {bestMatch ? (
        <div className="supplier-product-review-v2-signals">
          {bestMatch.signals.map(
            (signal) => (
              <article
                key={`${signal.reason}-${signal.label}`}
              >
                <span aria-hidden="true">
                  ✓
                </span>

                <div>
                  <strong>
                    {signal.label}
                  </strong>

                  <small>
                    +{signal.score} confidence
                  </small>
                </div>
              </article>
            ),
          )}
        </div>
      ) : null}

      {actions}
    </div>
  );
}

export function VisualComparisonCard({
  bestMatch,
  card,
}: VisualComparisonProps) {
  if (!bestMatch) {
    return null;
  }

  const productVision =
    bestMatch.product.product_vision ??
    null;

  const productIntelligence =
    bestMatch.product.product_intelligence ??
    null;

  const comparisons:
    ComparisonRow[] = [
      {
        label:
          "Brand",

        supplierValue:
          card.brand,

        catalogueValue:
          productVision?.brand ??
          productIntelligence?.brand ??
          null,
      },

      {
        label:
          "Garment",

        supplierValue:
          card.vision.garmentType,

        catalogueValue:
          productVision?.subcategory ??
          productVision?.category ??
          productIntelligence?.garment_type ??
          bestMatch.product.product_type,
      },

      {
        label:
          "Primary colour",

        supplierValue:
          card.colour,

        catalogueValue:
          productVision?.primary_colour ??
          productIntelligence?.primary_colour ??
          null,
      },

      {
        label:
          "Logo",

        supplierValue:
          card.vision.chestLogo,

        catalogueValue:
          productVision?.logo_type ??
          productIntelligence?.chest_logo ??
          null,
      },

      {
        label:
          "Logo position",

        supplierValue:
          card.vision.chestLogo,

        catalogueValue:
          productVision?.logo_position ??
          null,
      },

      {
        label:
          "Front design",

        supplierValue:
          card.vision.frontGraphic,

        catalogueValue:
          productVision?.front_description ??
          productIntelligence?.front_graphic ??
          null,
      },

      {
        label:
          "Back design",

        supplierValue:
          card.vision.backGraphic,

        catalogueValue:
          productVision?.back_description ??
          productIntelligence?.back_graphic ??
          null,
      },

      {
        label:
          "Fit",

        supplierValue:
          card.vision.fit,

        catalogueValue:
          productVision?.fit ??
          productIntelligence?.fit ??
          null,
      },

      {
        label:
          "Neck",

        supplierValue:
          card.vision.neckLabel,

        catalogueValue:
          productVision?.neck_type ??
          productIntelligence?.neck_label ??
          null,
      },

      {
        label:
          "Sleeve detail",

        supplierValue:
          card.vision.sleeveDetail,

        catalogueValue:
          productVision?.sleeve_type ??
          productIntelligence?.sleeve_detail ??
          null,
      },
    ];

  return (
    <section className="supplier-product-review-v2-comparison">
      <header>
        <div>
          <p className="vault-eyebrow">
            Visual Comparison
          </p>

          <h3>
            Supplier vs Fabric Vault
          </h3>
        </div>

        <BrainPill tone="default">
          Product Vision
        </BrainPill>
      </header>

      <div className="supplier-product-review-v2-comparison-grid">
        {comparisons.map(
          (comparison) => {
            const matched =
              valuesMatch(
                comparison.supplierValue,
                comparison.catalogueValue,
              );

            const hasBothValues =
              Boolean(
                comparison.supplierValue &&
                comparison.catalogueValue,
              );

            return (
              <article
                className={
                  matched
                    ? "is-match"
                    : hasBothValues
                      ? "is-different"
                      : "is-uncertain"
                }
                key={comparison.label}
              >
                <div>
                  <span>
                    {comparison.label}
                  </span>

                  <strong>
                    {matched
                      ? "Match"
                      : hasBothValues
                        ? "Check difference"
                        : "Not verified"}
                  </strong>
                </div>

                <dl>
                  <div>
                    <dt>
                      Supplier
                    </dt>

                    <dd>
                      {displayValue(
                        comparison.supplierValue,
                      )}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      Fabric Vault
                    </dt>

                    <dd>
                      {displayValue(
                        comparison.catalogueValue,
                      )}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}