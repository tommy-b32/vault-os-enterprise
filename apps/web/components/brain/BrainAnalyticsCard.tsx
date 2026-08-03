"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  motion,
} from "framer-motion";

import {
  BrainLearningRepository,
} from "@/lib/brain/BrainLearningRepository";

import {
  BrainAnalyticsEngine,
} from "@/lib/brain/BrainAnalyticsEngine";

import type {
  BrainLearningEvent,
} from "@/types/brain-learning";

function getLearningStatus({
  totalDecisions,
  recommendationAccuracy,
}: {
  totalDecisions: number;
  recommendationAccuracy: number;
}): {
  label: string;
  message: string;
} {
  if (totalDecisions === 0) {
    return {
      label: "Awaiting decisions",
      message:
        "Link products in Match Review so Vault Brain can begin learning from your choices.",
    };
  }

  if (totalDecisions < 10) {
    return {
      label: "Learning foundations",
      message:
        "Vault Brain is building its first decision patterns from your catalogue reviews.",
    };
  }

  if (recommendationAccuracy >= 90) {
    return {
      label: "Learning and improving",
      message:
        "Recommendation behaviour is aligning strongly with your confirmed decisions.",
    };
  }

  return {
    label: "Refining intelligence",
    message:
      "Vault Brain is using your overrides to improve future recommendations.",
  };
}

export function BrainAnalyticsCard() {
  const [
    events,
    setEvents,
  ] = useState<
    BrainLearningEvent[]
  >([]);

  const [
    hasLoaded,
    setHasLoaded,
  ] = useState(false);

  useEffect(() => {
    setEvents(
      BrainLearningRepository.getAll(),
    );

    setHasLoaded(true);
  }, []);

  const analytics =
    useMemo(
      () =>
        BrainAnalyticsEngine.analyse(
          events,
        ),
      [events],
    );

  const learningStatus =
    getLearningStatus({
      totalDecisions:
        analytics.totalDecisions,

      recommendationAccuracy:
        analytics.recommendationAccuracy,
    });

  const accuracy =
    hasLoaded
      ? analytics.recommendationAccuracy
      : 0;

  return (
    <motion.section
      animate={{
        opacity: 1,
        y: 0,
      }}
      className="brain-analytics-card brain-analytics-hero"
      initial={{
        opacity: 0,
        y: 14,
      }}
      transition={{
        duration: 0.38,
        ease: "easeOut",
      }}
    >
      <div className="brain-analytics-hero-glow" />

      <header className="brain-analytics-hero-header">
        <div>
          <div className="brain-analytics-live-status">
            <span
              aria-hidden="true"
              className="brain-analytics-live-dot"
            />

            <span>
              Vault Brain online
            </span>
          </div>

          <p className="vault-eyebrow">
            Intelligence Core
          </p>

          <h2>
            Learning Performance
          </h2>

          <p className="brain-analytics-hero-intro">
            Vault Brain measures how closely its
            recommendations align with your confirmed
            catalogue decisions.
          </p>
        </div>

        <div className="brain-analytics-accuracy">
          <span>
            Recommendation accuracy
          </span>

          <motion.strong
            animate={{
              opacity: 1,
              scale: 1,
            }}
            initial={{
              opacity: 0,
              scale: 0.9,
            }}
            transition={{
              delay: 0.12,
              duration: 0.3,
            }}
          >
            {hasLoaded
              ? `${accuracy}%`
              : "—"}
          </motion.strong>

          <small>
            {analytics.totalDecisions > 0
              ? `Learning from ${analytics.totalDecisions} ${
                  analytics.totalDecisions === 1
                    ? "decision"
                    : "decisions"
                }`
              : "No decisions recorded yet"}
          </small>
        </div>
      </header>

      <div className="brain-analytics-pulse">
        <span className="brain-analytics-pulse-line" />

        <motion.span
          animate={{
            opacity: [
              0.45,
              1,
              0.45,
            ],
            scale: [
              0.96,
              1.04,
              0.96,
            ],
          }}
          aria-hidden="true"
          className="brain-analytics-pulse-node"
          transition={{
            duration: 2.4,
            ease: "easeInOut",
            repeat: Infinity,
          }}
        />
      </div>

      <div className="brain-analytics-grid">
        <article>
          <span>
            Decisions learned
          </span>

          <strong>
            {hasLoaded
              ? analytics.totalDecisions
              : "—"}
          </strong>

          <small>
            Confirmed catalogue choices
          </small>
        </article>

        <article>
          <span>
            Accepted
          </span>

          <strong>
            {hasLoaded
              ? analytics
                  .acceptedRecommendations
              : "—"}
          </strong>

          <small>
            Recommended matches confirmed
          </small>
        </article>

        <article>
          <span>
            Overrides
          </span>

          <strong>
            {hasLoaded
              ? analytics.manualOverrides
              : "—"}
          </strong>

          <small>
            Manual decisions recorded
          </small>
        </article>

        <article>
          <span>
            Average confidence
          </span>

          <strong>
            {hasLoaded
              ? `${analytics.averageAcceptedConfidence}%`
              : "—"}
          </strong>

          <small>
            Confidence across accepted matches
          </small>
        </article>
      </div>

      <footer className="brain-analytics-status-panel">
        <div className="brain-analytics-status-icon">
          <span aria-hidden="true">
            ✦
          </span>
        </div>

        <div>
          <span>
            Brain status
          </span>

          <strong>
            {hasLoaded
              ? learningStatus.label
              : "Loading intelligence"}
          </strong>

          <p>
            {hasLoaded
              ? learningStatus.message
              : "Reading stored learning events and preparing performance analytics."}
          </p>
        </div>
      </footer>
    </motion.section>
  );
}