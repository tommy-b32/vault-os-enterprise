create table public.vault_sales_workbook_order_corrections (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.vault_sales_workbooks(id),
  order_number text not null check (order_number ~ '^[0-9]+$'),
  correction_type text not null check (correction_type in ('sale_price','order_date','postage','card_fee','cogs','tracking','manual_non_shopify','exchange_partial_payment')),
  original_value jsonb not null, corrected_value jsonb not null,
  workbook_hash_before text not null check (workbook_hash_before ~ '^[0-9a-f]{64}$'),
  workbook_row_number integer not null check (workbook_row_number > 0),
  reason text not null check (length(trim(reason)) > 0),
  readiness_before text not null, readiness_after text not null,
  created_by_operator_id uuid not null references public.vault_operators(id),
  created_at timestamptz not null default now()
);
alter table public.vault_sales_workbook_order_corrections enable row level security;
revoke all on public.vault_sales_workbook_order_corrections from public, anon, authenticated;
grant select, insert on public.vault_sales_workbook_order_corrections to service_role;
create index vault_sales_workbook_order_corrections_order_idx on public.vault_sales_workbook_order_corrections(workbook_id, order_number, created_at desc);

-- The evidence is append-only.  Workbook publication is recorded separately,
-- which prevents a later mutation of the before/after snapshot.
create function public.reject_sales_workbook_order_correction_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'sales workbook correction audit records are immutable';
end;
$$;
create trigger vault_sales_workbook_order_corrections_immutable
before update or delete on public.vault_sales_workbook_order_corrections
for each row execute function public.reject_sales_workbook_order_correction_mutation();

create table public.vault_sales_workbook_order_correction_applications (
  correction_id uuid primary key references public.vault_sales_workbook_order_corrections(id),
  workbook_id uuid not null references public.vault_sales_workbooks(id),
  workbook_version integer not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  applied_by_operator_id uuid not null references public.vault_operators(id),
  applied_at timestamptz not null default now()
);
alter table public.vault_sales_workbook_order_correction_applications enable row level security;
revoke all on public.vault_sales_workbook_order_correction_applications from public, anon, authenticated;
grant select, insert on public.vault_sales_workbook_order_correction_applications to service_role;
