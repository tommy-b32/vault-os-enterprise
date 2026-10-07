-- Managed Sales Workbook is private file-management metadata only. Workbook
-- values must never feed canonical finance data or Vault Brain decisions.

create table if not exists public.vault_sales_workbooks (id uuid primary key default gen_random_uuid(), filename text not null, storage_bucket text not null, current_storage_path text not null, current_version integer not null check(current_version>0), content_hash text not null, uploaded_at timestamptz not null default now(), last_modified_at timestamptz not null default now(), last_sync_at timestamptz, last_sync_status text not null default 'never', last_sync_error text, last_shopify_order_number text, uploaded_by_operator_id uuid, singleton boolean not null default true);
create table if not exists public.vault_sales_workbook_versions (id uuid primary key default gen_random_uuid(), workbook_id uuid not null references public.vault_sales_workbooks(id) on delete cascade, version integer not null, storage_path text not null, content_hash text not null, filename text not null, created_at timestamptz not null default now(), uploaded_by_operator_id uuid, predecessor_version integer, unique(workbook_id,version));
create table if not exists public.vault_sales_workbook_audit_events (id uuid primary key default gen_random_uuid(), workbook_id uuid references public.vault_sales_workbooks(id) on delete set null, version integer, event_type text not null, operator_id uuid, occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vault-documents',
  'vault-documents',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.vault_sales_workbooks
  add column if not exists singleton boolean not null default true,
  add constraint vault_sales_workbooks_bucket_check
    check (storage_bucket = 'vault-documents'),
  add constraint vault_sales_workbooks_path_check
    check (nullif(btrim(current_storage_path), '') is not null),
  add constraint vault_sales_workbooks_sha256_check
    check (content_hash ~ '^[0-9a-f]{64}$');

create table if not exists public.vault_sales_workbooks (
  id uuid primary key default gen_random_uuid(), filename text not null,
  storage_bucket text not null, current_storage_path text not null,
  current_version integer not null check (current_version > 0), content_hash text not null,
  uploaded_at timestamptz not null default now(), last_modified_at timestamptz not null default now(),
  last_sync_at timestamptz, last_sync_status text not null default 'never', last_sync_error text,
  last_shopify_order_number text, uploaded_by_operator_id uuid, singleton boolean not null default true
);
create table if not exists public.vault_sales_workbook_versions (
  id uuid primary key default gen_random_uuid(), workbook_id uuid not null references public.vault_sales_workbooks(id) on delete cascade,
  version integer not null, storage_path text not null, content_hash text not null, filename text not null,
  created_at timestamptz not null default now(), uploaded_by_operator_id uuid, predecessor_version integer,
  unique(workbook_id, version)
);
create table if not exists public.vault_sales_workbook_audit_events (
  id uuid primary key default gen_random_uuid(), workbook_id uuid references public.vault_sales_workbooks(id) on delete set null,
  version integer, event_type text not null, operator_id uuid, occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.vault_sales_workbooks enable row level security;
alter table public.vault_sales_workbook_versions enable row level security;
alter table public.vault_sales_workbook_audit_events enable row level security;
revoke all on public.vault_sales_workbooks, public.vault_sales_workbook_versions, public.vault_sales_workbook_audit_events from anon, authenticated;
create unique index if not exists vault_sales_workbooks_singleton_idx on public.vault_sales_workbooks(singleton);

alter table public.vault_sales_workbook_versions
  add constraint vault_sales_workbook_versions_path_check
    check (nullif(btrim(storage_path), '') is not null),
  add constraint vault_sales_workbook_versions_sha256_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  add constraint vault_sales_workbook_versions_predecessor_check
    check (predecessor_version is null or predecessor_version > 0);

alter table public.vault_sales_workbook_audit_events
  drop constraint if exists vault_sales_workbook_audit_events_event_type_check,
  add constraint vault_sales_workbook_audit_events_event_type_check
    check (event_type in ('upload', 'replace', 'download', 'validation_failed', 'conflict'));

create index if not exists vault_sales_workbooks_modified_idx
  on public.vault_sales_workbooks (last_modified_at desc);
create index if not exists vault_sales_workbook_versions_workbook_version_idx
  on public.vault_sales_workbook_versions (workbook_id, version desc);
create index if not exists vault_sales_workbook_audit_events_workbook_time_idx
  on public.vault_sales_workbook_audit_events (workbook_id, occurred_at desc);

comment on table public.vault_sales_workbooks is
  'Private file-management metadata only; workbook contents never become canonical Vault OS financial data or Vault Brain input.';
comment on table public.vault_sales_workbook_versions is
  'Immutable workbook-version history. Future writers must create a new object/version, never overwrite an existing version.';
comment on table public.vault_sales_workbook_audit_events is
  'Private append-only audit metadata for workbook management; no spreadsheet cell values are recorded.';

grant select, insert, update, delete on public.vault_sales_workbooks to service_role;
grant select, insert, update, delete on public.vault_sales_workbook_versions to service_role;
grant select, insert, update, delete on public.vault_sales_workbook_audit_events to service_role;

notify pgrst, 'reload schema';
