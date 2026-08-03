import type {
  BrainLearningEvent,
} from "@/types/brain-learning";

const STORAGE_KEY =
  "vault-brain-learning-events";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredEvents():
  BrainLearningEvent[] {
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
            BrainLearningEvent[]
        )
      : [];
  } catch (error) {
    console.error(
      "Vault Brain could not read learning events.",
      error,
    );

    return [];
  }
}

function writeStoredEvents(
  events: BrainLearningEvent[],
): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        events,
      ),
    );

    return true;
  } catch (error) {
    console.error(
      "Vault Brain could not save learning events.",
      error,
    );

    return false;
  }
}

export const BrainLearningRepository = {
  getAll():
    BrainLearningEvent[] {
    return readStoredEvents();
  },

  save(
    event: BrainLearningEvent,
  ): boolean {
    const current =
      readStoredEvents();

    const next = [
      event,
      ...current.filter(
        (existing) =>
          existing.id !==
          event.id,
      ),
    ];

    return writeStoredEvents(
      next,
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
        "Vault Brain could not clear learning events.",
        error,
      );

      return false;
    }
  },
} as const;