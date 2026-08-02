"use client";

import "./GarmentNavigator.css";

import {
  BrainPill,
} from "@/components/ui/BrainPill";

import type {
  CatalogueMultiProductDetection,
} from "@/lib/supplier/catalogue-analysis-types";

type Props = {
  detection: CatalogueMultiProductDetection;

  selectedIndex: number;

  onSelect: (
    index: number,
  ) => void;
};

export function GarmentNavigator({
  detection,
  selectedIndex,
  onSelect,
}: Props) {
  if (
    !detection.isMultiProduct ||
    detection.detectedCount <= 1 ||
    detection.garments.length <= 1
  ) {
    return null;
  }

  return (
    <section className="garment-navigator">
      <header className="garment-navigator-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain
          </p>

          <h3>
            Multiple garments detected
          </h3>

          <p>
            Vault Brain found{" "}
            {detection.detectedCount} separate garments on
            this supplier image. Select one to review.
          </p>
        </div>

        <BrainPill tone="warning">
          Reviewing {selectedIndex + 1} of{" "}
          {detection.detectedCount}
        </BrainPill>
      </header>

      <div className="garment-navigator-grid">
        {detection.garments.map(
          (
            garment,
            index,
          ) => {
            const isSelected =
              index === selectedIndex;

            return (
              <button
                aria-pressed={
                  isSelected
                }
                className={
                  isSelected
                    ? "is-active"
                    : ""
                }
                key={garment.id}
                onClick={() =>
                  onSelect(index)
                }
                type="button"
              >
                <span className="garment-navigator-number">
                  {index + 1}
                </span>

                <div>
                  <strong>
                    {garment.label ||
                      `Garment ${index + 1}`}
                  </strong>

                  <small>
                    {[
                      garment.colour,
                      garment.garmentType ??
                        garment.productType,
                    ]
                      .filter(Boolean)
                      .join(" · ") ||
                      "Detected supplier garment"}
                  </small>
                </div>

                <span className="garment-navigator-confidence">
                  {garment.confidence}%
                </span>
              </button>
            );
          },
        )}
      </div>
    </section>
  );
}