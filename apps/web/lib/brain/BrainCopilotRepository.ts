import type {
  BrainCopilotRecommendation,
} from "@/types/brain-copilot";

const STORAGE_KEY =
  "vault-brain-copilot-recommendations";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readStoredRecommendations():
  BrainCopilotRecommendation[] {
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
            BrainCopilotRecommendation[]
        )
      : [];
  } catch (error) {
    console.error(
      "Vault Brain could not read Copilot recommendations.",
      error,
    );

    return [];
  }
}

function writeStoredRecommendations(
  recommendations:
    BrainCopilotRecommendation[],
): boolean {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        recommendations,
      ),
    );

    return true;
  } catch (error) {
    console.error(
      "Vault Brain could not save Copilot recommendations.",
      error,
    );

    return false;
  }
}

export const BrainCopilotRepository = {
  getAll():
    BrainCopilotRecommendation[] {
    return readStoredRecommendations();
  },

  getLatest():
    BrainCopilotRecommendation | null {
    return (
      readStoredRecommendations()[0] ??
      null
    );
  },

  save(
    recommendation:
      BrainCopilotRecommendation,
  ): boolean {
    const current =
      readStoredRecommendations();

    const next = [
      recommendation,
      ...current.filter(
        (existing) =>
          existing.id !==
          recommendation.id,
      ),
    ].slice(
      0,
      50,
    );

    return writeStoredRecommendations(
      next,
    );
  },

  remove(
    recommendationId: string,
  ): boolean {
    const current =
      readStoredRecommendations();

    return writeStoredRecommendations(
      current.filter(
        (recommendation) =>
          recommendation.id !==
          recommendationId,
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
        "Vault Brain could not clear Copilot recommendations.",
        error,
      );

      return false;
    }
  },
} as const;