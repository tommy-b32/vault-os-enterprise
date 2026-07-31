import "server-only";

import {
  supabaseAdmin,
} from "@/lib/supabase-admin";

import type {
  VaultBrainOperationalSnapshot,
} from "@/lib/brain/types";

const OPERATIONAL_MEMORY_TABLE =
  "vault_operational_snapshots";

const CURRENT_SNAPSHOT_VERSION = 1;

type OperationalSnapshotRow = {
  id: string;
  snapshot_version: number;
  generated_at: string;
  snapshot: unknown;
  created_at: string;
};

type GetPreviousOperationalSnapshotOptions = {
  beforeGeneratedAt?: string;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isOperationalSnapshot(
  value: unknown,
): value is VaultBrainOperationalSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.generatedAt === "string" &&
    typeof value.userName === "string" &&
    isRecord(value.trading) &&
    isRecord(value.inventory) &&
    Array.isArray(value.stockImpacts) &&
    isRecord(value.missions) &&
    isRecord(value.cash) &&
    Array.isArray(value.sourceStatuses)
  );
}

export async function getPreviousOperationalSnapshot({
  beforeGeneratedAt,
}: GetPreviousOperationalSnapshotOptions = {}): Promise<
  VaultBrainOperationalSnapshot | null
> {
  let query = supabaseAdmin
    .from(OPERATIONAL_MEMORY_TABLE)
    .select(
      [
        "id",
        "snapshot_version",
        "generated_at",
        "snapshot",
        "created_at",
      ].join(","),
    )
    .eq(
      "snapshot_version",
      CURRENT_SNAPSHOT_VERSION,
    )
    .order("generated_at", {
      ascending: false,
    })
    .limit(1);

  if (beforeGeneratedAt) {
    query = query.lt(
      "generated_at",
      beforeGeneratedAt,
    );
  }

  const {
    data,
    error,
  } = await query.maybeSingle();

  if (error) {
    console.warn(
      "Vault operational memory could not retrieve the previous snapshot.",
      error,
    );

    return null;
  }

  if (!data) {
    return null;
  }

  const row =
    data as OperationalSnapshotRow;

  if (
    !isOperationalSnapshot(
      row.snapshot,
    )
  ) {
    console.warn(
      "Vault operational memory retrieved an invalid snapshot document.",
      {
        snapshotId: row.id,
        snapshotVersion:
          row.snapshot_version,
      },
    );

    return null;
  }

  return row.snapshot;
}

export async function saveOperationalSnapshot(
  snapshot: VaultBrainOperationalSnapshot,
): Promise<boolean> {
  const {
    error,
  } = await supabaseAdmin
    .from(OPERATIONAL_MEMORY_TABLE)
    .insert({
      snapshot_version:
        CURRENT_SNAPSHOT_VERSION,

      generated_at:
        snapshot.generatedAt,

      snapshot,
    });

  if (error) {
    console.warn(
      "Vault operational memory could not save the current snapshot.",
      error,
    );

    return false;
  }

  return true;
}