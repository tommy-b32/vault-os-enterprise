"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  DEMONSTRATION_OPERATIONAL_SNAPSHOT,
} from "@/lib/brain/demonstrationOperationalSnapshot";
import {
  NarratorEngine,
  type NarratorFinding,
} from "@/lib/brain/NarratorEngine";

type VaultBrainStartupProps = {
  children: ReactNode;
  durationMs?: number;
};

type StartupStep = {
  id: string;
  label: string;
  finding: string;
  confidence: number;
};

const SOURCE_LABELS: Record<
  NarratorFinding["source"],
  string
> = {
  shopify: "Synchronising Shopify",
  inventory: "Analysing inventory",
  commercial: "Running commercial analysis",
  supplier: "Checking suppliers",
  catalogue: "Reviewing catalogue",
  capital: "Reviewing capital",
  missions: "Ranking missions",
  system: "Checking Vault systems",
};

const SOURCE_ORDER: NarratorFinding["source"][] = [
  "shopify",
  "inventory",
  "supplier",
  "catalogue",
  "commercial",
  "capital",
  "missions",
  "system",
];

function createStartupSteps(
  findings: NarratorFinding[],
): StartupStep[] {
  const findingsBySource = new Map<
    NarratorFinding["source"],
    NarratorFinding
  >();

  findings.forEach((finding) => {
    const existing =
      findingsBySource.get(finding.source);

    if (
      !existing ||
      finding.priority > existing.priority
    ) {
      findingsBySource.set(
        finding.source,
        finding,
      );
    }
  });

  return SOURCE_ORDER.flatMap((source) => {
    const finding =
      findingsBySource.get(source);

    if (!finding) {
      return [];
    }

    return [
      {
        id: finding.id,
        label:
          SOURCE_LABELS[source],
        finding: finding.finding,
        confidence:
          finding.confidence,
      },
    ];
  });
}

function BrainIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="28"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
      width="28"
    >
      <path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0 0 5 3 3 0 0 0 2 5.5" />
      <path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 0 5 3 3 0 0 1-2 5.5" />
      <path d="M9.5 4.5v15" />
      <path d="M14.5 4.5v15" />
      <path d="M7 9h2.5" />
      <path d="M14.5 9H17" />
      <path d="M7.5 14h2" />
      <path d="M14.5 14h2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function VaultBrainStartup({
  children,
  durationMs = 1200,
}: VaultBrainStartupProps) {
  const [isVisible, setIsVisible] =
    useState(true);

  const [completedSteps, setCompletedSteps] =
    useState(0);

  const story = useMemo(
    () =>
      NarratorEngine.analyse({
        snapshot:
          DEMONSTRATION_OPERATIONAL_SNAPSHOT,
      }),
    [],
  );

  const steps = useMemo(
    () =>
      createStartupSteps(
        story.findings,
      ),
    [story.findings],
  );

  const currentStepIndex =
    steps.length === 0
      ? 0
      : Math.min(
          completedSteps,
          steps.length - 1,
        );

  const currentStep =
    steps[currentStepIndex] ?? null;

  useEffect(() => {
    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (
      reducedMotion ||
      steps.length === 0
    ) {
      setCompletedSteps(
        steps.length,
      );
      setIsVisible(false);
      return;
    }

    const stepDuration = Math.max(
      110,
      Math.floor(
        durationMs /
          (steps.length + 1),
      ),
    );

    let currentStepNumber = 0;

    const intervalId =
      window.setInterval(() => {
        currentStepNumber += 1;

        setCompletedSteps(
          Math.min(
            currentStepNumber,
            steps.length,
          ),
        );

        if (
          currentStepNumber >=
          steps.length
        ) {
          window.clearInterval(
            intervalId,
          );
        }
      }, stepDuration);

    const revealTimer =
      window.setTimeout(() => {
        setCompletedSteps(
          steps.length,
        );
        setIsVisible(false);
      }, durationMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(
        revealTimer,
      );
    };
  }, [durationMs, steps.length]);

  const progressPercentage =
    steps.length === 0
      ? 100
      : Math.round(
          (completedSteps /
            steps.length) *
            100,
        );

  const analysisComplete =
    completedSteps >= steps.length;

  return (
    <div className="vault-brain-startup-root">
      <div
        aria-hidden={!isVisible}
        aria-live="polite"
        className={[
          "vault-brain-startup",
          isVisible
            ? "is-visible"
            : "is-hidden",
        ].join(" ")}
      >
        <div className="vault-brain-startup-card">
          <div className="vault-brain-startup-brand">
            <span className="vault-brain-startup-icon">
              <BrainIcon />
            </span>

            <div>
              <span className="vault-eyebrow">
                Vault Brain
              </span>

              <h2>
                Analysing your business
              </h2>
            </div>
          </div>

          <div className="vault-brain-startup-progress">
            <span>
              Turning connected business
              activity into today&apos;s
              priorities...
            </span>

            <div className="vault-brain-startup-track">
              <span
                style={{
                  width: `${progressPercentage}%`,
                }}
              />
            </div>
          </div>

          <div className="vault-brain-narrator">
            <span className="vault-brain-narrator-status">
              {analysisComplete
                ? "Analysis complete"
                : currentStep?.label ??
                  "Preparing intelligence"}
            </span>

            <strong>
              {analysisComplete
                ? story.headline
                : currentStep?.finding ??
                  "Vault Brain is preparing today’s briefing."}
            </strong>
          </div>

          <div className="vault-brain-startup-steps">
            {steps.map(
              (step, index) => {
                const isComplete =
                  index <
                  completedSteps;

                const isActive =
                  index ===
                    completedSteps &&
                  !analysisComplete;

                return (
                  <div
                    className={[
                      "vault-brain-startup-step",
                      isComplete
                        ? "is-complete"
                        : "",
                      isActive
                        ? "is-active"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={step.id}
                  >
                    <span className="vault-brain-startup-check">
                      {isComplete ? (
                        <CheckIcon />
                      ) : (
                        <i />
                      )}
                    </span>

                    <div className="vault-brain-startup-step-copy">
                      <span>
                        {step.label}
                      </span>

                      <small>
                        {step.finding}
                      </small>
                    </div>
                  </div>
                );
              },
            )}
          </div>

          <div className="vault-brain-startup-footer">
            {analysisComplete
              ? `Briefing generated · ${story.confidence}% confidence`
              : "Generating today’s briefing..."}
          </div>
        </div>
      </div>

      <div
        className={[
          "vault-brain-startup-content",
          isVisible
            ? "is-waiting"
            : "is-ready",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}