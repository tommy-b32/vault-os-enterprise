import type {
  MissionDraft,
  MissionSource,
} from "@/types/missions";

export type MissionGenerationContext = {
  organisationId?: string;
  generatedAt: Date;
  signals: Readonly<Record<string, unknown>>;
};

export type MissionProvider = {
  id: string;
  source: MissionSource;
  generate: (
    context: MissionGenerationContext,
  ) => MissionDraft[] | Promise<MissionDraft[]>;
};

export type MissionProviderFailure = {
  providerId: string;
  source: MissionSource;
  error: unknown;
};

export type MissionRegistryResult = {
  drafts: MissionDraft[];
  failures: MissionProviderFailure[];
};

function isValidProvider(provider: MissionProvider): boolean {
  return (
    typeof provider.id === "string" &&
    provider.id.trim().length > 0 &&
    typeof provider.generate === "function"
  );
}

export class MissionRegistry {
  private readonly providers = new Map<string, MissionProvider>();

  register(provider: MissionProvider): () => void {
    if (!isValidProvider(provider)) {
      throw new Error(
        "Mission providers require a non-empty id and generate function.",
      );
    }

    const providerId = provider.id.trim();

    this.providers.set(providerId, {
      ...provider,
      id: providerId,
    });

    return () => {
      this.unregister(providerId);
    };
  }

  unregister(providerId: string): boolean {
    return this.providers.delete(providerId);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  get(providerId: string): MissionProvider | undefined {
    return this.providers.get(providerId);
  }

  list(): MissionProvider[] {
    return Array.from(this.providers.values());
  }

  size(): number {
    return this.providers.size;
  }

  clear(): void {
    this.providers.clear();
  }

  async collect(
    context: Omit<MissionGenerationContext, "generatedAt"> & {
      generatedAt?: Date;
    },
  ): Promise<MissionRegistryResult> {
    const generationContext: MissionGenerationContext = {
      organisationId: context.organisationId,
      generatedAt: context.generatedAt ?? new Date(),
      signals: context.signals,
    };

    const providers = this.list();

    const results = await Promise.allSettled(
      providers.map(async (provider) => ({
        provider,
        drafts: await provider.generate(generationContext),
      })),
    );

    const drafts: MissionDraft[] = [];
    const failures: MissionProviderFailure[] = [];

    results.forEach((result, index) => {
      const provider = providers[index];

      if (result.status === "fulfilled") {
        drafts.push(...result.value.drafts);
        return;
      }

      failures.push({
        providerId: provider.id,
        source: provider.source,
        error: result.reason,
      });
    });

    return {
      drafts,
      failures,
    };
  }
}

export const missionRegistry = new MissionRegistry();