export type VaultProductMemoryInput = {
  supplierName: string;

  supplierProductName: string;

  supplierReference: string | null;

  fabricVaultProductId: string;

  fabricVaultProductName: string;

  confidence: number;

  visualFingerprint: string[];

  supplierImageUrl: string | null;

  lastSupplierCost: number | null;

  currency: string;

  leadTimeDays: number | null;
};

export type VaultProductMemory =
  VaultProductMemoryInput & {
    id: string;

    firstSeen: string;

    lastSeen: string;

    acceptedCount: number;

    createdAt: string;

    updatedAt: string;
  };

type MemoryResponse = {
  memory?: VaultProductMemory;
  memories?: VaultProductMemory[];
  error?: string;
};

async function readError(
  response: Response,
): Promise<string> {
  try {
    const result =
      (await response.json()) as
        MemoryResponse;

    return (
      result.error ||
      `Vault Memory request failed with status ${response.status}.`
    );
  } catch {
    return `Vault Memory request failed with status ${response.status}.`;
  }
}

async function save(
  input: VaultProductMemoryInput,
): Promise<VaultProductMemory> {
  const response =
    await fetch(
      "/api/vault-memory",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            input,
          ),
      },
    );

  if (!response.ok) {
    throw new Error(
      await readError(
        response,
      ),
    );
  }

  const result =
    (await response.json()) as
      MemoryResponse;

  if (!result.memory) {
    throw new Error(
      "Vault Memory did not return the saved product relationship.",
    );
  }

  return result.memory;
}

async function getAll():
  Promise<VaultProductMemory[]> {
  const response =
    await fetch(
      "/api/vault-memory",
      {
        method: "GET",

        cache: "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      await readError(
        response,
      ),
    );
  }

  const result =
    (await response.json()) as
      MemoryResponse;

  return result.memories ?? [];
}

export const VaultMemoryRepository = {
  save,
  getAll,
} as const;