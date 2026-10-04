-- Schema-only reconstruction of the pre-20260803 Vault OS state.
-- Derived only from the historical database/ files named in the companion manifest.
-- Deliberately contains no INSERT/COPY data, external URLs, credentials, cron, or assertions.

create extension if not exists pgcrypto;

-- database/001_initial_event_schema.sql (schema required by 20260803130000)
create table public.vault_events (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  session_id text not null, event_name text not null, event_source text not null default 'storefront',
  page_path text, page_type text, product_id text, product_handle text, product_title text,
  variant_id text, variant_title text, selected_colour text, selected_size text,
  qualifies_for_bundle boolean not null default false, customer_item_count integer not null default 0,
  qualifying_item_count integer not null default 0, qualifying_pair_count integer not null default 0,
  secured_saving numeric(10,2) not null default 0, vaultcare_active boolean not null default false,
  operator_intent text, operator_mission text, operator_message_id text, confidence_score integer,
  analytics_allowed boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  constraint vault_events_session_id_length check (char_length(session_id) between 1 and 150),
  constraint vault_events_event_name_length check (char_length(event_name) between 1 and 100),
  constraint vault_events_customer_items_valid check (customer_item_count >= 0),
  constraint vault_events_qualifying_items_valid check (qualifying_item_count >= 0),
  constraint vault_events_qualifying_pairs_valid check (qualifying_pair_count >= 0),
  constraint vault_events_saving_valid check (secured_saving >= 0),
  constraint vault_events_confidence_valid check (confidence_score is null or confidence_score between 0 and 100)
);
create index vault_events_created_at_idx on public.vault_events (created_at desc);
create index vault_events_event_name_idx on public.vault_events (event_name);
create index vault_events_session_id_idx on public.vault_events (session_id);
create index vault_events_product_handle_idx on public.vault_events (product_handle);
create table public.vault_traffic_counts (
  id uuid primary key default gen_random_uuid(), recorded_at timestamptz not null default now(),
  minute_bucket timestamptz not null, page_path text, page_type text, total_views integer not null default 1,
  analytics_allowed boolean not null default false, metadata jsonb not null default '{}'::jsonb,
  constraint vault_traffic_total_views_valid check (total_views >= 1)
);
create index vault_traffic_minute_bucket_idx on public.vault_traffic_counts (minute_bucket desc);
create index vault_traffic_page_path_idx on public.vault_traffic_counts (page_path);

-- database/004_supply_intelligence.sql: only the base supplier relation required by later schema.
create table public.vault_suppliers (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), supplier_name text not null, supplier_reference text,
  currency_code text not null default 'EUR', default_lead_time_days integer not null default 10,
  default_order_interval_days integer, minimum_order_value numeric(12,2), is_active boolean not null default true,
  notes text, constraint vault_suppliers_lead_time_valid check (default_lead_time_days >= 0),
  constraint vault_suppliers_order_interval_valid check (default_order_interval_days is null or default_order_interval_days >= 0)
);

-- database/016_supplier_purchasing_rules.sql (commit 49061953825d3ef0c7597a85f1244a3259b15a61, 2026-07-21): schema only; supplier seed rows are excluded.
create table public.vault_supplier_purchasing_rules (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete cascade,
  fulfilment_model text not null default 'stocked'
    check (fulfilment_model in ('stocked', 'dropship', 'service')),
  minimum_order_packs integer null
    check (minimum_order_packs is null or minimum_order_packs >= 0),
  mixed_products_allowed boolean not null default false,
  typical_order_min_packs integer null
    check (typical_order_min_packs is null or typical_order_min_packs >= 0),
  typical_order_max_packs integer null
    check (typical_order_max_packs is null or typical_order_max_packs >= 0),
  recommendation_enabled boolean not null default true,
  rules_confirmed boolean not null default false,
  notes text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint vault_supplier_purchasing_rules_supplier_unique unique (supplier_id),
  constraint vault_supplier_order_range_valid check (
    typical_order_min_packs is null
    or typical_order_max_packs is null
    or typical_order_max_packs >= typical_order_min_packs
  )
);
create index vault_supplier_purchasing_rules_model_idx
  on public.vault_supplier_purchasing_rules (fulfilment_model);
create or replace function public.set_vault_supplier_purchasing_rules_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger vault_supplier_purchasing_rules_updated_at
before update on public.vault_supplier_purchasing_rules
for each row execute function public.set_vault_supplier_purchasing_rules_updated_at();

-- database/008_shopify_catalog_sync.sql: catalogue relations; intentionally empty.
create table public.vault_products (
  id uuid primary key default gen_random_uuid(), source text not null default 'shopify', source_product_id text not null,
  title text not null, handle text, vendor text, product_type text, status text, featured_image_url text,
  shopify_updated_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source, source_product_id)
);
create table public.vault_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.vault_products(id) on delete cascade,
  source text not null default 'shopify', source_variant_id text not null, source_inventory_item_id text,
  title text, sku text, barcode text, option_1 text, option_2 text, option_3 text, price numeric(12,2),
  compare_at_price numeric(12,2), available_for_sale boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (source, source_variant_id)
);
create table public.vault_locations (
  id uuid primary key default gen_random_uuid(), source text not null default 'shopify', source_location_id text not null,
  name text not null, active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique (source, source_location_id)
);
create table public.vault_inventory_levels (
  id uuid primary key default gen_random_uuid(), variant_id uuid not null references public.vault_variants(id) on delete cascade,
  location_id uuid not null references public.vault_locations(id) on delete cascade, available_quantity integer not null default 0,
  committed_quantity integer not null default 0, incoming_quantity integer not null default 0, on_hand_quantity integer not null default 0,
  synced_at timestamptz not null default now(), unique (variant_id, location_id)
);
create index vault_products_handle_index on public.vault_products(handle);
create index vault_variants_product_id_index on public.vault_variants(product_id);
create index vault_variants_sku_index on public.vault_variants(sku);
create index vault_inventory_levels_variant_index on public.vault_inventory_levels(variant_id);

-- database/012_product_settings.sql; its data backfill is deliberately excluded.
create table public.vault_product_settings (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.vault_products(id) on delete cascade,
  supplier_id uuid references public.vault_suppliers(id) on delete set null, inventory_strategy text not null default 'stocked'
    check (inventory_strategy in ('stocked','do_not_restock','discontinued','dropship','service')),
  restock_enabled boolean not null default true, pack_profile text check (pack_profile is null or pack_profile in ('tee_5_piece','polo_6_piece','hoodie','custom')),
  supplier_moq_packs integer check (supplier_moq_packs is null or supplier_moq_packs >= 0),
  target_stock_days integer check (target_stock_days is null or target_stock_days >= 0), decision_reason text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(product_id)
);
create index vault_product_settings_supplier_idx on public.vault_product_settings(supplier_id);
create index vault_product_settings_strategy_idx on public.vault_product_settings(inventory_strategy);
create or replace function public.set_vault_product_settings_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger vault_product_settings_updated_at before update on public.vault_product_settings for each row execute function public.set_vault_product_settings_updated_at();
create view public.vault_product_master as
select p.id as product_id, p.title as product_name, p.handle, p.vendor, p.product_type, p.status,
  s.id as supplier_id, s.supplier_name as supplier_company, ps.inventory_strategy, ps.restock_enabled,
  ps.pack_profile, ps.supplier_moq_packs, ps.target_stock_days, ps.decision_reason, ps.notes,
  ps.updated_at as settings_updated_at
from public.vault_products p left join public.vault_product_settings ps on ps.product_id = p.id
left join public.vault_suppliers s on s.id = ps.supplier_id;

-- database/014_purchasing_wallet.sql: structure only, excluding all account/policy/ledger inserts.
create table public.vault_cash_accounts (
  id uuid primary key default gen_random_uuid(), account_name text not null,
  account_type text not null default 'business' check (account_type in ('business','cash','payment_processor','other')),
  currency text not null default 'GBP', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(account_name)
);
create table public.vault_cash_transactions (
  id uuid primary key default gen_random_uuid(), account_id uuid not null references public.vault_cash_accounts(id) on delete restrict,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('opening_balance','income','expense','transfer_in','transfer_out','supplier_payment','refund','adjustment')),
  category text not null, description text not null, amount_gbp numeric(12,2) not null check (amount_gbp <> 0),
  supplier_id uuid references public.vault_suppliers(id) on delete set null, reference text, notes text,
  source text not null default 'manual' check (source in ('manual','historical_import','shopify','purchase_order','system')),
  external_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index vault_cash_transactions_account_idx on public.vault_cash_transactions(account_id);
create index vault_cash_transactions_date_idx on public.vault_cash_transactions(transaction_date desc);
create index vault_cash_transactions_category_idx on public.vault_cash_transactions(category);
create index vault_cash_transactions_supplier_idx on public.vault_cash_transactions(supplier_id);
create unique index vault_cash_transactions_external_unique_idx on public.vault_cash_transactions(source, external_id) where external_id is not null;
create table public.vault_purchasing_policy (
  policy_key text primary key default 'primary', protected_reserve_gbp numeric(12,2) not null default 0 check(protected_reserve_gbp >= 0),
  manual_spending_limit_gbp numeric(12,2) check(manual_spending_limit_gbp is null or manual_spending_limit_gbp >= 0),
  reserve_override_allowed boolean not null default false, notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), check(policy_key = 'primary')
);
create table public.vault_purchase_orders (
  id uuid primary key default gen_random_uuid(), supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  order_reference text, status text not null default 'draft' check(status in ('draft','recommended','approved','ordered','part_paid','paid','shipped','received','cancelled')),
  currency text not null default 'GBP', estimated_total_gbp numeric(12,2) check(estimated_total_gbp is null or estimated_total_gbp >= 0),
  actual_total_gbp numeric(12,2) check(actual_total_gbp is null or actual_total_gbp >= 0), paid_amount_gbp numeric(12,2) not null default 0 check(paid_amount_gbp >= 0),
  total_packs integer check(total_packs is null or total_packs >= 0), recommended_by_vault_brain boolean not null default false,
  recommendation_confidence numeric(5,2) check(recommendation_confidence is null or recommendation_confidence between 0 and 100), reasoning text, notes text,
  approved_at timestamptz, ordered_at timestamptz, received_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index vault_purchase_orders_supplier_idx on public.vault_purchase_orders(supplier_id);
create index vault_purchase_orders_status_idx on public.vault_purchase_orders(status);
create or replace function public.set_vault_commercial_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger vault_cash_accounts_updated_at before update on public.vault_cash_accounts for each row execute function public.set_vault_commercial_updated_at();
create trigger vault_cash_transactions_updated_at before update on public.vault_cash_transactions for each row execute function public.set_vault_commercial_updated_at();
create trigger vault_purchasing_policy_updated_at before update on public.vault_purchasing_policy for each row execute function public.set_vault_commercial_updated_at();
create trigger vault_purchase_orders_updated_at before update on public.vault_purchase_orders for each row execute function public.set_vault_commercial_updated_at();
create view public.vault_purchasing_wallet as
with ledger as (
  select coalesce(sum(amount_gbp), 0)::numeric(12,2) as ledger_balance_gbp,
    max(updated_at) as last_updated_at
  from public.vault_cash_transactions
), commitments as (
  select coalesce(sum(greatest(coalesce(actual_total_gbp, estimated_total_gbp, 0) - paid_amount_gbp, 0))
    filter (where status in ('approved','ordered','part_paid','shipped')), 0)::numeric(12,2) as committed_orders_gbp,
    max(updated_at) filter (where status in ('approved','ordered','part_paid','shipped')) as last_updated_at
  from public.vault_purchase_orders
), policy as (
  select protected_reserve_gbp, manual_spending_limit_gbp, reserve_override_allowed, updated_at
  from public.vault_purchasing_policy where policy_key = 'primary'
)
select ledger.ledger_balance_gbp,
  coalesce(policy.protected_reserve_gbp, 0)::numeric(12,2) as protected_reserve_gbp,
  commitments.committed_orders_gbp,
  greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)::numeric(12,2) as calculated_purchasing_power_gbp,
  case when policy.manual_spending_limit_gbp is null then greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)
    else least(policy.manual_spending_limit_gbp, greatest(ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp, 0)) end::numeric(12,2) as available_purchasing_power_gbp,
  policy.manual_spending_limit_gbp, coalesce(policy.reserve_override_allowed, false) as reserve_override_allowed,
  case when ledger.ledger_balance_gbp <= 0 then 'no_cash'
    when ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp <= 0 then 'reserve_protected'
    when ledger.ledger_balance_gbp - coalesce(policy.protected_reserve_gbp, 0) - commitments.committed_orders_gbp < 500 then 'limited'
    else 'healthy' end as purchasing_power_state,
  greatest(ledger.last_updated_at, commitments.last_updated_at, policy.updated_at) as wallet_last_updated
from ledger cross join commitments left join policy on true;

-- database/015_product_cost_intelligence.sql; no product-cost backfill.
create table public.vault_product_costs (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.vault_products(id) on delete cascade,
  supplier_id uuid references public.vault_suppliers(id) on delete set null, currency text not null default 'GBP', pack_cost numeric(12,2),
  units_per_pack integer, shipping_cost_per_pack numeric(12,2) default 0, import_cost_per_pack numeric(12,2) default 0,
  landed_cost_per_pack numeric(12,2), landed_cost_per_unit numeric(12,2), average_selling_price numeric(12,2),
  estimated_gross_margin numeric(12,2), estimated_margin_percent numeric(5,2), capital_efficiency_score numeric(5,2),
  return_on_capital numeric(8,2), last_supplier_price_update date, notes text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), unique(product_id)
);
create index vault_product_costs_supplier_idx on public.vault_product_costs(supplier_id);
create or replace function public.set_vault_product_cost_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger vault_product_costs_updated before update on public.vault_product_costs for each row execute function public.set_vault_product_cost_updated_at();

-- database/017_product_commercial_intelligence.sql; original 2026-07-21 view.
-- Authoritative source commit: 49061953825d3ef0c7597a85f1244a3259b15a61.
create or replace view public.vault_product_commercial_intelligence as
with commercial_base as (
  select pm.product_id, pm.product_name, pm.product_type, pm.status as shopify_status,
    pm.supplier_id, pm.supplier_company, pm.inventory_strategy, pm.restock_enabled, pm.pack_profile,
    pc.currency, pc.pack_cost, pc.shipping_cost_per_pack, pc.import_cost_per_pack,
    coalesce(pc.units_per_pack, case when pm.pack_profile = 'tee_5_piece' then 5 when pm.pack_profile = 'polo_6_piece' then 6 else null end)::integer as units_per_pack,
    pc.average_selling_price, pc.last_supplier_price_update, pc.notes as commercial_notes,
    pc.created_at as cost_created_at, pc.updated_at as cost_updated_at
  from public.vault_product_master pm
  left join public.vault_product_costs pc on pc.product_id = pm.product_id
), calculated_costs as (
  select *, case when pack_cost is null then null else round(pack_cost + coalesce(shipping_cost_per_pack, 0) + coalesce(import_cost_per_pack, 0), 2) end as landed_cost_per_pack
  from commercial_base
), unit_economics as (
  select *, case when landed_cost_per_pack is null or units_per_pack is null or units_per_pack <= 0 then null else round(landed_cost_per_pack / units_per_pack, 2) end as landed_cost_per_unit
  from calculated_costs
)
select product_id, product_name, product_type, shopify_status, supplier_id, supplier_company,
  inventory_strategy, restock_enabled, pack_profile, currency, pack_cost, shipping_cost_per_pack,
  import_cost_per_pack, units_per_pack, landed_cost_per_pack, landed_cost_per_unit, average_selling_price,
  case when average_selling_price is null or landed_cost_per_unit is null then null else round(average_selling_price - landed_cost_per_unit, 2) end as estimated_gross_profit_per_unit,
  case when average_selling_price is null or average_selling_price <= 0 or landed_cost_per_unit is null then null else round((average_selling_price - landed_cost_per_unit) / average_selling_price * 100, 2) end as estimated_margin_percent,
  case when landed_cost_per_unit is null or landed_cost_per_unit <= 0 or average_selling_price is null then null else round((average_selling_price - landed_cost_per_unit) / landed_cost_per_unit * 100, 2) end as estimated_return_on_pack_capital_percent,
  case when inventory_strategy <> 'stocked' then true when supplier_id is null or pack_cost is null or pack_cost <= 0 or units_per_pack is null or units_per_pack <= 0 or average_selling_price is null or average_selling_price <= 0 then false else true end as commercial_cost_trusted,
  array_remove(array[case when inventory_strategy = 'stocked' and supplier_id is null then 'supplier' end, case when inventory_strategy = 'stocked' and (pack_cost is null or pack_cost <= 0) then 'pack_cost' end, case when inventory_strategy = 'stocked' and (units_per_pack is null or units_per_pack <= 0) then 'units_per_pack' end, case when inventory_strategy = 'stocked' and (average_selling_price is null or average_selling_price <= 0) then 'average_selling_price' end], null) as missing_commercial_requirements,
  last_supplier_price_update, commercial_notes, cost_created_at, cost_updated_at
from unit_economics;

-- database/009_inventory_intelligence.sql: prerequisites for the recovered style-catalogue view.
create or replace view public.vault_variant_inventory_normalized as
select p.id as product_id, p.title as product_name, p.handle, p.vendor,
  case when p.title ilike '%polo%' then 'polo_6_piece' else 'tee_5_piece' end as pack_profile,
  case when p.title ilike '%polo%' then 6 else 5 end as pack_size,
  coalesce(nullif(trim(v.option_1), ''), 'Default') as colour_design,
  v.id as variant_id, v.title as variant_title, v.option_2 as size_raw,
  case
    when upper(trim(v.option_2)) in ('S', 'SMALL') then 'S'
    when upper(trim(v.option_2)) in ('M', 'MEDIUM') then 'M'
    when upper(trim(v.option_2)) in ('L', 'LARGE') then 'L'
    when upper(trim(v.option_2)) in ('XL', 'X-LARGE', 'EXTRA LARGE') then 'XL'
    when upper(trim(v.option_2)) in ('2XL', 'XXL', '2X', 'XX-LARGE', 'EXTRA EXTRA LARGE') then 'XXL'
    when upper(trim(v.option_2)) in ('3XL', 'XXXL', '3X', 'XXX-LARGE', 'EXTRA EXTRA EXTRA LARGE') then 'XXXL'
    else upper(trim(v.option_2))
  end as normalized_size,
  coalesce(sum(i.available_quantity), 0)::integer as available_quantity,
  coalesce(sum(i.committed_quantity), 0)::integer as committed_quantity,
  coalesce(sum(i.incoming_quantity), 0)::integer as incoming_quantity,
  max(i.synced_at) as last_inventory_sync
from public.vault_products p
join public.vault_variants v on v.product_id = p.id
left join public.vault_inventory_levels i on i.variant_id = v.id
where p.source = 'shopify' and upper(coalesce(p.status, '')) = 'ACTIVE'
  and not (v.option_2 is null and upper(trim(v.option_1)) ~ '^[0-9]+(\.[0-9]+)?$')
group by p.id, p.title, p.handle, p.vendor, v.id, v.title, v.option_1, v.option_2;

create or replace view public.vault_pack_inventory_intelligence as
with size_stock as (
  select product_id, product_name, handle, vendor, pack_profile, pack_size, colour_design,
    coalesce(sum(available_quantity) filter (where normalized_size = 'S'), 0)::integer as small_stock,
    coalesce(sum(available_quantity) filter (where normalized_size = 'M'), 0)::integer as medium_stock,
    coalesce(sum(available_quantity) filter (where normalized_size = 'L'), 0)::integer as large_stock,
    coalesce(sum(available_quantity) filter (where normalized_size = 'XL'), 0)::integer as xl_stock,
    coalesce(sum(available_quantity) filter (where normalized_size = 'XXL'), 0)::integer as xxl_stock,
    coalesce(sum(available_quantity) filter (where normalized_size = 'XXXL'), 0)::integer as xxxl_stock,
    coalesce(sum(available_quantity), 0)::integer as total_available_stock,
    coalesce(sum(committed_quantity), 0)::integer as total_committed_stock,
    coalesce(sum(incoming_quantity), 0)::integer as total_incoming_stock,
    max(last_inventory_sync) as last_inventory_sync
  from public.vault_variant_inventory_normalized
  group by product_id, product_name, handle, vendor, pack_profile, pack_size, colour_design
), pack_calculation as (
  select *, case when pack_profile = 'polo_6_piece'
    then least(small_stock, medium_stock, large_stock, xl_stock, xxl_stock, xxxl_stock)
    else least(small_stock, medium_stock, large_stock, xl_stock, xxl_stock) end::integer as complete_packs
  from size_stock
)
select product_id, product_name, handle, vendor, colour_design, pack_profile, pack_size,
  small_stock, medium_stock, large_stock, xl_stock, xxl_stock, xxxl_stock,
  total_available_stock, total_committed_stock, total_incoming_stock, complete_packs,
  (total_available_stock - (complete_packs * pack_size))::integer as loose_units_after_complete_packs,
  case when pack_profile = 'polo_6_piece' then array_remove(array[
    case when small_stock = 0 then 'S' end, case when medium_stock = 0 then 'M' end,
    case when large_stock = 0 then 'L' end, case when xl_stock = 0 then 'XL' end,
    case when xxl_stock = 0 then 'XXL' end, case when xxxl_stock = 0 then 'XXXL' end], null)
  else array_remove(array[case when small_stock = 0 then 'S' end, case when medium_stock = 0 then 'M' end,
    case when large_stock = 0 then 'L' end, case when xl_stock = 0 then 'XL' end,
    case when xxl_stock = 0 then 'XXL' end], null) end as missing_sizes,
  complete_packs > 0 as full_size_run_available,
  (total_available_stock > 0 and complete_packs = 0) as broken_size_run,
  case when total_available_stock = 0 then 'out_of_stock' when complete_packs = 0 then 'broken_size_run'
    when complete_packs = 1 then 'critical' when complete_packs <= 3 then 'low'
    when complete_packs <= 6 then 'monitor' else 'healthy' end as stock_status,
  last_inventory_sync
from pack_calculation;

-- database/013_configuration_intelligence.sql: prerequisite for the recovered style-catalogue view.
create or replace view public.vault_configuration_intelligence as
with product_configuration as (
  select pm.product_id, pm.product_name, pm.handle, pm.vendor, pm.product_type, pm.status as shopify_status,
    pm.supplier_id, pm.supplier_company, coalesce(pm.inventory_strategy, 'stocked') as inventory_strategy,
    coalesce(pm.restock_enabled, true) as restock_enabled, pm.pack_profile, pm.supplier_moq_packs,
    pm.target_stock_days, pm.decision_reason, pm.notes, pm.settings_updated_at,
    case when coalesce(pm.inventory_strategy, 'stocked') in ('do_not_restock', 'discontinued', 'service') then true else pm.supplier_id is not null end as supplier_complete,
    case when coalesce(pm.inventory_strategy, '') in ('stocked', 'do_not_restock', 'discontinued', 'dropship', 'service') then true else false end as strategy_complete,
    case when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true else pm.pack_profile is not null end as pack_profile_complete,
    case when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true when coalesce(pm.restock_enabled, true) = false then true else (pm.supplier_moq_packs is not null and pm.supplier_moq_packs >= 0) end as moq_complete,
    case when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true when coalesce(pm.restock_enabled, true) = false then true else (pm.target_stock_days is not null and pm.target_stock_days > 0) end as target_days_complete
  from public.vault_product_master pm
), scored_configuration as (
  select *, (case when supplier_complete then 20 else 0 end + case when strategy_complete then 20 else 0 end + case when pack_profile_complete then 20 else 0 end + case when moq_complete then 20 else 0 end + case when target_days_complete then 20 else 0 end)::integer as configuration_score,
    array_remove(array[case when not supplier_complete then 'supplier' end, case when not strategy_complete then 'inventory_strategy' end, case when not pack_profile_complete then 'pack_profile' end, case when not moq_complete then 'supplier_moq' end, case when not target_days_complete then 'target_stock_days' end], null) as missing_requirements
  from product_configuration
)
select product_id, product_name, handle, vendor, product_type, shopify_status, supplier_id, supplier_company,
  inventory_strategy, restock_enabled, pack_profile, supplier_moq_packs, target_stock_days, decision_reason, notes, settings_updated_at,
  supplier_complete, strategy_complete, pack_profile_complete, moq_complete, target_days_complete, configuration_score, missing_requirements,
  cardinality(missing_requirements) as missing_requirement_count,
  case when inventory_strategy = 'dropship' and configuration_score = 100 then 'dropship_ready' when inventory_strategy = 'do_not_restock' then 'do_not_restock' when inventory_strategy = 'discontinued' then 'discontinued' when inventory_strategy = 'service' then 'service' when configuration_score = 100 then 'ready' when configuration_score = 80 then 'almost_ready' else 'needs_configuration' end as configuration_state,
  configuration_score = 100 as configuration_trusted,
  (configuration_score = 100 and inventory_strategy = 'stocked' and restock_enabled = true) as trusted_for_reorder,
  case when configuration_score = 100 then 'high' when configuration_score = 80 then 'limited' else 'untrusted' end as brain_confidence
from scored_configuration;

-- Production-recovered compatibility baseline artifact for isolated replay only.
-- The creator is absent from repository/Git history; see companion manifest.
create view public.vault_style_catalogue_intelligence as
select (ci.product_id::text || '::'::text) || coalesce(nullif(trim(both from pi.colour_design), ''::text), 'Default'::text) as style_id,
  ci.product_id as parent_product_id,
  ci.product_name as parent_product_name,
  case
    when nullif(trim(both from pi.colour_design), ''::text) is null or trim(both from pi.colour_design) = 'Default'::text then ci.product_name
    else (ci.product_name || ' · '::text) || trim(both from pi.colour_design)
  end as product_name,
  coalesce(nullif(trim(both from pi.colour_design), ''::text), 'Default'::text) as style_name,
  ci.handle,
  ci.vendor,
  ci.product_type,
  ci.shopify_status,
  ci.supplier_id,
  ci.supplier_company,
  ci.inventory_strategy,
  ci.restock_enabled,
  coalesce(ci.pack_profile, pi.pack_profile) as pack_profile,
  ci.supplier_moq_packs,
  ci.target_stock_days,
  ci.decision_reason,
  ci.notes,
  ci.settings_updated_at,
  ci.supplier_complete,
  ci.strategy_complete,
  ci.pack_profile_complete,
  ci.moq_complete,
  ci.target_days_complete,
  ci.configuration_score,
  ci.missing_requirements,
  ci.missing_requirement_count,
  ci.configuration_state,
  ci.configuration_trusted,
  ci.trusted_for_reorder,
  ci.brain_confidence,
  pi.pack_size,
  pi.small_stock,
  pi.medium_stock,
  pi.large_stock,
  pi.xl_stock,
  pi.xxl_stock,
  pi.xxxl_stock,
  pi.total_available_stock as stock_on_hand,
  pi.total_committed_stock as committed_stock,
  pi.total_incoming_stock as incoming_stock,
  pi.complete_packs,
  pi.loose_units_after_complete_packs as loose_units,
  pi.missing_sizes,
  pi.full_size_run_available,
  pi.broken_size_run,
  pi.stock_status,
  pi.last_inventory_sync,
  vp.featured_image_url as image_url
from vault_configuration_intelligence ci
join vault_pack_inventory_intelligence pi on pi.product_id = ci.product_id
left join vault_products vp on vp.id = ci.product_id;
