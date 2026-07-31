"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  LiveIntelligenceEvent,
  LiveIntelligenceFeed as LiveIntelligenceFeedModel,
} from "@/lib/brain/LiveIntelligenceEngine";

import type {
  VaultBrainSignalTone,
} from "@/lib/brain/types";

const FEED_START_DELAY_MS = 1050;
const THINKING_DURATION_MS = 420;
const EVENT_PAUSE_MS = 520;
const TYPEWRITER_INTERVAL_MS = 12;
const TYPEWRITER_CHARACTERS_PER_TICK = 2;

type LiveIntelligenceFeedProps = {
  feed: LiveIntelligenceFeedModel;
};

type FeedPhase =
  | "waiting"
  | "thinking"
  | "typing"
  | "live";

function getToneClass(
  tone: VaultBrainSignalTone,
): string {
  return `live-intelligence-${tone}`;
}

function getThinkingLabel(
  event: LiveIntelligenceEvent | null,
): string {
  if (!event) {
    return "Preparing intelligence";
  }

  switch (event.source) {
    case "shopify":
      return "Analysing trading activity";

    case "inventory":
      return "Calculating inventory impact";

    case "commercial":
      return "Reviewing commercial performance";

    case "supplier":
      return "Checking supplier exposure";

    case "catalogue":
      return "Refreshing catalogue intelligence";

    case "capital":
      return "Recalculating purchasing power";

    case "missions":
      return "Ranking today’s priorities";

    case "system":
      return "Checking Vault systems";
  }
}

function EventIcon({
  event,
}: {
  event: LiveIntelligenceEvent;
}) {
  if (
    event.tone === "critical" ||
    event.tone === "warning"
  ) {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (event.source === "missions") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 4V2" />
        <path d="M20 12h2" />
        <path d="M12 20v2" />
        <path d="M4 12H2" />
      </svg>
    );
  }

  if (event.source === "capital") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 7.5a3 3 0 0 0-5 2v6" />
        <path d="M8 12h5" />
        <path d="M8 17h8" />
      </svg>
    );
  }

  if (event.source === "inventory") {
    return (
      <svg
        aria-hidden="true"
        fill="none"
        height="18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
        width="18"
      >
        <path d="M4 7h16v13H4z" />
        <path d="M7 4h10l2 3H5z" />
        <path d="M9 11h6" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export default function LiveIntelligenceFeed({
  feed,
}: LiveIntelligenceFeedProps) {
  /*
   * LiveIntelligenceEngine returns newest-first.
   *
   * We reverse it into an oldest-first reveal queue, then reverse
   * the currently visible portion for display. This means every
   * newly revealed update is inserted at the top of the timeline.
   */
  const revealQueue = useMemo(
    () => [...feed.events].reverse(),
    [feed.events],
  );

  const [visibleEventCount, setVisibleEventCount] =
    useState(0);

  const [activeQueueIndex, setActiveQueueIndex] =
    useState(-1);

  const [typedDescription, setTypedDescription] =
    useState("");

  const [feedPhase, setFeedPhase] =
    useState<FeedPhase>("waiting");

  useEffect(() => {
    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    if (
      reducedMotion ||
      revealQueue.length === 0
    ) {
      setVisibleEventCount(
        revealQueue.length,
      );

      setActiveQueueIndex(
        revealQueue.length - 1,
      );

      setFeedPhase("live");
      return;
    }

    let cancelled = false;

    const timeoutIds: number[] = [];

    let typewriterInterval:
      | number
      | undefined;

    function schedule(
      callback: () => void,
      delayMs: number,
    ) {
      const timeoutId =
        window.setTimeout(() => {
          if (!cancelled) {
            callback();
          }
        }, delayMs);

      timeoutIds.push(timeoutId);
    }

    function revealEvent(
      queueIndex: number,
    ) {
      if (
        cancelled ||
        queueIndex >= revealQueue.length
      ) {
        setFeedPhase("live");
        return;
      }

      const event =
        revealQueue[queueIndex];

      setActiveQueueIndex(queueIndex);
      setTypedDescription("");
      setFeedPhase("thinking");

      schedule(() => {
        setVisibleEventCount(
          queueIndex + 1,
        );

        setFeedPhase("typing");

        const description =
          event.description;

        let characterIndex = 0;

        typewriterInterval =
          window.setInterval(() => {
            characterIndex = Math.min(
              characterIndex +
                TYPEWRITER_CHARACTERS_PER_TICK,
              description.length,
            );

            setTypedDescription(
              description.slice(
                0,
                characterIndex,
              ),
            );

            if (
              characterIndex >=
              description.length
            ) {
              if (typewriterInterval) {
                window.clearInterval(
                  typewriterInterval,
                );
              }

              typewriterInterval =
                undefined;

              schedule(() => {
                revealEvent(
                  queueIndex + 1,
                );
              }, EVENT_PAUSE_MS);
            }
          }, TYPEWRITER_INTERVAL_MS);
      }, THINKING_DURATION_MS);
    }

    schedule(() => {
      revealEvent(0);
    }, FEED_START_DELAY_MS);

    return () => {
      cancelled = true;

      timeoutIds.forEach(
        (timeoutId) => {
          window.clearTimeout(
            timeoutId,
          );
        },
      );

      if (typewriterInterval) {
        window.clearInterval(
          typewriterInterval,
        );
      }
    };
  }, [revealQueue]);

  const visibleEvents = useMemo(
    () =>
      revealQueue
        .slice(
          0,
          visibleEventCount,
        )
        .reverse(),
    [
      revealQueue,
      visibleEventCount,
    ],
  );

  const activeEvent =
    activeQueueIndex >= 0
      ? revealQueue[
          activeQueueIndex
        ] ?? null
      : null;

  const latestVisibleEvent =
    visibleEvents[0] ?? null;

  const isAnalysisRunning =
    feedPhase !== "live";

  return (
    <section className="vault-live-section">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">
            Vault Brain Live
          </span>

          <h2>
            Intelligence activity
          </h2>
        </div>

        <span
          className={[
            "vault-live-status",
            isAnalysisRunning
              ? "is-analysing"
              : "is-live",
          ].join(" ")}
        >
          <i />

          {feedPhase === "waiting"
            ? "Preparing"
            : feedPhase === "thinking"
              ? "Thinking"
              : feedPhase === "typing"
                ? "Writing"
                : "Live"}
        </span>
      </div>

      <article className="vault-panel vault-live-panel">
        <div className="vault-live-summary">
          <div>
            <span className="vault-card-kicker">
              Continuous analysis
            </span>

            <strong>
              {feedPhase === "waiting"
                ? "Vault Brain is preparing the latest business activity"
                : feedPhase === "thinking"
                  ? getThinkingLabel(
                      activeEvent,
                    )
                  : feedPhase === "typing"
                    ? "Vault Brain has detected new intelligence"
                    : "Vault Brain is monitoring the latest business signals"}
            </strong>
          </div>

          <span className="vault-live-confidence">
            {feed.confidence}% confidence
          </span>
        </div>

        <div
          aria-live="polite"
          className="vault-live-timeline"
        >
          {feedPhase === "waiting" ? (
            <div className="vault-live-pending">
              <span />
              Preparing intelligence activity…
            </div>
          ) : null}

          {feedPhase === "thinking" ? (
            <div className="vault-live-thinking">
              <span className="vault-live-thinking-pulse">
                <i />
                <i />
                <i />
              </span>

              <div>
                <span>
                  Vault Brain
                </span>

                <strong>
                  {getThinkingLabel(
                    activeEvent,
                  )}
                </strong>
              </div>
            </div>
          ) : null}

          {visibleEvents.map(
            (event, index) => {
              const isLatest =
                event.id ===
                latestVisibleEvent?.id;

              const isOlder =
                index > 0;

              const isActivelyTyping =
                isLatest &&
                feedPhase === "typing" &&
                event.id ===
                  activeEvent?.id;

              const displayedDescription =
                isActivelyTyping
                  ? typedDescription
                  : event.description;

              return (
                <article
                  className={[
                    "vault-live-event",
                    getToneClass(
                      event.tone,
                    ),
                    "is-revealed",
                    isLatest
                      ? "is-latest"
                      : "",
                    isOlder
                      ? "is-older"
                      : "",
                    isActivelyTyping
                      ? "is-typing"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={event.id}
                >
                  <div className="vault-live-time">
                    <span>
                      {event.displayTime}
                    </span>

                    <i />
                  </div>

                  <div className="vault-live-event-card">
                    <span className="vault-live-event-icon">
                      <EventIcon
                        event={event}
                      />
                    </span>

                    <div className="vault-live-event-copy">
                      <div className="vault-live-event-topline">
                        <span>
                          {event.sourceLabel}
                        </span>

                        <div className="vault-live-event-meta">
                          {isLatest ? (
                            <span className="vault-live-new-badge">
                              New
                            </span>
                          ) : null}

                          <span>
                            {event.confidence}% confidence
                          </span>
                        </div>
                      </div>

                      <strong>
                        {event.title}
                      </strong>

                      <p>
                        {displayedDescription}

                        {isActivelyTyping ? (
                          <span
                            aria-hidden="true"
                            className="vault-live-typewriter-cursor"
                          />
                        ) : null}
                      </p>

                      {!isActivelyTyping &&
                      event.actionHref &&
                      event.actionLabel ? (
                        <Link
                          className="vault-live-action"
                          href={
                            event.actionHref
                          }
                        >
                          {event.actionLabel}

                          <span aria-hidden="true">
                            →
                          </span>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            },
          )}
        </div>
      </article>
    </section>
  );
}