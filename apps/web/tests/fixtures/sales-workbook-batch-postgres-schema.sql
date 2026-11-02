-- Disposable PostgreSQL fixture. Never run against a real Vault OS database.
begin;
create role service_role nologin;
create role anon nologin;
create role authenticated nologin;
create table public.vault_operators(id uuid primary key);
create table public.vault_sales_workbooks(id uuid primary key, singleton boolean not null, current_version integer not null, content_hash text not null, current_storage_path text, last_modified_at timestamptz, uploaded_by_operator_id uuid);
create table public.vault_sales_workbook_versions(id uuid primary key default gen_random_uuid(),workbook_id uuid not null references public.vault_sales_workbooks(id),version integer not null,activation_status text not null,predecessor_version integer,content_hash text not null,storage_path text not null);
create table public.vault_sales_workbook_order_corrections(id uuid primary key default gen_random_uuid(),workbook_id uuid not null,order_number text not null,correction_type text not null,original_value jsonb,corrected_value jsonb,workbook_hash_before text not null,workbook_row_number integer,reason text not null,readiness_before text,readiness_after text,created_by_operator_id uuid,created_at timestamptz default now());
create table public.vault_sales_workbook_order_correction_applications(correction_id uuid primary key references public.vault_sales_workbook_order_corrections(id),workbook_id uuid not null,workbook_version integer not null,content_hash text not null,applied_by_operator_id uuid);
create table public.vault_sales_workbook_audit_events(workbook_id uuid not null,version integer not null,event_type text not null,operator_id uuid not null,metadata jsonb not null);
create function public.reject_sales_workbook_order_correction_mutation() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
commit;
