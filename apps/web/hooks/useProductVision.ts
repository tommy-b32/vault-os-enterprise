"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ProductVisionStatus = {
  totalCatalogueProducts: number;
  analysedProducts: number;
  pendingProducts: number;
  nextProducts: Array<{
    productId: string;
    productName: string;
    imageUrl: string;
  }>;
};

export type ProductVisionFailure = {
  productId: string;
  productName: string;
  error: string;
};

type ProductVisionIndexResult = {
  success: boolean;
  force: boolean;
  batchLimit: number;
  totalCatalogueProducts: number;
  pendingBeforeRun: number;
  attempted: number;
  completedCount: number;
  failedCount: number;
  remainingProducts: number;
  complete: boolean;
  completed: Array<{
    productId: string;
    productName: string;
    model: string;
    analysedAt: string;
  }>;
  failed: ProductVisionFailure[];
};

type ApiError = {
  error?: string;
};

const DEFAULT_BATCH_SIZE = 15;
const MAX_CONSECUTIVE_EMPTY_BATCHES = 2;

function toProductIntelligenceCopy(
  message: string,
): string {
  return message.replaceAll(
    "Product Vision",
    "Product Intelligence",
  );
}

function normaliseCount(
  value: unknown,
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? Math.max(
        0,
        value,
      )
    : 0;
}

async function readJson<T>(
  response: Response,
): Promise<T> {
  const payload =
    (await response.json()) as
      T & ApiError;

  if (!response.ok) {
    throw new Error(
      payload.error ||
        `Request failed with status ${response.status}.`,
    );
  }

  return payload;
}

export default function useProductVision() {
  const [
    status,
    setStatus,
  ] =
    useState<ProductVisionStatus | null>(
      null,
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    isIndexing,
    setIsIndexing,
  ] =
    useState(false);

  const [
    isPaused,
    setIsPaused,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    latestModel,
    setLatestModel,
  ] =
    useState<string | null>(
      null,
    );

  const [
    latestMessage,
    setLatestMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    failedProducts,
    setFailedProducts,
  ] =
    useState<ProductVisionFailure[]>(
      [],
    );

  const [
    completedThisRun,
    setCompletedThisRun,
  ] =
    useState(0);

  const [
    startedAt,
    setStartedAt,
  ] =
    useState<number | null>(
      null,
    );

  const mountedRef =
    useRef(true);

  const shouldContinueRef =
    useRef(false);

  const pauseRequestedRef =
    useRef(false);

  const activeRequestRef =
    useRef<AbortController | null>(
      null,
    );

  const loadStatus =
    useCallback(
      async (
        silent = false,
      ) => {
        if (!silent) {
          setIsLoading(true);
        }

        try {
          const response =
            await fetch(
              "/api/product-vision/index",
              {
                method: "GET",
                cache: "no-store",
              },
            );

          const payload =
            await readJson<ProductVisionStatus>(
              response,
            );

          if (!mountedRef.current) {
            return;
          }

          setStatus({
            totalCatalogueProducts:
              normaliseCount(
                payload.totalCatalogueProducts,
              ),

            analysedProducts:
              normaliseCount(
                payload.analysedProducts,
              ),

            pendingProducts:
              normaliseCount(
                payload.pendingProducts,
              ),

            nextProducts:
              Array.isArray(
                payload.nextProducts,
              )
                ? payload.nextProducts
                : [],
          });

          setError(null);
        } catch (caughtError) {
          if (!mountedRef.current) {
            return;
          }

          setError(
            caughtError instanceof Error
              ? toProductIntelligenceCopy(
                  caughtError.message,
                )
              : "Unable to load Product Intelligence status.",
          );
        } finally {
          if (
            mountedRef.current &&
            !silent
          ) {
            setIsLoading(false);
          }
        }
      },
      [],
    );

  useEffect(() => {
    mountedRef.current = true;

    void loadStatus();

    return () => {
      mountedRef.current = false;
      shouldContinueRef.current = false;

      activeRequestRef.current?.abort();
    };
  }, [loadStatus]);

  const stopIndexing =
    useCallback(() => {
      shouldContinueRef.current = false;
      pauseRequestedRef.current = false;

      activeRequestRef.current?.abort();
      activeRequestRef.current = null;

      if (mountedRef.current) {
        setIsIndexing(false);
        setIsPaused(false);
        setLatestMessage(
          "Product Intelligence indexing stopped.",
        );
      }
    }, []);

  const pauseIndexing =
    useCallback(() => {
      if (!isIndexing) {
        return;
      }

      pauseRequestedRef.current = true;
      shouldContinueRef.current = false;

      setIsPaused(true);
      setLatestMessage(
        "Product Intelligence will pause after the current batch.",
      );
    }, [isIndexing]);

  const runIndexing =
    useCallback(
      async () => {
        if (
          isIndexing &&
          !isPaused
        ) {
          return;
        }

        shouldContinueRef.current = true;
        pauseRequestedRef.current = false;

        setIsIndexing(true);
        setIsPaused(false);
        setError(null);
        setLatestMessage(
          "Building Product Intelligence…",
        );
        setFailedProducts([]);
        setCompletedThisRun(0);
        setStartedAt(
          Date.now(),
        );

        let consecutiveEmptyBatches = 0;

        try {
          while (
            shouldContinueRef.current &&
            mountedRef.current
          ) {
            const controller =
              new AbortController();

            activeRequestRef.current =
              controller;

            const response =
              await fetch(
                "/api/product-vision/index",
                {
                  method: "POST",

                  headers: {
                    "Content-Type":
                      "application/json",
                  },

                  body:
                    JSON.stringify({
                      limit:
                        DEFAULT_BATCH_SIZE,
                      force:
                        false,
                    }),

                  signal:
                    controller.signal,
                },
              );

            const result =
              await readJson<ProductVisionIndexResult>(
                response,
              );

            activeRequestRef.current =
              null;

            if (
              !mountedRef.current
            ) {
              return;
            }

            const analysedProducts =
              Math.max(
                0,
                result.totalCatalogueProducts -
                  result.remainingProducts,
              );

            setStatus({
              totalCatalogueProducts:
                normaliseCount(
                  result.totalCatalogueProducts,
                ),

              analysedProducts,

              pendingProducts:
                normaliseCount(
                  result.remainingProducts,
                ),

              nextProducts: [],
            });

            if (
              Array.isArray(
                result.failed,
              ) &&
              result.failed.length > 0
            ) {
              setFailedProducts(
                (current) => [
                  ...current,
                  ...result.failed.map(
                    (failure) => ({
                      ...failure,
                      error:
                        toProductIntelligenceCopy(
                          failure.error,
                        ),
                    }),
                  ),
                ],
              );
            }

            const model =
              result.completed?.[0]
                ?.model;

            if (model) {
              setLatestModel(
                model,
              );
            }

            setCompletedThisRun(
              (current) =>
                current +
                normaliseCount(
                  result.completedCount,
                ),
            );

            if (
              result.completedCount > 0
            ) {
              consecutiveEmptyBatches = 0;

              setLatestMessage(
                `${analysedProducts} of ${result.totalCatalogueProducts} styles indexed.`,
              );
            } else {
              consecutiveEmptyBatches += 1;
            }

            if (
              result.complete ||
              result.remainingProducts === 0
            ) {
              shouldContinueRef.current = false;

              setLatestMessage(
                "Product Intelligence indexing is complete.",
              );

              break;
            }

            if (
              pauseRequestedRef.current
            ) {
              shouldContinueRef.current = false;

              setLatestMessage(
                "Product Intelligence indexing is paused.",
              );

              break;
            }

            if (
              consecutiveEmptyBatches >=
              MAX_CONSECUTIVE_EMPTY_BATCHES
            ) {
              throw new Error(
                "Product Intelligence could not make progress. Review the failed products before continuing.",
              );
            }
          }

          await loadStatus(
            true,
          );
        } catch (caughtError) {
          if (
            caughtError instanceof DOMException &&
            caughtError.name ===
              "AbortError"
          ) {
            return;
          }

          if (!mountedRef.current) {
            return;
          }

          shouldContinueRef.current = false;

          setError(
            caughtError instanceof Error
              ? toProductIntelligenceCopy(
                  caughtError.message,
                )
              : "Unable to continue Product Intelligence indexing.",
          );
        } finally {
          activeRequestRef.current =
            null;

          if (mountedRef.current) {
            setIsIndexing(false);
            setIsPaused(
              pauseRequestedRef.current,
            );
          }
        }
      },
      [
        isIndexing,
        isPaused,
        loadStatus,
      ],
    );

  const totalProducts =
    status?.totalCatalogueProducts ??
    0;

  const analysedProducts =
    status?.analysedProducts ??
    0;

  const pendingProducts =
    status?.pendingProducts ??
    0;

  const progress =
    useMemo(() => {
      if (
        totalProducts <= 0
      ) {
        return 0;
      }

      return Math.min(
        100,
        Math.max(
          0,
          Math.round(
            (analysedProducts /
              totalProducts) *
              100,
          ),
        ),
      );
    }, [
      analysedProducts,
      totalProducts,
    ]);

  const isComplete =
    totalProducts > 0 &&
    pendingProducts === 0;

  const elapsedSeconds =
    startedAt === null
      ? 0
      : Math.max(
          1,
          Math.round(
            (Date.now() -
              startedAt) /
              1000,
          ),
        );

  const productsPerMinute =
    completedThisRun > 0
      ? Math.round(
          (completedThisRun /
            elapsedSeconds) *
            60 *
            10,
        ) / 10
      : 0;

  const estimatedMinutesRemaining =
    productsPerMinute > 0
      ? Math.ceil(
          pendingProducts /
            productsPerMinute,
        )
      : null;

  return {
    status,
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
    loadStatus,
    runIndexing,
    pauseIndexing,
    stopIndexing,
  };
}
