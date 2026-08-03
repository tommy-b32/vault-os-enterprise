"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  BrainCopilotRepository,
} from "@/lib/brain/BrainCopilotRepository";

import type {
  BrainCopilotRecommendation,
} from "@/types/brain-copilot";

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

export function BrainCopilotCard() {
  const [
    recommendation,
    setRecommendation,
  ] = useState<
    BrainCopilotRecommendation | null
  >(null);

  const [
    hasLoaded,
    setHasLoaded,
  ] = useState(false);

  useEffect(() => {
    setRecommendation(
      BrainCopilotRepository.getLatest(),
    );

    setHasLoaded(true);
  }, []);

  if (!hasLoaded) {
    return (
      <section className="brain-copilot-card">
        <p className="vault-eyebrow">
          Vault Brain Copilot
        </p>

        <h2>
          Loading recommendation...
        </h2>

        <p>
          Vault Brain is reading your latest buying
          intelligence.
        </p>
      </section>
    );
  }

  if (!recommendation) {
    return (
      <section className="brain-copilot-card">
        <p className="vault-eyebrow">
          Vault Brain Copilot
        </p>

        <h2>
          No recommendations yet
        </h2>

        <p>
          Accept products during Match Review and
          Vault Brain will begin building buying
          recommendations.
        </p>
      </section>
    );
  }

  return (
    <section className="brain-copilot-card">
      <header className="brain-copilot-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain Copilot
          </p>

          <h2>
            {recommendation.title}
          </h2>

          <p>
            {recommendation.message}
          </p>
        </div>

        <div className="brain-copilot-confidence">
          <span>
            Confidence
          </span>

          <strong>
            {recommendation.confidence}%
          </strong>
        </div>
      </header>

      <div className="brain-copilot-grid">
        <article>
          <span>
            Supplier
          </span>

          <strong>
            {recommendation.supplierName ??
              "Unknown"}
          </strong>
        </article>

        <article>
          <span>
            Priority
          </span>

          <strong>
            {recommendation.priority}
          </strong>
        </article>

        <article>
          <span>
            Estimated Cost
          </span>

          <strong>
            {recommendation.estimatedCost !==
            null
              ? formatCurrency(
                  recommendation.estimatedCost,
                  recommendation.currency,
                )
              : "Waiting for pricing"}
          </strong>
        </article>

        <article>
          <span>
            Estimated Profit
          </span>

          <strong>
            {recommendation.estimatedProfit !==
            null
              ? formatCurrency(
                  recommendation.estimatedProfit,
                  recommendation.currency,
                )
              : "Waiting for sales data"}
          </strong>
        </article>
      </div>

      <div className="brain-copilot-actions">
        <button type="button">
          Review Product
        </button>

        {recommendation.secondaryAction ===
        "generate_whatsapp" ? (
          <button type="button">
            Generate WhatsApp
          </button>
        ) : null}
      </div>
    </section>
  );
}