import type {
  BrainSignal,
} from "@/lib/brain/BrainSignalsEngine";

const STORAGE_KEY =
  "vault-brain-signals";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredSignals():
  BrainSignal[] {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(
        raw,
      ) as unknown;

    return Array.isArray(parsed)
      ? (
          parsed as
            BrainSignal[]
        )
      : [];
  } catch (error) {
    console.error(
      "Vault Brain could not read signals.",
      error,
    );

    return [];
  }
}

function writeStoredSignals(
  signals: BrainSignal[],
): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        signals,
      ),
    );

    return true;
  } catch (error) {
    console.error(
      "Vault Brain could not save signals.",
      error,
    );

    return false;
  }
}

export const BrainSignalsRepository = {
  getAll():
    BrainSignal[] {
    return readStoredSignals();
  },

  getLatest():
    BrainSignal | null {
    return (
      readStoredSignals()[0] ??
      null
    );
  },

  save(
    signal: BrainSignal,
  ): boolean {
    const current =
      readStoredSignals();

    const next = [
      signal,
      ...current.filter(
        (existing) =>
          existing.id !==
          signal.id,
      ),
    ].slice(
      0,
      100,
    );

    return writeStoredSignals(
      next,
    );
  },

  saveMany(
    signals: BrainSignal[],
  ): boolean {
    const current =
      readStoredSignals();

    const incomingIds =
      new Set(
        signals.map(
          (signal) =>
            signal.id,
        ),
      );

    const next = [
      ...signals,
      ...current.filter(
        (existing) =>
          !incomingIds.has(
            existing.id,
          ),
      ),
    ].slice(
      0,
      100,
    );

    return writeStoredSignals(
      next,
    );
  },

  remove(
    signalId: string,
  ): boolean {
    const current =
      readStoredSignals();

    return writeStoredSignals(
      current.filter(
        (signal) =>
          signal.id !==
          signalId,
      ),
    );
  },

  clear(): boolean {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );

      return true;
    } catch (error) {
      console.error(
        "Vault Brain could not clear signals.",
        error,
      );

      return false;
    }
  },
} as const;