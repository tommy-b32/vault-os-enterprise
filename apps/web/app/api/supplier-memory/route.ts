import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

type SupplierMemoryRequest = {
  supplierName?: unknown;

  preferredBrandNames?: unknown;

  colourDictionary?: unknown;

  namingPatterns?: unknown;

  packSize?: unknown;

  leadTimeDays?: unknown;
};

type SupplierMemoryRow = {
  supplier_name: string;

  preferred_brand_names: unknown;

  colour_dictionary: unknown;

  naming_patterns: unknown;

  average_pack_size: number | null;

  average_lead_time: number | null;

  successful_matches: number;

  confidence: number;

  created_at: string | null;

  updated_at: string | null;
};

const SUPPLIER_MEMORY_SELECT = `
  supplier_name,
  preferred_brand_names,
  colour_dictionary,
  naming_patterns,
  average_pack_size,
  average_lead_time,
  successful_matches,
  confidence,
  created_at,
  updated_at
`;

function readRequiredString(
  value: unknown,
  fieldName: string,
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required.`,
    );
  }

  return value.trim();
}

function readNullableNumber(
  value: unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const numeric =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function readNullableInteger(
  value: unknown,
): number | null {
  const numeric =
    readNullableNumber(value);

  if (numeric === null) {
    return null;
  }

  return Math.max(
    0,
    Math.round(numeric),
  );
}

function readStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique =
    new Map<string, string>();

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const cleaned =
      item.trim();

    if (!cleaned) {
      continue;
    }

    unique.set(
      cleaned.toLowerCase(),
      cleaned,
    );
  }

  return [
    ...unique.values(),
  ];
}

function readStringRecord(
  value: unknown,
): Record<string, string> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return {};
  }

  const result:
    Record<string, string> = {};

  for (
    const [
      key,
      recordValue,
    ] of Object.entries(value)
  ) {
    if (
      typeof recordValue !==
      "string"
    ) {
      continue;
    }

    const cleanedKey =
      key.trim();

    const cleanedValue =
      recordValue.trim();

    if (
      !cleanedKey ||
      !cleanedValue
    ) {
      continue;
    }

    result[cleanedKey] =
      cleanedValue;
  }

  return result;
}

function parseStoredStringArray(
  value: unknown,
): string[] {
  return readStringArray(value);
}

function parseStoredStringRecord(
  value: unknown,
): Record<string, string> {
  return readStringRecord(value);
}

function mergeStringArrays(
  existing: string[],
  incoming: string[],
): string[] {
  return readStringArray([
    ...existing,
    ...incoming,
  ]);
}

function mergeStringRecords(
  existing: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  return {
    ...existing,
    ...incoming,
  };
}

function calculateRunningAverage(
  currentAverage: number | null,
  currentCount: number,
  newValue: number | null,
): number | null {
  if (newValue === null) {
    return currentAverage;
  }

  if (
    currentAverage === null ||
    currentCount <= 0
  ) {
    return newValue;
  }

  return Number(
    (
      (
        currentAverage *
          currentCount +
        newValue
      ) /
      (
        currentCount +
        1
      )
    ).toFixed(2),
  );
}

function calculateConfidence(
  successfulMatches: number,
): number {
  return Math.min(
    100,
    Math.round(
      25 +
      Math.log2(
        successfulMatches + 1,
      ) *
        18,
    ),
  );
}

function mapSupplierMemory(
  row: SupplierMemoryRow,
) {
  return {
    supplierName:
      row.supplier_name,

    preferredBrandNames:
      parseStoredStringArray(
        row.preferred_brand_names,
      ),

    colourDictionary:
      parseStoredStringRecord(
        row.colour_dictionary,
      ),

    namingPatterns:
      parseStoredStringRecord(
        row.naming_patterns,
      ),

    averagePackSize:
      row.average_pack_size,

    averageLeadTime:
      row.average_lead_time,

    successfulMatches:
      row.successful_matches,

    confidence:
      row.confidence,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

export async function GET(
  request: Request,
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url,
    );

    const supplierName =
      searchParams
        .get("supplierName")
        ?.trim() ??
      "";

    if (supplierName) {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "vault_supplier_memory",
        )
        .select(
          SUPPLIER_MEMORY_SELECT,
        )
        .eq(
          "supplier_name",
          supplierName,
        )
        .maybeSingle();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      return NextResponse.json({
        memory:
          data
            ? mapSupplierMemory(
                data as SupplierMemoryRow,
              )
            : null,
      });
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "vault_supplier_memory",
      )
      .select(
        SUPPLIER_MEMORY_SELECT,
      )
      .order(
        "successful_matches",
        {
          ascending: false,
        },
      );

    if (error) {
      throw new Error(
        error.message,
      );
    }

    return NextResponse.json({
      memories:
        (
          (
            data ??
            []
          ) as SupplierMemoryRow[]
        ).map(
          mapSupplierMemory,
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Supplier Memory could not be loaded.";

    console.error(
      "Supplier Memory GET failed:",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}

export async function POST(
  request: Request,
) {
  try {
    const body =
      (await request.json()) as
        SupplierMemoryRequest;

    const supplierName =
      readRequiredString(
        body.supplierName,
        "Supplier name",
      );

    const preferredBrandNames =
      readStringArray(
        body.preferredBrandNames,
      );

    const colourDictionary =
      readStringRecord(
        body.colourDictionary,
      );

    const namingPatterns =
      readStringRecord(
        body.namingPatterns,
      );

    const packSize =
      readNullableInteger(
        body.packSize,
      );

    const leadTimeDays =
      readNullableInteger(
        body.leadTimeDays,
      );

    const now =
      new Date().toISOString();

    const {
      data: existingData,
      error: existingError,
    } = await supabaseAdmin
      .from(
        "vault_supplier_memory",
      )
      .select(
        SUPPLIER_MEMORY_SELECT,
      )
      .eq(
        "supplier_name",
        supplierName,
      )
      .maybeSingle();

    if (existingError) {
      throw new Error(
        existingError.message,
      );
    }

    let savedRow:
      SupplierMemoryRow;

    if (existingData) {
      const existing =
        existingData as SupplierMemoryRow;

      const currentCount =
        Math.max(
          0,
          existing.successful_matches,
        );

      const successfulMatches =
        currentCount + 1;

      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "vault_supplier_memory",
        )
        .update({
          preferred_brand_names:
            mergeStringArrays(
              parseStoredStringArray(
                existing.preferred_brand_names,
              ),
              preferredBrandNames,
            ),

          colour_dictionary:
            mergeStringRecords(
              parseStoredStringRecord(
                existing.colour_dictionary,
              ),
              colourDictionary,
            ),

          naming_patterns:
            mergeStringRecords(
              parseStoredStringRecord(
                existing.naming_patterns,
              ),
              namingPatterns,
            ),

          average_pack_size:
            calculateRunningAverage(
              existing.average_pack_size,
              currentCount,
              packSize,
            ),

          average_lead_time:
            calculateRunningAverage(
              existing.average_lead_time,
              currentCount,
              leadTimeDays,
            ),

          successful_matches:
            successfulMatches,

          confidence:
            calculateConfidence(
              successfulMatches,
            ),

          updated_at:
            now,
        })
        .eq(
          "supplier_name",
          supplierName,
        )
        .select(
          SUPPLIER_MEMORY_SELECT,
        )
        .single();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      savedRow =
        data as SupplierMemoryRow;
    } else {
      const successfulMatches =
        1;

      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "vault_supplier_memory",
        )
        .insert({
          supplier_name:
            supplierName,

          preferred_brand_names:
            preferredBrandNames,

          colour_dictionary:
            colourDictionary,

          naming_patterns:
            namingPatterns,

          average_pack_size:
            packSize,

          average_lead_time:
            leadTimeDays,

          successful_matches:
            successfulMatches,

          confidence:
            calculateConfidence(
              successfulMatches,
            ),

          created_at:
            now,

          updated_at:
            now,
        })
        .select(
          SUPPLIER_MEMORY_SELECT,
        )
        .single();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      savedRow =
        data as SupplierMemoryRow;
    }

    return NextResponse.json({
      memory:
        mapSupplierMemory(
          savedRow,
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Supplier Memory could not save this supplier profile.";

    console.error(
      "Supplier Memory POST failed:",
      error,
    );

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}