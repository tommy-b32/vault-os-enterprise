import {
  NextResponse,
} from "next/server";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";
import { authorizeApiRequest } from "@/lib/auth/api";

type VaultMemoryRequest = {
  supplierName?: unknown;

  supplierProductName?: unknown;

  supplierReference?: unknown;

  fabricVaultProductId?: unknown;

  fabricVaultProductName?: unknown;

  confidence?: unknown;

  visualFingerprint?: unknown;

  supplierImageUrl?: unknown;

  lastSupplierCost?: unknown;

  currency?: unknown;

  leadTimeDays?: unknown;
};

type VaultMemoryRow = {
  id: string;

  supplier_name: string;

  supplier_product_name: string;

  supplier_reference: string | null;

  fabric_vault_product_id: string;

  fabric_vault_product_name: string;

  confidence: number;

  visual_fingerprint: unknown;

  supplier_image_url: string | null;

  first_seen: string;

  last_seen: string;

  accepted_count: number;

  last_supplier_cost: number | null;

  currency: string;

  lead_time_days: number | null;

  created_at: string;

  updated_at: string;
};

const MEMORY_SELECT = `
  id,
  supplier_name,
  supplier_product_name,
  supplier_reference,
  fabric_vault_product_id,
  fabric_vault_product_name,
  confidence,
  visual_fingerprint,
  supplier_image_url,
  first_seen,
  last_seen,
  accepted_count,
  last_supplier_cost,
  currency,
  lead_time_days,
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

function readNullableString(
  value: unknown,
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
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

  const numericValue =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(
    numericValue,
  )
    ? numericValue
    : null;
}

function readNullableInteger(
  value: unknown,
): number | null {
  const numericValue =
    readNullableNumber(
      value,
    );

  if (numericValue === null) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      numericValue,
    ),
  );
}

function readConfidence(
  value: unknown,
): number {
  const numericValue =
    readNullableNumber(
      value,
    ) ?? 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        numericValue,
      ),
    ),
  );
}

function readStringArray(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  const seen =
    new Set<string>();

  const result: string[] =
    [];

  for (const item of value) {
    if (
      typeof item !== "string"
    ) {
      continue;
    }

    const cleaned =
      item.trim();

    const key =
      cleaned.toLowerCase();

    if (
      !cleaned ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function parseStoredFingerprint(
  value: unknown,
): string[] {
  if (
    Array.isArray(value)
  ) {
    return readStringArray(
      value,
    );
  }

  return [];
}

function mapMemoryRow(
  row: VaultMemoryRow,
) {
  return {
    id:
      row.id,

    supplierName:
      row.supplier_name,

    supplierProductName:
      row.supplier_product_name,

    supplierReference:
      row.supplier_reference,

    fabricVaultProductId:
      row.fabric_vault_product_id,

    fabricVaultProductName:
      row.fabric_vault_product_name,

    confidence:
      row.confidence,

    visualFingerprint:
      parseStoredFingerprint(
        row.visual_fingerprint,
      ),

    supplierImageUrl:
      row.supplier_image_url,

    firstSeen:
      row.first_seen,

    lastSeen:
      row.last_seen,

    acceptedCount:
      row.accepted_count,

    lastSupplierCost:
      row.last_supplier_cost,

    currency:
      row.currency,

    leadTimeDays:
      row.lead_time_days,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  };
}

export async function GET() {
  const denied = await authorizeApiRequest();
  if (denied) return denied;
  try {
    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        "vault_product_memory",
      )
      .select(
        MEMORY_SELECT,
      )
      .order(
        "last_seen",
        {
          ascending: false,
        },
      );

    if (error) {
      throw new Error(
        error.message,
      );
    }

    const rows =
      (data ?? []) as VaultMemoryRow[];

    return NextResponse.json({
      memories:
        rows.map(
          mapMemoryRow,
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Vault Memory could not be loaded.";

    console.error(
      "Vault Memory GET failed:",
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
  const denied = await authorizeApiRequest(["owner", "operator"]);
  if (denied) return denied;
  try {
    const body =
      (await request.json()) as
        VaultMemoryRequest;

    const supplierName =
      readRequiredString(
        body.supplierName,
        "Supplier name",
      );

    const supplierProductName =
      readRequiredString(
        body.supplierProductName,
        "Supplier product name",
      );

    const supplierReference =
      readNullableString(
        body.supplierReference,
      );

    const fabricVaultProductId =
      readRequiredString(
        body.fabricVaultProductId,
        "Fabric Vault product ID",
      );

    const fabricVaultProductName =
      readRequiredString(
        body.fabricVaultProductName,
        "Fabric Vault product name",
      );

    const confidence =
      readConfidence(
        body.confidence,
      );

    const visualFingerprint =
      readStringArray(
        body.visualFingerprint,
      );

    const supplierImageUrl =
      readNullableString(
        body.supplierImageUrl,
      );

    const lastSupplierCost =
      readNullableNumber(
        body.lastSupplierCost,
      );

    const currency =
      readNullableString(
        body.currency,
      ) ??
      "GBP";

    const leadTimeDays =
      readNullableInteger(
        body.leadTimeDays,
      );

    const now =
      new Date().toISOString();

    const {
      data: existingMemory,
      error: existingMemoryError,
    } = await supabaseAdmin
      .from(
        "vault_product_memory",
      )
      .select(
        MEMORY_SELECT,
      )
      .eq(
        "supplier_name",
        supplierName,
      )
      .eq(
        "supplier_product_name",
        supplierProductName,
      )
      .eq(
        "fabric_vault_product_id",
        fabricVaultProductId,
      )
      .maybeSingle();

    if (existingMemoryError) {
      throw new Error(
        existingMemoryError.message,
      );
    }

    let savedMemory:
      VaultMemoryRow;

    if (existingMemory) {
      const existing =
        existingMemory as VaultMemoryRow;

      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "vault_product_memory",
        )
        .update({
          supplier_reference:
            supplierReference,

          fabric_vault_product_name:
            fabricVaultProductName,

          confidence,

          visual_fingerprint:
            visualFingerprint,

          supplier_image_url:
            supplierImageUrl,

          last_seen:
            now,

          accepted_count:
            Math.max(
              1,
              existing.accepted_count,
            ) + 1,

          last_supplier_cost:
            lastSupplierCost,

          currency,

          lead_time_days:
            leadTimeDays,
        })
        .eq(
          "id",
          existing.id,
        )
        .select(
          MEMORY_SELECT,
        )
        .single();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      savedMemory =
        data as VaultMemoryRow;
    } else {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from(
          "vault_product_memory",
        )
        .insert({
          supplier_name:
            supplierName,

          supplier_product_name:
            supplierProductName,

          supplier_reference:
            supplierReference,

          fabric_vault_product_id:
            fabricVaultProductId,

          fabric_vault_product_name:
            fabricVaultProductName,

          confidence,

          visual_fingerprint:
            visualFingerprint,

          supplier_image_url:
            supplierImageUrl,

          first_seen:
            now,

          last_seen:
            now,

          accepted_count:
            1,

          last_supplier_cost:
            lastSupplierCost,

          currency,

          lead_time_days:
            leadTimeDays,
        })
        .select(
          MEMORY_SELECT,
        )
        .single();

      if (error) {
        throw new Error(
          error.message,
        );
      }

      savedMemory =
        data as VaultMemoryRow;
    }

    return NextResponse.json({
      memory:
        mapMemoryRow(
          savedMemory,
        ),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Vault Memory could not save this product relationship.";

    console.error(
      "Vault Memory POST failed:",
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
