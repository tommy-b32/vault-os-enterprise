"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BrainConfidenceBar,
} from "@/components/brain/ui/BrainConfidenceBar";

import {
  BrainMetricGrid,
} from "@/components/brain/ui/BrainMetricGrid";

import {
  BrainStatusBadge,
} from "@/components/brain/ui/BrainStatusBadge";

type BrainDecisionState =
  | "approved"
  | "review"
  | "rejected"
  | "waiting";

type BrainDecisionMetric = {
  label: string;
  value: string;
};

type BrainDecisionCheck = {
  label: string;
  status:
    | "ready"
    | "warning"
    | "blocked"
    | "waiting";
};

type BrainDecisionCardProps = {
  title: string;

  state: BrainDecisionState;
  statusLabel: string;
  actionLabel: string;

  confidence: number;

  headline: string;
  explanation: string;

  metrics?: BrainDecisionMetric[];
  checks?: BrainDecisionCheck[];
  missingInputs?: string[];
};

function getCheckIcon(
  status: BrainDecisionCheck["status"],
): string {
  if (status === "ready") {
    return "✓";
  }

  if (status === "warning") {
    return "!";
  }

  if (status === "blocked") {
    return "×";
  }

  return "•";
}

export function BrainDecisionCard({
  title,
  state,
  statusLabel,
  actionLabel,
  confidence,
  headline,
  explanation,
  metrics = [],
  checks = [],
  missingInputs = [],
}: BrainDecisionCardProps) {
  const safeConfidence = Math.max(
    0,
    Math.min(100, confidence),
  );

  const [visibleCheckCount, setVisibleCheckCount] =
    useState(0);

  const [analysisComplete, setAnalysisComplete] =
    useState(false);

  const [
    displayedConfidence,
    setDisplayedConfidence,
  ] = useState(0);

  /*
   * Any meaningful decision-data change creates a new
   * analysis key and automatically reruns the pipeline.
   */
  const analysisKey = useMemo(
    () =>
      JSON.stringify({
        title,
        state,
        statusLabel,
        actionLabel,
        confidence: safeConfidence,
        headline,
        explanation,
        metrics,
        checks,
        missingInputs,
      }),
    [
      actionLabel,
      checks,
      explanation,
      headline,
      metrics,
      missingInputs,
      safeConfidence,
      state,
      statusLabel,
      title,
    ],
  );

  useEffect(() => {
    const timers: ReturnType<
      typeof setTimeout
    >[] = [];

    setVisibleCheckCount(0);
    setAnalysisComplete(false);
    setDisplayedConfidence(0);

    const prefersReducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (prefersReducedMotion) {
      setVisibleCheckCount(checks.length);
      setAnalysisComplete(true);
      setDisplayedConfidence(safeConfidence);

      return undefined;
    }

    if (checks.length === 0) {
      const completeTimer = setTimeout(() => {
        setAnalysisComplete(true);
        setDisplayedConfidence(
          safeConfidence,
        );
      }, 180);

      timers.push(completeTimer);
    } else {
      checks.forEach((_, index) => {
        const checkTimer = setTimeout(
          () => {
            setVisibleCheckCount(index + 1);
          },
          140 + index * 110,
        );

        timers.push(checkTimer);
      });

      const pipelineDuration =
        140 + checks.length * 110;

      const completeTimer = setTimeout(() => {
        setAnalysisComplete(true);
      }, pipelineDuration + 100);

      const confidenceTimer = setTimeout(() => {
        setDisplayedConfidence(
          safeConfidence,
        );
      }, pipelineDuration + 170);

      timers.push(
        completeTimer,
        confidenceTimer,
      );
    }

    return () => {
      timers.forEach((timer) => {
        clearTimeout(timer);
      });
    };
  }, [
    analysisKey,
    checks.length,
    safeConfidence,
  ]);

  return (
    <section
      className={`brain-decision-card brain-state-${state} ${
        analysisComplete
          ? "is-analysis-complete"
          : "is-analysing"
      }`}
    >
      <header className="brain-decision-header">
        <div className="brain-title">
          <span className="brain-logo">
            🧠 VAULT BRAIN
          </span>

          <h3>{title}</h3>
        </div>

        <BrainStatusBadge
          state={
            analysisComplete
              ? state
              : "analysing"
          }
          label={
            analysisComplete
              ? statusLabel
              : "Analysing"
          }
        />
      </header>

      {checks.length > 0 && (
        <>
          <h4 className="brain-analysis-heading">
            {analysisComplete
              ? "Analysis Complete"
              : "Running Analysis"}
          </h4>

          <div className="brain-analysis-checks">
            {checks.map((check, index) => {
              const checkVisible =
                index < visibleCheckCount;

              const checkActive =
                index === visibleCheckCount &&
                !analysisComplete;

              return (
                <div
                  className={`brain-analysis-check ${
                    checkVisible
                      ? `check-${check.status} is-visible`
                      : "check-waiting is-pending"
                  } ${
                    checkActive
                      ? "is-active"
                      : ""
                  }`}
                  key={check.label}
                >
                  <span
                    aria-hidden="true"
                    className="brain-analysis-check-icon"
                  >
                    {checkVisible
                      ? getCheckIcon(
                          check.status,
                        )
                      : "•"}
                  </span>

                  <span>{check.label}</span>

                  <small>
                    {checkVisible
                      ? check.status === "ready"
                        ? "Complete"
                        : check.status ===
                            "warning"
                          ? "Review"
                          : check.status ===
                              "blocked"
                            ? "Blocked"
                            : "Waiting"
                      : checkActive
                        ? "Analysing..."
                        : "Queued"}
                  </small>
                </div>
              );
            })}
          </div>
        </>
      )}

      <BrainConfidenceBar
        value={displayedConfidence}
      />

      <div
        className={`brain-decision-result ${
          analysisComplete
            ? "is-visible"
            : "is-hidden"
        }`}
      >
        <div className="brain-decision-action">
          <span>Recommendation</span>

          <strong>
            {analysisComplete
              ? actionLabel
              : "ANALYSING"}
          </strong>
        </div>

        <div className="brain-decision-message">
          <h4>
            {analysisComplete
              ? headline
              : "Vault Brain is reviewing the available data."}
          </h4>

          <p>
            {analysisComplete
              ? explanation
              : "Commercial, supplier and product signals are being evaluated before a recommendation is generated."}
          </p>
        </div>

        {analysisComplete && (
          <BrainMetricGrid
            metrics={metrics}
          />
        )}

        {analysisComplete &&
          missingInputs.length > 0 && (
            <div className="brain-missing-inputs">
              <span>
                Missing Requirements
              </span>

              <div>
                {missingInputs.map((input) => (
                  <strong key={input}>
                    {input}
                  </strong>
                ))}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}