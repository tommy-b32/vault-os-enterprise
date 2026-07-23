"use client";

import { useEffect, useState } from "react";

type ScanStep = {
  id: string;
  label: string;
};

type Props = {
  steps?: ScanStep[];
  durationMs?: number;
};

const DEFAULT_STEPS: ScanStep[] = [
  {
    id: "inventory",
    label: "Inventory analysed",
  },
  {
    id: "suppliers",
    label: "Supplier network analysed",
  },
  {
    id: "commercial",
    label: "Commercial data analysed",
  },
  {
    id: "capital",
    label: "Capital allocation analysed",
  },
  {
    id: "purchasing",
    label: "Purchasing strategy analysed",
  },
  {
    id: "recommendations",
    label: "Recommendations generated",
  },
];

export function BrainScanSequence({
  steps = DEFAULT_STEPS,
  durationMs = 450,
}: Props) {
  const [completedCount, setCompletedCount] =
    useState(0);

  useEffect(() => {
    setCompletedCount(0);

    if (steps.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setCompletedCount((current) => {
        const next = current + 1;

        if (next >= steps.length) {
          window.clearInterval(interval);
          return steps.length;
        }

        return next;
      });
    }, durationMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [durationMs, steps.length]);

  const isComplete =
    completedCount >= steps.length;

  return (
    <section
      className={`brain-scan-sequence ${
        isComplete ? "is-complete" : ""
      }`}
      aria-label="Vault Brain analysis sequence"
    >
      <header className="brain-scan-header">
        <div>
          <p className="vault-eyebrow">
            Vault Brain
          </p>

          <h2>
            {isComplete
              ? "Commercial intelligence complete"
              : "Running commercial intelligence"}
          </h2>
        </div>

        <span className="brain-scan-live">
          <span />
          {isComplete ? "Complete" : "Analysing"}
        </span>
      </header>

      <div className="brain-scan-progress">
        <div
          className="brain-scan-progress-fill"
          style={{
            width: `${
              steps.length > 0
                ? Math.round(
                    (completedCount /
                      steps.length) *
                      100,
                  )
                : 100
            }%`,
          }}
        />
      </div>

      <div className="brain-scan-list">
        {steps.map((step, index) => {
          const isStepComplete =
            index < completedCount;

          const isCurrent =
            index === completedCount &&
            !isComplete;

          return (
            <div
              key={step.id}
              className={[
                "brain-scan-item",
                isStepComplete
                  ? "is-complete"
                  : "",
                isCurrent ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span className="brain-scan-indicator">
                {isStepComplete ? "✓" : ""}
              </span>

              <span>{step.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}