-- Private, non-canonical managed Sales workbook metadata. No spreadsheet cells enter financial models.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vault-documents','vault-documents',false,20971520,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create table public.vault_sales_workbooks (
 id uuid primary key default gen_random_uuid(), filename text not null, storage_bucket text not null default 'vault-documents', current_storage_path text not null unique, current_version integer not null check(current_version>0), content_hash text not null, uploaded_at timestamptz not null default now(), last_modified_at timestamptz not null default now(), last_sync_at timestamptz, last_sync_status text not null default 'never' check(last_sync_status in ('never','success','failed')), last_sync_error text, last_shopify_order_number text, uploaded_by_operator_id uuid not null references public.vault_operators(id)
);
create table public.vault_sales_workbook_versions (id uuid primary key default gen_random_uuid(), workbook_id uuid not null references public.vault_sales_workbooks(id) on delete cascade, version integer not null check(version>0), storage_path text not null unique, content_hash text not null, filename text not null, created_at timestamptz not null default now(), uploaded_by_operator_id uuid not null references public.vault_operators(id), predecessor_version integer, unique(workbook_id,version));
create table public.vault_sales_workbook_audit_events (id uuid primary key default gen_random_uuid(), workbook_id uuid references public.vault_sales_workbooks(id) on delete set null, version integer, event_type text not null check(event_type in ('uploaded','replaced','downloaded')), operator_id uuid not null references public.vault_operators(id), occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'));
alter table public.vault_sales_workbooks enable row level security;
revoke all on public.vault_sales_workbooks from anon, authenticated;
alter table public.vault_sales_workbook_versions enable row level security; alter table public.vault_sales_workbook_audit_events enable row level security;
revoke all on public.vault_sales_workbook_versions, public.vault_sales_workbook_audit_events from anon, authenticated;
comment on table public.vault_sales_workbooks is 'Private workbook metadata only. Sales cells are never canonical financial data.';
notify pgrst,'reload schema';
