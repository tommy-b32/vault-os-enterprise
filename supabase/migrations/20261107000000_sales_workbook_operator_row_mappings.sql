create table public.vault_sales_workbook_operator_row_mappings (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.vault_sales_workbooks(id),
  order_number text not null check (order_number ~ '^[0-9]+$'),
  row_number integer not null check (row_number > 0),
  mapping_kind text not null check (mapping_kind in ('CANONICAL_SHOPIFY','MANUAL_NON_SHOPIFY')),
  reason text not null check (length(trim(reason)) > 0),
  created_by_operator_id uuid not null references public.vault_operators(id),
  created_at timestamptz not null default now(),
  unique (workbook_id, row_number),
  unique nulls not distinct (workbook_id, order_number, mapping_kind)
);
alter table public.vault_sales_workbook_operator_row_mappings enable row level security;
revoke all on public.vault_sales_workbook_operator_row_mappings from public, anon, authenticated;
grant select, insert on public.vault_sales_workbook_operator_row_mappings to service_role;
create function public.reject_sales_workbook_operator_row_mapping_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'sales workbook row mappings are immutable';
end;
$$;
create trigger vault_sales_workbook_operator_row_mappings_immutable
before update or delete on public.vault_sales_workbook_operator_row_mappings
for each row execute function public.reject_sales_workbook_operator_row_mapping_mutation();
