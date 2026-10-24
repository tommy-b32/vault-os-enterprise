-- Deferred orders retain their governed evidence gap; this queue never creates
-- financial evidence and is consumed in bounded batches by the retry worker.
alter table public.vault_sales_workbooks
  drop constraint if exists vault_sales_workbooks_last_sync_status_check;
alter table public.vault_sales_workbooks
  add constraint vault_sales_workbooks_last_sync_status_check
  check (last_sync_status in ('never', 'published', 'deferred', 'failed'));

create table public.vault_sales_workbook_deferred_orders (
  workbook_id uuid not null references public.vault_sales_workbooks(id) on delete cascade,
  order_number text not null check (order_number ~ '^[1-9][0-9]{0,8}$'),
  reason_codes jsonb not null check (jsonb_typeof(reason_codes) = 'array'),
  first_deferred_at timestamptz not null default clock_timestamp(),
  last_deferred_at timestamptz not null default clock_timestamp(),
  next_retry_at timestamptz not null default clock_timestamp(),
  retry_count integer not null default 0 check (retry_count >= 0),
  primary key (workbook_id, order_number)
);
alter table public.vault_sales_workbook_deferred_orders enable row level security;
revoke all on public.vault_sales_workbook_deferred_orders from public, anon, authenticated;
grant select, insert, update, delete on public.vault_sales_workbook_deferred_orders to service_role;

create index vault_sales_workbook_deferred_orders_due_idx
  on public.vault_sales_workbook_deferred_orders (next_retry_at, order_number);

notify pgrst, 'reload schema';
