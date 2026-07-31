-- ============================================================
-- VAULT OS
-- Sprint 3.1A
-- Persistent Operational Memory
-- ============================================================

create table if not exists
  public.vault_operational_snapshots
(
  id uuid primary key
    default gen_random_uuid(),

  snapshot_version integer not null
    default 1
    check (snapshot_version > 0),

  generated_at timestamptz not null,

  snapshot jsonb not null,

  created_at timestamptz not null
    default now()
);


create index if not exists
  vault_operational_snapshots_generated_at_idx
on
  public.vault_operational_snapshots
  (generated_at desc);


comment on table
  public.vault_operational_snapshots
is
  'Versioned Vault Brain operational snapshots used by Executive Memory to compare current and previous operational states.';


comment on column
  public.vault_operational_snapshots.snapshot_version
is
  'Schema version of the stored operational snapshot document.';


comment on column
  public.vault_operational_snapshots.generated_at
is
  'Time at which Vault Brain generated the operational snapshot.';


comment on column
  public.vault_operational_snapshots.snapshot
is
  'Complete VaultBrainOperationalSnapshot stored as a JSON document.';


alter table
  public.vault_operational_snapshots
enable row level security;