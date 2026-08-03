"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BrainReasoningEngine,
} from "@/lib/brain/BrainReasoningEngine";

import {
  BrainSignalsService,
} from "@/lib/brain/BrainSignalsService";

import type {
  BrainSignal,
} from "@/lib/brain/BrainSignalsEngine";

const THINKING_STEP_DELAY_MS = 450;

function getEstimatedMinutes(
  signal: BrainSignal,
): number {
  switch (signal.type) {
    case "buying":
      return 6;

    case "supplier":
      return 8;

    case "inventory":
      return 5;

    case "margin":
      return 4;

    case "sales":
      return 4;

    case "system":
      return 3;
  }
}

export function CommandCentreBrainPriority() {
  const [
    signal,
    setSignal,
  ] = useState<
    BrainSignal | null
  >(null);

  const [
    hasLoaded,
    setHasLoaded,
  ] = useState(false);

  const [
    visibleThinkingSteps,
    setVisibleThinkingSteps,
  ] = useState(0);

  const reasoningSteps =
    useMemo(
      () =>
        signal
          ? BrainReasoningEngine.build(
              signal,
            )
          : [],
      [signal],
    );

  useEffect(() => {
    setSignal(
      BrainSignalsService.getHighestPriority(),
    );

    setHasLoaded(true);
  }, []);

  useEffect(() => {
    if (
      !hasLoaded ||
      signal === null ||
      reasoningSteps.length === 0
    ) {
      return;
    }

    setVisibleThinkingSteps(0);

    const timers =
      reasoningSteps.map(
        (_, index) =>
          window.setTimeout(
            () => {
              setVisibleThinkingSteps(
                index + 1,
              );
            },
            THINKING_STEP_DELAY_MS *
              (index + 1),
          ),
      );

    return () => {
      timers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [
    hasLoaded,
    signal,
    reasoningSteps.length,
  ]);

  if (!hasLoaded) {
    return (
      <section className="command-brain-priority">
        <p className="vault-eyebrow">
          Vault Brain Thinking
        </p>

        <h2>
          Reading Vault Brain...
        </h2>
      </section>
    );
  }

  if (!signal) {
    return (
      <section className="command-brain-priority">
        <div>
          <p className="vault-eyebrow">
            Vault Brain
          </p>

          <h2>
            No active signal
          </h2>

          <p>
            Complete Match Review decisions so Vault
            Brain can identify and prioritise the
            next business signal.
          </p>
        </div>

        <Link
          className="command-brain-priority-link is-visible"
          href="/missions"
        >
          Open Vault Brain →
        </Link>
      </section>
    );
  }

  const estimatedMinutes =
    getEstimatedMinutes(
      signal,
    );

  const hasFinishedThinking =
    reasoningSteps.length > 0 &&
    visibleThinkingSteps >=
      reasoningSteps.length;

  const actionHref =
    signal.actionHref ??
    "/missions";

  const actionLabel =
    signal.actionLabel ??
    "Open Vault Brain";

  return (
    <section className="command-brain-priority">
      <div className="command-brain-priority-copy">
        <div className="command-brain-priority-status">
          <span aria-hidden="true" />

          Vault Brain online
        </div>

        <p className="vault-eyebrow">
          Vault Brain Thinking
        </p>

        <div
          aria-live="polite"
          className="vault-brain-thinking"
        >
          {reasoningSteps.map(
            (step, index) => {
              const isVisible =
                visibleThinkingSteps >=
                index + 1;

              const isLast =
                index ===
                reasoningSteps.length - 1;

              const className = [
                "vault-thinking-step",
                isVisible
                  ? "is-visible"
                  : "",
                isLast &&
                !hasFinishedThinking
                  ? "active"
                  : "complete",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <div
                  className={className}
                  key={step.id}
                >
                  {isLast &&
                  hasFinishedThinking
                    ? "Recommendation prepared"
                    : step.text}
                </div>
              );
            },
          )}
        </div>

        <div
          className={[
            "command-brain-priority-result",
            hasFinishedThinking
              ? "is-visible"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className="command-brain-priority-label">
            Today&apos;s highest-value signal
          </p>

          <h2>
            {signal.title}
          </h2>

          <p>
            {signal.message}
          </p>
        </div>
      </div>

      <div
        className={[
          "command-brain-priority-meta",
          hasFinishedThinking
            ? "is-visible"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <article>
          <span>
            Confidence
          </span>

          <strong>
            {signal.confidence}%
          </strong>
        </article>

        <article>
          <span>
            Severity
          </span>

          <strong>
            {signal.severity}
          </strong>
        </article>

        <article>
          <span>
            Estimated time
          </span>

          <strong>
            {estimatedMinutes} min
          </strong>
        </article>
      </div>

      <Link
        aria-hidden={
          !hasFinishedThinking
        }
        className={[
          "command-brain-priority-link",
          hasFinishedThinking
            ? "is-visible"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        href={actionHref}
        tabIndex={
          hasFinishedThinking
            ? 0
            : -1
        }
      >
        {actionLabel} →
      </Link>
    </section>
  );
}