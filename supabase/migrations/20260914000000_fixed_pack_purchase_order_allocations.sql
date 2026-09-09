create table public.vault_purchase_order_line_size_allocations (
  id uuid primary key default gen_random_uuid(),
  purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id) on delete cascade,
  parent_product_id uuid not null,
  model_design text not null check (length(trim(model_design)) > 0),
  normalized_size text not null check (length(trim(normalized_size)) > 0),
  variant_id uuid not null references public.vault_variants(id) on delete restrict,
  shopify_variant_id_snapshot text not null check (length(trim(shopify_variant_id_snapshot)) > 0),
  shopify_inventory_item_id_snapshot text not null check (length(trim(shopify_inventory_item_id_snapshot)) > 0),
  units_per_pack integer not null check (units_per_pack > 0),
  ordered_units integer not null check (ordered_units > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_line_id, normalized_size),
  unique (purchase_order_line_id, variant_id)
);

create index vault_purchase_order_line_size_allocations_variant_idx
on public.vault_purchase_order_line_size_allocations(variant_id);

create trigger vault_purchase_order_line_size_allocations_updated_at
before update on public.vault_purchase_order_line_size_allocations
for each row execute function public.set_vault_commercial_updated_at();

create or replace function public.assert_vault_purchase_order_line_size_conservation(target_line_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_line public.vault_purchase_order_lines%rowtype;
  allocation_count integer;
  allocation_units_per_pack integer;
  allocation_ordered_units integer;
begin
  select * into purchase_line
  from public.vault_purchase_order_lines line
  where line.id = target_line_id;
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(allocation.units_per_pack), 0), coalesce(sum(allocation.ordered_units), 0)
    into allocation_count, allocation_units_per_pack, allocation_ordered_units
  from public.vault_purchase_order_line_size_allocations allocation
  where allocation.purchase_order_line_id = target_line_id;

  if allocation_count = 0 then
    return;
  end if;

  if purchase_line.recommended_packs is null or purchase_line.recommended_packs <= 0
    or purchase_line.units_per_pack is null or purchase_line.units_per_pack <= 0
    or purchase_line.recommended_units is null or purchase_line.recommended_units <= 0 then
    raise exception 'Fixed-pack purchase-order line quantities must be positive when size allocations exist';
  end if;

  if purchase_line.recommended_units <> purchase_line.recommended_packs * purchase_line.units_per_pack then
    raise exception 'Purchase-order line recommended units do not conserve whole packs';
  end if;

  if allocation_units_per_pack <> purchase_line.units_per_pack then
    raise exception 'Size allocation units per pack do not conserve the purchase-order line pack composition';
  end if;

  if allocation_ordered_units <> purchase_line.recommended_units then
    raise exception 'Size allocation ordered units do not conserve the purchase-order line quantity';
  end if;

  if exists (
    select 1
    from public.vault_purchase_order_line_size_allocations allocation
    where allocation.purchase_order_line_id = target_line_id
      and allocation.ordered_units <> purchase_line.recommended_packs * allocation.units_per_pack
  ) then
    raise exception 'Size allocation ordered units do not match the purchase-order line pack count';
  end if;
end;
$function$;

create or replace function public.enforce_vault_purchase_order_line_size_conservation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  target_line_id uuid;
begin
  if tg_table_name = 'vault_purchase_order_lines' then
    if tg_op = 'DELETE' then
      target_line_id := old.id;
    else
      target_line_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      target_line_id := old.purchase_order_line_id;
    elsif tg_op = 'UPDATE' then
      if old.purchase_order_line_id is distinct from new.purchase_order_line_id then
        perform public.assert_vault_purchase_order_line_size_conservation(old.purchase_order_line_id);
      end if;
      target_line_id := new.purchase_order_line_id;
    else
      target_line_id := new.purchase_order_line_id;
    end if;
  end if;
  perform public.assert_vault_purchase_order_line_size_conservation(target_line_id);
  return null;
end;
$function$;

create constraint trigger vault_purchase_order_line_size_allocations_conservation
after insert or update or delete on public.vault_purchase_order_line_size_allocations
deferrable initially deferred
for each row execute function public.enforce_vault_purchase_order_line_size_conservation();

create constraint trigger vault_purchase_order_lines_size_allocations_conservation
after insert or update or delete on public.vault_purchase_order_lines
deferrable initially deferred
for each row execute function public.enforce_vault_purchase_order_line_size_conservation();

create table public.vault_purchase_order_events (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  purchase_order_line_id uuid null references public.vault_purchase_order_lines(id) on delete restrict,
  operator_id uuid not null references public.vault_operators(id) on delete restrict,
  event_type text not null check (length(trim(event_type)) > 0),
  idempotency_key text null check (idempotency_key is null or length(trim(idempotency_key)) > 0),
  event_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create unique index vault_purchase_order_events_idempotency_unique
on public.vault_purchase_order_events(purchase_order_id, idempotency_key)
where idempotency_key is not null;

create index vault_purchase_order_events_line_idx
on public.vault_purchase_order_events(purchase_order_line_id)
where purchase_order_line_id is not null;

create index vault_purchase_order_events_created_at_idx
on public.vault_purchase_order_events(purchase_order_id, created_at desc);

create or replace function public.prevent_vault_purchase_order_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'Purchase-order event evidence is append-only';
end;
$function$;

create trigger vault_purchase_order_events_append_only
before update or delete on public.vault_purchase_order_events
for each row execute function public.prevent_vault_purchase_order_event_mutation();

alter table public.vault_purchase_order_line_size_allocations enable row level security;
alter table public.vault_purchase_order_events enable row level security;

revoke insert, update, delete on public.vault_purchase_order_line_size_allocations from anon, authenticated;
revoke insert, update, delete on public.vault_purchase_order_events from anon, authenticated;
