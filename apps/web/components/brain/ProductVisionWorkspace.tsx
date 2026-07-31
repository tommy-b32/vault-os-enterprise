"use client";

import useProductVision from "@/hooks/useProductVision";

function formatEta(
  minutes: number | null,
): string {
  if (minutes === null) {
    return "Calculating…";
  }

  if (minutes <= 1) {
    return "Less than 1 minute";
  }

  return `About ${minutes} minutes`;
}

export default function ProductVisionWorkspace() {
  const {
    isLoading,
    isIndexing,
    isPaused,
    isComplete,
    error,
    latestModel,
    latestMessage,
    failedProducts,
    totalProducts,
    analysedProducts,
    pendingProducts,
    progress,
    completedThisRun,
    productsPerMinute,
    estimatedMinutesRemaining,
    runIndexing,
    pauseIndexing,
    stopIndexing,
  } = useProductVision();

  const primaryActionLabel =
    isComplete
      ? "Vision Index Complete"
      : isIndexing
        ? "Indexing Products…"
        : isPaused
          ? "Resume Indexing"
          : analysedProducts > 0
            ? "Continue Indexing"
            : "Start Vision Indexing";

  const statusLabel =
    isComplete
      ? "Vision Ready"
      : isIndexing
        ? "Analysing"
        : isPaused
          ? "Paused"
          : "Index Active";

  return (
    <section
      className="tfv-product-vision"
      aria-labelledby="product-vision-title"
    >
      <div className="tfv-product-vision__aura" />

      <div className="tfv-product-vision__header">
        <div>
          <p className="tfv-product-vision__eyebrow">
            Catalogue Intelligence
          </p>

          <h2
            id="product-vision-title"
            className="tfv-product-vision__title"
          >
            Product Vision
          </h2>

          <p className="tfv-product-vision__description">
            Vault OS is building a reusable visual
            fingerprint for every style in your catalogue.
            Start it once and the engine will continue
            automatically until the catalogue is complete.
          </p>
        </div>

        <div
          className={[
            "tfv-product-vision__status",
            isComplete
              ? "tfv-product-vision__status--complete"
              : "",
            isPaused
              ? "tfv-product-vision__status--paused"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="tfv-product-vision__status-dot" />
          {statusLabel}
        </div>
      </div>

      <div className="tfv-product-vision__progress-panel">
        <div className="tfv-product-vision__progress-heading">
          <div>
            <span className="tfv-product-vision__progress-label">
              Catalogue indexed
            </span>

            <strong className="tfv-product-vision__progress-value">
              {isLoading
                ? "—"
                : `${progress}%`}
            </strong>
          </div>

          <span className="tfv-product-vision__progress-caption">
            {isLoading
              ? "Reading catalogue…"
              : `${analysedProducts} of ${totalProducts} styles`}
          </span>
        </div>

        <div
          className="tfv-product-vision__track"
          role="progressbar"
          aria-label="Product Vision indexing progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={[
              "tfv-product-vision__fill",
              isIndexing
                ? "tfv-product-vision__fill--active"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </div>

      <div className="tfv-product-vision__metrics">
        <article className="tfv-product-vision__metric">
          <span className="tfv-product-vision__metric-label">
            Analysed
          </span>

          <strong className="tfv-product-vision__metric-value">
            {isLoading
              ? "—"
              : analysedProducts}
          </strong>

          <span className="tfv-product-vision__metric-note">
            Visual fingerprints stored
          </span>
        </article>

        <article className="tfv-product-vision__metric">
          <span className="tfv-product-vision__metric-label">
            Remaining
          </span>

          <strong className="tfv-product-vision__metric-value">
            {isLoading
              ? "—"
              : pendingProducts}
          </strong>

          <span className="tfv-product-vision__metric-note">
            Awaiting AI analysis
          </span>
        </article>

        <article className="tfv-product-vision__metric">
          <span className="tfv-product-vision__metric-label">
            Throughput
          </span>

          <strong className="tfv-product-vision__metric-value">
            {isIndexing || completedThisRun > 0
              ? `${productsPerMinute}/min`
              : "Ready"}
          </strong>

          <span className="tfv-product-vision__metric-note">
            {completedThisRun > 0
              ? `${completedThisRun} completed this run`
              : "Measured during indexing"}
          </span>
        </article>

        <article className="tfv-product-vision__metric">
          <span className="tfv-product-vision__metric-label">
            Estimated completion
          </span>

          <strong className="tfv-product-vision__metric-value tfv-product-vision__metric-value--small">
            {isComplete
              ? "Complete"
              : isIndexing
                ? formatEta(
                    estimatedMinutesRemaining,
                  )
                : "Starts with indexing"}
          </strong>

          <span className="tfv-product-vision__metric-note">
            Recalculated after every batch
          </span>
        </article>

        <article className="tfv-product-vision__metric tfv-product-vision__metric--wide">
          <span className="tfv-product-vision__metric-label">
            Vision model
          </span>

          <strong className="tfv-product-vision__metric-value tfv-product-vision__metric-value--model">
            {latestModel ??
              "Configured server model"}
          </strong>

          <span className="tfv-product-vision__metric-note">
            Recorded with every analysis
          </span>
        </article>
      </div>

      {latestMessage ? (
        <div
          className="tfv-product-vision__notice"
          role="status"
        >
          {latestMessage}
        </div>
      ) : null}

      {error ? (
        <div
          className="tfv-product-vision__error"
          role="alert"
        >
          <strong>
            Product Vision could not continue.
          </strong>

          <span>{error}</span>
        </div>
      ) : null}

      {failedProducts.length > 0 ? (
        <div className="tfv-product-vision__failures">
          <strong>
            {failedProducts.length} item
            {failedProducts.length === 1
              ? ""
              : "s"}{" "}
            need attention
          </strong>

          {failedProducts
            .slice(0, 4)
            .map((failure) => (
              <span
                key={`${failure.productId}-${failure.error}`}
              >
                {failure.productName}:{" "}
                {failure.error}
              </span>
            ))}

          {failedProducts.length > 4 ? (
            <span>
              Plus {failedProducts.length - 4} more.
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="tfv-product-vision__footer">
        <div className="tfv-product-vision__next">
          <span className="tfv-product-vision__next-label">
            Indexing engine
          </span>

          <strong>
            15 styles per batch · 3 concurrent analyses
          </strong>
        </div>

        <div className="tfv-product-vision__actions">
          {isIndexing ? (
            <>
              <button
                type="button"
                className="tfv-product-vision__button tfv-product-vision__button--secondary"
                onClick={pauseIndexing}
              >
                Pause after batch
              </button>

              <button
                type="button"
                className="tfv-product-vision__button tfv-product-vision__button--danger"
                onClick={stopIndexing}
              >
                Stop
              </button>
            </>
          ) : null}

          <button
            type="button"
            className="tfv-product-vision__button"
            disabled={
              isLoading ||
              isIndexing ||
              isComplete ||
              totalProducts === 0
            }
            onClick={() => {
              void runIndexing();
            }}
          >
            <span>
              {primaryActionLabel}
            </span>

            <span
              aria-hidden="true"
              className="tfv-product-vision__button-icon"
            >
              {isComplete
                ? "✓"
                : isPaused
                  ? "↻"
                  : "→"}
            </span>
          </button>
        </div>
      </div>

      <style>{`
        .tfv-product-vision {
          position: relative;
          overflow: hidden;
          border: 1px solid
            rgba(202, 164, 88, 0.2);
          border-radius: 24px;
          padding: 28px;
          background:
            radial-gradient(
              circle at top right,
              rgba(202, 164, 88, 0.1),
              transparent 32%
            ),
            linear-gradient(
              145deg,
              rgba(15, 15, 18, 0.98),
              rgba(8, 8, 10, 0.98)
            );
          box-shadow:
            inset 0 1px 0
              rgba(255, 255, 255, 0.04),
            0 24px 70px
              rgba(0, 0, 0, 0.28);
          color: #f7f4ec;
        }

        .tfv-product-vision__aura {
          position: absolute;
          top: -120px;
          right: -90px;
          width: 280px;
          height: 280px;
          border-radius: 999px;
          background: rgba(
            202,
            164,
            88,
            0.08
          );
          filter: blur(70px);
          pointer-events: none;
        }

        .tfv-product-vision__header,
        .tfv-product-vision__progress-heading,
        .tfv-product-vision__footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .tfv-product-vision__eyebrow,
        .tfv-product-vision__progress-label,
        .tfv-product-vision__metric-label,
        .tfv-product-vision__next-label {
          margin: 0;
          color: rgba(
            224,
            197,
            137,
            0.72
          );
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .tfv-product-vision__title {
          margin: 6px 0 0;
          font-size: clamp(
            1.55rem,
            3vw,
            2.15rem
          );
          line-height: 1.05;
          letter-spacing: -0.035em;
        }

        .tfv-product-vision__description {
          max-width: 680px;
          margin: 12px 0 0;
          color: rgba(
            247,
            244,
            236,
            0.62
          );
          line-height: 1.65;
        }

        .tfv-product-vision__status {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          gap: 9px;
          border: 1px solid
            rgba(202, 164, 88, 0.22);
          border-radius: 999px;
          padding: 9px 13px;
          background: rgba(
            202,
            164,
            88,
            0.07
          );
          color: #e2c889;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .tfv-product-vision__status-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: currentColor;
          box-shadow: 0 0 14px
            currentColor;
        }

        .tfv-product-vision__status--complete {
          color: #b8e5c6;
          border-color: rgba(
            126,
            211,
            154,
            0.24
          );
          background: rgba(
            126,
            211,
            154,
            0.07
          );
        }

        .tfv-product-vision__status--paused {
          color: #f0c98b;
        }

        .tfv-product-vision__progress-panel {
          position: relative;
          z-index: 1;
          margin-top: 30px;
          border: 1px solid
            rgba(255, 255, 255, 0.055);
          border-radius: 18px;
          padding: 20px;
          background: rgba(
            255,
            255,
            255,
            0.025
          );
        }

        .tfv-product-vision__progress-value {
          display: block;
          margin-top: 6px;
          font-size: 1.9rem;
          letter-spacing: -0.04em;
        }

        .tfv-product-vision__progress-caption {
          color: rgba(
            247,
            244,
            236,
            0.48
          );
          font-size: 0.84rem;
        }

        .tfv-product-vision__track {
          position: relative;
          overflow: hidden;
          height: 9px;
          margin-top: 18px;
          border-radius: 999px;
          background: rgba(
            255,
            255,
            255,
            0.07
          );
        }

        .tfv-product-vision__fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(
            90deg,
            #8c6b2d,
            #e2c889
          );
          box-shadow: 0 0 24px
            rgba(202, 164, 88, 0.28);
          transition: width 420ms ease;
        }

        .tfv-product-vision__fill--active {
          animation:
            tfv-product-vision-pulse
            1.4s ease-in-out infinite;
        }

        .tfv-product-vision__metrics {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .tfv-product-vision__metric {
          min-width: 0;
          border: 1px solid
            rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 18px;
          background: rgba(
            255,
            255,
            255,
            0.02
          );
        }

        .tfv-product-vision__metric--wide {
          grid-column: span 4;
        }

        .tfv-product-vision__metric-value {
          display: block;
          margin-top: 10px;
          overflow: hidden;
          font-size: 1.45rem;
          letter-spacing: -0.03em;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .tfv-product-vision__metric-value--small,
        .tfv-product-vision__metric-value--model {
          font-size: 1rem;
          line-height: 1.4;
        }

        .tfv-product-vision__metric-note {
          display: block;
          margin-top: 8px;
          color: rgba(
            247,
            244,
            236,
            0.42
          );
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .tfv-product-vision__notice,
        .tfv-product-vision__error,
        .tfv-product-vision__failures {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-top: 14px;
          border-radius: 14px;
          padding: 13px 15px;
          font-size: 0.84rem;
        }

        .tfv-product-vision__notice {
          border: 1px solid
            rgba(202, 164, 88, 0.14);
          background: rgba(
            202,
            164,
            88,
            0.055
          );
          color: #dfc587;
        }

        .tfv-product-vision__error,
        .tfv-product-vision__failures {
          border: 1px solid
            rgba(240, 119, 119, 0.18);
          background: rgba(
            240,
            119,
            119,
            0.06
          );
          color: #f0b0b0;
        }

        .tfv-product-vision__footer {
          margin-top: 22px;
          border-top: 1px solid
            rgba(255, 255, 255, 0.055);
          padding-top: 20px;
        }

        .tfv-product-vision__next strong {
          display: block;
          margin-top: 5px;
          font-size: 0.92rem;
        }

        .tfv-product-vision__actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }

        .tfv-product-vision__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 14px;
          min-height: 46px;
          border: 1px solid
            rgba(226, 200, 137, 0.34);
          border-radius: 12px;
          padding: 0 17px;
          background: linear-gradient(
            135deg,
            #d8bc7a,
            #9d7834
          );
          color: #11100d;
          font: inherit;
          font-size: 0.84rem;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 12px 34px
            rgba(157, 120, 52, 0.2);
          transition:
            transform 160ms ease,
            opacity 160ms ease,
            box-shadow 160ms ease;
        }

        .tfv-product-vision__button--secondary {
          border-color: rgba(
            226,
            200,
            137,
            0.22
          );
          background: rgba(
            226,
            200,
            137,
            0.08
          );
          color: #e2c889;
          box-shadow: none;
        }

        .tfv-product-vision__button--danger {
          border-color: rgba(
            240,
            119,
            119,
            0.22
          );
          background: rgba(
            240,
            119,
            119,
            0.08
          );
          color: #f0b0b0;
          box-shadow: none;
        }

        .tfv-product-vision__button:hover:not(
            :disabled
          ) {
          transform: translateY(-1px);
          box-shadow: 0 16px 42px
            rgba(157, 120, 52, 0.28);
        }

        .tfv-product-vision__button:disabled {
          opacity: 0.48;
          cursor: not-allowed;
          box-shadow: none;
        }

        .tfv-product-vision__button-icon {
          font-size: 1rem;
        }

        @keyframes tfv-product-vision-pulse {
          0%,
          100% {
            filter: brightness(1);
          }

          50% {
            filter: brightness(1.35);
          }
        }

        @media (max-width: 940px) {
          .tfv-product-vision__metrics {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .tfv-product-vision__metric--wide {
            grid-column: span 2;
          }
        }

        @media (max-width: 760px) {
          .tfv-product-vision {
            padding: 21px;
            border-radius: 20px;
          }

          .tfv-product-vision__header,
          .tfv-product-vision__footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .tfv-product-vision__metrics {
            grid-template-columns: 1fr;
          }

          .tfv-product-vision__metric--wide {
            grid-column: span 1;
          }

          .tfv-product-vision__status {
            align-self: flex-start;
          }

          .tfv-product-vision__actions {
            width: 100%;
            align-items: stretch;
            flex-direction: column;
          }

          .tfv-product-vision__button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}