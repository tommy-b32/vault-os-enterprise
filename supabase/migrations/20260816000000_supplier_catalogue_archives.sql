-- Sprint 24.2: durable, operator-owned supplier catalogue archives.

create table public.vault_supplier_catalogue_archives (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  original_filename text not null,
  display_name text not null,
  catalogue_type text not null check (catalogue_type in ('products', 'footwear', 'accessories')),
  lead_time_days integer null check (lead_time_days is null or lead_time_days > 0),
  created_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  idempotency_key text not null,
  status text not null check (status in ('uploading', 'processing', 'ready_for_review', 'in_review', 'completed', 'failed')),
  page_count integer not null default 0 check (page_count >= 0),
  detected_product_count integer not null default 0 check (detected_product_count >= 0),
  matched_product_count integer not null default 0 check (matched_product_count >= 0),
  unmatched_product_count integer not null default 0 check (unmatched_product_count >= 0),
  source_metadata jsonb not null default '{}'::jsonb,
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by_operator_id, idempotency_key)
);

create table public.vault_supplier_catalogue_pages (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.vault_supplier_catalogue_archives(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  analysis_state text not null check (analysis_state in ('pending', 'analysing', 'complete', 'failed', 'skipped')),
  parsed_evidence jsonb not null default '{}'::jsonb,
  error_message text null,
  analysed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_id, page_number)
);

create table public.vault_supplier_catalogue_review_items (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.vault_supplier_catalogue_archives(id) on delete cascade,
  review_item_id text not null,
  source_page_number integer not null check (source_page_number > 0),
  supplier_product_evidence jsonb not null,
  proposed_match jsonb null,
  review_payload jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'matched', 'skipped', 'create_product')),
  linked_product_id uuid null references public.vault_products(id) on delete restrict,
  decided_at timestamptz null,
  decided_by_operator_id uuid null references public.vault_operators(id) on delete restrict,
  decision_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (archive_id, review_item_id),
  check ((review_status = 'pending' and decided_at is null and decided_by_operator_id is null) or
         (review_status <> 'pending' and decided_at is not null and decided_by_operator_id is not null)),
  check (review_status <> 'matched' or linked_product_id is not null)
);

create index vault_supplier_catalogue_archives_created_at_idx on public.vault_supplier_catalogue_archives(created_at desc);
create index vault_supplier_catalogue_archives_supplier_idx on public.vault_supplier_catalogue_archives(supplier_id);
create index vault_supplier_catalogue_pages_archive_idx on public.vault_supplier_catalogue_pages(archive_id, page_number);
create index vault_supplier_catalogue_review_queue_idx on public.vault_supplier_catalogue_review_items(archive_id, review_status, source_page_number);

create or replace function public.refresh_supplier_catalogue_archive(target_archive_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare pending_count integer; resolved_count integer; detected_count integer; matched_count integer;
begin
  select count(*), count(*) filter (where review_status = 'matched'), count(*) filter (where review_status = 'pending')
    into detected_count, matched_count, pending_count
    from public.vault_supplier_catalogue_review_items where archive_id = target_archive_id;
  resolved_count := detected_count - pending_count;
  update public.vault_supplier_catalogue_archives
  set detected_product_count = detected_count,
      matched_product_count = matched_count,
      unmatched_product_count = detected_count - matched_count,
      status = case
        when status = 'failed' then 'failed'
        when detected_count = 0 then status
        when pending_count = 0 then 'completed'
        when resolved_count > 0 then 'in_review'
        else 'ready_for_review'
      end,
      updated_at = now()
  where id = target_archive_id;
end $$;

create or replace function public.touch_supplier_catalogue_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger vault_supplier_catalogue_archives_updated_at before update on public.vault_supplier_catalogue_archives for each row execute function public.touch_supplier_catalogue_updated_at();
create trigger vault_supplier_catalogue_pages_updated_at before update on public.vault_supplier_catalogue_pages for each row execute function public.touch_supplier_catalogue_updated_at();
create trigger vault_supplier_catalogue_review_items_updated_at before update on public.vault_supplier_catalogue_review_items for each row execute function public.touch_supplier_catalogue_updated_at();

alter table public.vault_supplier_catalogue_archives enable row level security;
alter table public.vault_supplier_catalogue_pages enable row level security;
alter table public.vault_supplier_catalogue_review_items enable row level security;

create policy "Active operators can read supplier catalogue archives" on public.vault_supplier_catalogue_archives for select to authenticated using (exists (select 1 from public.vault_operators operator where operator.id = (select auth.uid()) and operator.is_active));
create policy "Active operators can read supplier catalogue pages" on public.vault_supplier_catalogue_pages for select to authenticated using (exists (select 1 from public.vault_operators operator where operator.id = (select auth.uid()) and operator.is_active));
create policy "Active operators can read supplier catalogue review items" on public.vault_supplier_catalogue_review_items for select to authenticated using (exists (select 1 from public.vault_operators operator where operator.id = (select auth.uid()) and operator.is_active));

revoke all on public.vault_supplier_catalogue_archives, public.vault_supplier_catalogue_pages, public.vault_supplier_catalogue_review_items from anon, authenticated;
grant select on public.vault_supplier_catalogue_archives, public.vault_supplier_catalogue_pages, public.vault_supplier_catalogue_review_items to authenticated;
revoke all on function public.refresh_supplier_catalogue_archive(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
