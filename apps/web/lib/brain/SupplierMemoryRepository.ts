export type SupplierMemory = {
  supplierName: string;

  preferredBrandNames: string[];

  colourDictionary: Record<
    string,
    string
  >;

  namingPatterns: Record<
    string,
    string
  >;

  averagePackSize: number | null;

  averageLeadTime: number | null;

  successfulMatches: number;

  confidence: number;

  createdAt: string | null;

  updatedAt: string | null;
};

export type SupplierMemoryInput = {
  supplierName: string;

  preferredBrandNames?: string[];

  colourDictionary?: Record<
    string,
    string
  >;

  namingPatterns?: Record<
    string,
    string
  >;

  packSize?: number | null;

  leadTimeDays?: number | null;
};

type SupplierMemoryResponse = {
  memory?: SupplierMemory | null;
  memories?: SupplierMemory[];
  error?: string;
};

async function readError(
  response: Response,
): Promise<string> {
  try {
    const result =
      (await response.json()) as
        SupplierMemoryResponse;

    return (
      result.error ??
      `Supplier Memory request failed with status ${response.status}.`
    );
  } catch {
    return `Supplier Memory request failed with status ${response.status}.`;
  }
}

async function get(
  supplierName: string,
): Promise<SupplierMemory | null> {
  const query =
    new URLSearchParams({
      supplierName,
    });

  const response =
    await fetch(
      `/api/supplier-memory?${query.toString()}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      await readError(response),
    );
  }

  const result =
    (await response.json()) as
      SupplierMemoryResponse;

  return result.memory ?? null;
}

async function getAll():
  Promise<SupplierMemory[]> {
  const response =
    await fetch(
      "/api/supplier-memory",
      {
        method: "GET",
        cache: "no-store",
      },
    );

  if (!response.ok) {
    throw new Error(
      await readError(response),
    );
  }

  const result =
    (await response.json()) as
      SupplierMemoryResponse;

  return result.memories ?? [];
}

async function recordSuccessfulMatch(
  input: SupplierMemoryInput,
): Promise<SupplierMemory> {
  const response =
    await fetch(
      "/api/supplier-memory",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(input),
      },
    );

  if (!response.ok) {
    throw new Error(
      await readError(response),
    );
  }

  const result =
    (await response.json()) as
      SupplierMemoryResponse;

  if (!result.memory) {
    throw new Error(
      "Supplier Memory did not return the saved supplier profile.",
    );
  }

  return result.memory;
}

export const SupplierMemoryRepository = {
  get,
  getAll,
  recordSuccessfulMatch,
} as const;