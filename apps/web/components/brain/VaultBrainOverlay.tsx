"use client";

import {
  useEffect,
} from "react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

type Props = {
  visible: boolean;
  title: string;
  status: string;
  progress: number;
};

function clampProgress(
  progress: number,
): number {
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(progress),
    ),
  );
}

export function VaultBrainOverlay({
  visible,
  title,
  status,
  progress,
}: Props) {
  const reducedMotion =
    useReducedMotion();

  const safeProgress =
    clampProgress(progress);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          animate={{
            opacity: 1,
          }}
          aria-live="polite"
          aria-modal="true"
          className="vault-brain-overlay"
          exit={{
            opacity: 0,
          }}
          initial={{
            opacity: 0,
          }}
          role="dialog"
          transition={{
            duration:
              reducedMotion
                ? 0
                : 0.22,
          }}
        >
          <motion.div
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            className="vault-brain-overlay-panel"
            exit={{
              opacity: 0,
              scale:
                reducedMotion
                  ? 1
                  : 0.985,
              y:
                reducedMotion
                  ? 0
                  : 8,
            }}
            initial={{
              opacity: 0,
              scale:
                reducedMotion
                  ? 1
                  : 0.985,
              y:
                reducedMotion
                  ? 0
                  : 14,
            }}
            transition={{
              duration:
                reducedMotion
                  ? 0
                  : 0.28,
              ease: "easeOut",
            }}
          >
            <div
              aria-hidden="true"
              className="vault-brain-overlay-aura"
            />

            <header className="vault-brain-overlay-header">
              <div className="vault-brain-overlay-mark">
                <span>V</span>
              </div>

              <div>
                <p className="vault-eyebrow">
                  Vault Brain
                </p>

                <h2>
                  {title}
                </h2>
              </div>
            </header>

            <section className="vault-brain-overlay-status">
              <AnimatePresence
                initial={false}
                mode="wait"
              >
                <motion.p
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  exit={{
                    opacity: 0,
                    y:
                      reducedMotion
                        ? 0
                        : -6,
                  }}
                  initial={{
                    opacity: 0,
                    y:
                      reducedMotion
                        ? 0
                        : 6,
                  }}
                  key={status}
                  transition={{
                    duration:
                      reducedMotion
                        ? 0
                        : 0.18,
                  }}
                >
                  {status}
                </motion.p>
              </AnimatePresence>

              <strong>
                {safeProgress}%
              </strong>
            </section>

            <div
              aria-label={`${safeProgress}% complete`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={
                safeProgress
              }
              className="vault-brain-overlay-progress"
              role="progressbar"
            >
              <motion.span
                animate={{
                  width:
                    `${safeProgress}%`,
                }}
                initial={false}
                transition={{
                  duration:
                    reducedMotion
                      ? 0
                      : 0.42,
                  ease: "easeOut",
                }}
              />
            </div>

            <div className="vault-brain-overlay-pulse">
              <span />
              <span />
              <span />
            </div>

            <p className="vault-brain-overlay-note">
              Keep this window open while Vault Vision
              processes the selected supplier evidence.
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}