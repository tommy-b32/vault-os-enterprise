-- Governed Shopify discount-evidence contract evolution.
-- Additive only: legacy observations remain immutable and are never reclassified.
begin;
alter table public.vault_shopify_discount_application_observations
  drop constraint vault_shopify_discount_applic_source_shopify_order_id_appli_key;
alter table public.vault_shopify_discount_application_observations
  add constraint vault_shopify_discount_application_contract_identity_key
  unique (source, shopify_order_id, application_index, order_source_updated_at, fingerprint_contract_version);
alter table public.vault_shopify_line_discount_allocation_observations
  drop constraint vault_shopify_line_discount_a_source_shopify_order_id_shopi_key;
alter table public.vault_shopify_line_discount_allocation_observations
  add constraint vault_shopify_line_discount_allocation_contract_identity_key
  unique (source, shopify_order_id, shopify_line_item_id, application_index, order_source_updated_at, fingerprint_contract_version);
alter table public.vault_shopify_financial_capture_completeness_observations
  add constraint vault_shopify_financial_capture_completeness_contract_fingerprint_key
  unique (source, shopify_order_id, order_source_updated_at, fingerprint_contract_version, source_content_fingerprint);
create table public.vault_shopify_line_discount_evidence_slots (
  source text not null check (source = 'shopify'),
  shopify_order_id text not null,
  shopify_line_item_id text not null,
  order_source_updated_at timestamptz not null,
  fingerprint_contract_version text not null check (fingerprint_contract_version = 'shopify-source-content-v1'),
  evidence_kind text not null check (evidence_kind in ('SHOPIFY_ALLOCATION', 'PROVEN_ZERO_DISCOUNT_ALLOCATION')),
  created_at timestamptz not null default now(),
  primary key (source, shopify_order_id, shopify_line_item_id, order_source_updated_at, fingerprint_contract_version)
);
alter table public.vault_shopify_line_discount_evidence_slots enable row level security;
revoke all on public.vault_shopify_line_discount_evidence_slots from public, anon, authenticated, service_role;
create function public.guard_shopify_line_discount_evidence_exclusion()
returns trigger language plpgsql security definer set search_path='' as $$
declare expected_kind text;
declare actual_kind text;
begin
  if new.fingerprint_contract_version <> 'shopify-source-content-v1' then return new; end if;
  expected_kind := case when tg_table_name = 'vault_shopify_line_discount_allocation_observations'
    then 'SHOPIFY_ALLOCATION' else 'PROVEN_ZERO_DISCOUNT_ALLOCATION' end;
  insert into public.vault_shopify_line_discount_evidence_slots as slot
    (source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version,evidence_kind)
  values
    (new.source,new.shopify_order_id,new.shopify_line_item_id,new.order_source_updated_at,new.fingerprint_contract_version,expected_kind)
  on conflict (source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version)
  do update set evidence_kind=slot.evidence_kind
    where slot.evidence_kind=excluded.evidence_kind
  returning evidence_kind into actual_kind;
  if actual_kind is null then raise exception 'FINANCIAL_LINE_DISCOUNT_EVIDENCE_CONFLICT'; end if;
  return new;
end $$;
create trigger financial_line_discount_allocation_exclusion
  before insert on public.vault_shopify_line_discount_allocation_observations
  for each row execute function public.guard_shopify_line_discount_evidence_exclusion();
insert into public.vault_shopify_line_discount_evidence_slots
  (source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version,evidence_kind)
select source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version,'SHOPIFY_ALLOCATION'
from public.vault_shopify_line_discount_allocation_observations
where fingerprint_contract_version='shopify-source-content-v1'
group by source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version
on conflict do nothing;
create table public.vault_shopify_line_zero_discount_allocation_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'shopify' check (source = 'shopify'),
  evidence_mode text not null check (evidence_mode in ('prospective', 'historical')),
  shopify_order_id text not null,
  shopify_line_item_id text not null,
  order_source_updated_at timestamptz not null,
  evidence_method text not null check (evidence_method = 'PROVEN_ZERO_DISCOUNT_ALLOCATION'),
  discount_application_count integer not null check (discount_application_count >= 0),
  discount_allocation_count integer not null check (discount_allocation_count >= 0),
  completeness_source_content_fingerprint text not null,
  observed_at timestamptz not null,
  payload_fingerprint text not null,
  fingerprint_contract_version text not null check (fingerprint_contract_version = 'shopify-source-content-v1'),
  source_content_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (source, shopify_order_id, shopify_line_item_id, order_source_updated_at, fingerprint_contract_version),
  foreign key (source, shopify_order_id, order_source_updated_at, fingerprint_contract_version, completeness_source_content_fingerprint)
    references public.vault_shopify_financial_capture_completeness_observations (source, shopify_order_id, order_source_updated_at, fingerprint_contract_version, source_content_fingerprint)
);
create index vault_shopify_line_zero_discount_allocation_order_idx
  on public.vault_shopify_line_zero_discount_allocation_observations (shopify_order_id, order_source_updated_at desc);
create trigger financial_line_zero_discount_allocation_immutable
  before update or delete on public.vault_shopify_line_zero_discount_allocation_observations
  for each row execute function public.reject_shopify_financial_evidence_mutation();
create trigger financial_line_zero_discount_allocation_exclusion
  before insert on public.vault_shopify_line_zero_discount_allocation_observations
  for each row execute function public.guard_shopify_line_discount_evidence_exclusion();
alter table public.vault_shopify_line_zero_discount_allocation_observations enable row level security;
revoke all on public.vault_shopify_line_zero_discount_allocation_observations from public, anon, authenticated;
grant select, insert on public.vault_shopify_line_zero_discount_allocation_observations to service_role;
create or replace function public.record_shopify_financial_evidence(payload jsonb, capture_mode text)
returns void language plpgsql security definer set search_path='' as $$
declare prospective boolean := capture_mode = 'prospective'; observed timestamptz;
begin
  if capture_mode not in ('prospective','historical') or jsonb_typeof(payload) <> 'object' or payload->>'capture_mode' is distinct from capture_mode then raise exception 'INVALID_FINANCIAL_CAPTURE'; end if;
  observed := (payload->>'observed_at')::timestamptz;
  if observed is null or observed > clock_timestamp()+interval '1 minute' then raise exception 'INVALID_FINANCIAL_OBSERVED_AT'; end if;
  if jsonb_typeof(payload->'completeness') <> 'object'
    or (payload->'completeness'->>'source') <> 'shopify'
    or (payload->'completeness'->>'evidence_mode') <> capture_mode
    or (payload->'completeness'->>'observed_at')::timestamptz is distinct from observed
    or not coalesce((payload->'completeness'->>'discount_applications_complete')::boolean, false)
    or not coalesce((payload->'completeness'->>'line_items_complete')::boolean, false)
    or not coalesce((payload->'completeness'->>'refunds_complete')::boolean, false)
    or not coalesce((payload->'completeness'->>'refund_lines_complete')::boolean, false)
    or not coalesce((payload->'completeness'->>'refund_transactions_complete')::boolean, false)
    or (payload->'completeness'->>'fingerprint_contract_version') <> 'shopify-source-content-v1'
    or nullif(payload->'completeness'->>'source_content_fingerprint', '') is null
    or nullif(payload->'completeness'->>'payload_fingerprint', '') is null
  then raise exception 'INCOMPLETE_FINANCIAL_CAPTURE'; end if;
  if exists (
    select 1 from jsonb_to_record(payload->'completeness') as x(source text,shopify_order_id text,order_source_updated_at timestamptz,source_content_fingerprint text)
    join public.vault_shopify_financial_capture_completeness_observations e using(source,shopify_order_id,order_source_updated_at)
    where e.source_content_fingerprint is distinct from x.source_content_fingerprint
  ) then raise exception 'FINANCIAL_SOURCE_VERSION_CONFLICT'; end if;

  -- A legacy sibling may agree on source fields. A current-contract sibling must
  -- be exact; a differing current fingerprint or any differing source fields fail closed.
  if exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'applications','[]')) as x(source text,evidence_mode text,shopify_order_id text,application_index int,order_source_updated_at timestamptz,application_type text,code text,title text,description text,allocation_method text,target_selection text,target_type text,pricing_value_type text,pricing_value numeric,pricing_currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_discount_application_observations e using(source,shopify_order_id,application_index,order_source_updated_at)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1'
      or nullif(x.source_content_fingerprint,'') is null or x.payload_fingerprint is distinct from x.source_content_fingerprint
      or e.fingerprint_contract_version not in ('legacy-full-row-v1','shopify-source-content-v1')
      or (e.fingerprint_contract_version='shopify-source-content-v1' and (e.source_content_fingerprint is distinct from x.source_content_fingerprint or (e.application_type,e.code,e.title,e.description,e.allocation_method,e.target_selection,e.target_type,e.pricing_value_type,e.pricing_value,e.pricing_currency) is distinct from (x.application_type,x.code,x.title,x.description,x.allocation_method,x.target_selection,x.target_type,x.pricing_value_type,x.pricing_value,x.pricing_currency)))
      or (e.fingerprint_contract_version='legacy-full-row-v1' and (e.application_type,e.code,e.title,e.description,e.allocation_method,e.target_selection,e.target_type,e.pricing_value_type,e.pricing_value,e.pricing_currency) is distinct from (x.application_type,x.code,x.title,x.description,x.allocation_method,x.target_selection,x.target_type,x.pricing_value_type,x.pricing_value,x.pricing_currency))
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'allocations','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_line_item_id text,application_index int,order_source_updated_at timestamptz,allocated_shop_amount numeric,allocated_shop_currency text,allocated_presentment_amount numeric,allocated_presentment_currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_line_discount_allocation_observations e using(source,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1'
      or nullif(x.source_content_fingerprint,'') is null or x.payload_fingerprint is distinct from x.source_content_fingerprint
      or e.fingerprint_contract_version not in ('legacy-full-row-v1','shopify-source-content-v1')
      or (e.fingerprint_contract_version='shopify-source-content-v1' and (e.source_content_fingerprint is distinct from x.source_content_fingerprint or (e.allocated_shop_amount,e.allocated_shop_currency,e.allocated_presentment_amount,e.allocated_presentment_currency) is distinct from (x.allocated_shop_amount,x.allocated_shop_currency,x.allocated_presentment_amount,x.allocated_presentment_currency)))
      or (e.fingerprint_contract_version='legacy-full-row-v1' and (e.allocated_shop_amount,e.allocated_shop_currency,e.allocated_presentment_amount,e.allocated_presentment_currency) is distinct from (x.allocated_shop_amount,x.allocated_shop_currency,x.allocated_presentment_amount,x.allocated_presentment_currency))
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'zero_discount_proofs','[]')) as x(source text,shopify_order_id text,shopify_line_item_id text,order_source_updated_at timestamptz,evidence_method text,discount_application_count int,discount_allocation_count int,completeness_source_content_fingerprint text,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_line_zero_discount_allocation_observations e using(source,shopify_order_id,shopify_line_item_id,order_source_updated_at,fingerprint_contract_version)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1'
      or e.source_content_fingerprint is distinct from x.source_content_fingerprint
      or (e.evidence_method,e.discount_application_count,e.discount_allocation_count,e.completeness_source_content_fingerprint,e.payload_fingerprint) is distinct from (x.evidence_method,x.discount_application_count,x.discount_allocation_count,x.completeness_source_content_fingerprint,x.payload_fingerprint)
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'refunds','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,refund_created_at timestamptz,refund_source_updated_at timestamptz,refund_processed_at timestamptz,total_refunded_amount numeric,currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_refund_observations e using(source,shopify_refund_id,refund_source_updated_at)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1' or (e.fingerprint_contract_version='shopify-source-content-v1' and e.source_content_fingerprint is distinct from x.source_content_fingerprint) or (e.fingerprint_contract_version='legacy-full-row-v1' and (e.shopify_order_id,e.refund_created_at,e.refund_processed_at,e.total_refunded_amount,e.currency) is distinct from (x.shopify_order_id,x.refund_created_at,x.refund_processed_at,x.total_refunded_amount,x.currency)) or e.fingerprint_contract_version not in ('legacy-full-row-v1','shopify-source-content-v1')
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'refund_lines','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,shopify_refund_line_item_id text,shopify_line_item_id text,refund_source_updated_at timestamptz,quantity int,price_amount numeric,subtotal_amount numeric,tax_amount numeric,currency text,restocked boolean,restock_type text,restock_location_id text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_refund_line_observations e using(source,shopify_refund_id,shopify_refund_line_item_id,refund_source_updated_at)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1' or (e.fingerprint_contract_version='shopify-source-content-v1' and e.source_content_fingerprint is distinct from x.source_content_fingerprint) or (e.fingerprint_contract_version='legacy-full-row-v1' and (e.shopify_order_id,e.shopify_line_item_id,e.quantity,e.price_amount,e.subtotal_amount,e.tax_amount,e.currency,e.restocked,e.restock_type,e.restock_location_id) is distinct from (x.shopify_order_id,x.shopify_line_item_id,x.quantity,x.price_amount,x.subtotal_amount,x.tax_amount,x.currency,x.restocked,x.restock_type,x.restock_location_id)) or e.fingerprint_contract_version not in ('legacy-full-row-v1','shopify-source-content-v1')
  ) or exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'refund_transactions','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,shopify_order_transaction_id text,parent_transaction_id text,refund_source_updated_at timestamptz,transaction_kind text,transaction_status text,gateway text,amount numeric,currency text,transaction_created_at timestamptz,processed_at timestamptz,is_test boolean,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    join public.vault_shopify_refund_transaction_observations e using(source,shopify_order_transaction_id,refund_source_updated_at)
    where x.fingerprint_contract_version <> 'shopify-source-content-v1' or (e.fingerprint_contract_version='shopify-source-content-v1' and e.source_content_fingerprint is distinct from x.source_content_fingerprint) or (e.fingerprint_contract_version='legacy-full-row-v1' and (e.shopify_order_id,e.shopify_refund_id,e.parent_transaction_id,e.transaction_kind,e.transaction_status,e.gateway,e.amount,e.currency,e.transaction_created_at,e.processed_at,e.is_test) is distinct from (x.shopify_order_id,x.shopify_refund_id,x.parent_transaction_id,x.transaction_kind,x.transaction_status,x.gateway,x.amount,x.currency,x.transaction_created_at,x.processed_at,x.is_test)) or e.fingerprint_contract_version not in ('legacy-full-row-v1','shopify-source-content-v1')
  ) then raise exception 'FINANCIAL_SOURCE_VERSION_CONFLICT'; end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(payload->'zero_discount_proofs','[]')) as x(source text,shopify_order_id text,shopify_line_item_id text,order_source_updated_at timestamptz,evidence_method text,discount_application_count int,discount_allocation_count int,completeness_source_content_fingerprint text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text)
    cross join jsonb_to_record(payload->'completeness') as c(source text,shopify_order_id text,order_source_updated_at timestamptz,discount_application_count int,discount_allocation_count int,source_content_fingerprint text)
    where x.source <> c.source or x.shopify_order_id <> c.shopify_order_id or x.order_source_updated_at is distinct from c.order_source_updated_at
      or x.evidence_method <> 'PROVEN_ZERO_DISCOUNT_ALLOCATION' or x.discount_application_count <> c.discount_application_count
      or x.discount_allocation_count <> c.discount_allocation_count or x.completeness_source_content_fingerprint <> c.source_content_fingerprint
      or x.fingerprint_contract_version <> 'shopify-source-content-v1' or nullif(x.source_content_fingerprint,'') is null or x.payload_fingerprint is distinct from x.source_content_fingerprint
      or exists (select 1 from jsonb_to_recordset(coalesce(payload->'allocations','[]')) as a(shopify_line_item_id text) where a.shopify_line_item_id=x.shopify_line_item_id)
      or exists (select 1 from public.vault_shopify_line_discount_allocation_observations a where a.source=x.source and a.shopify_order_id=x.shopify_order_id and a.shopify_line_item_id=x.shopify_line_item_id and a.order_source_updated_at=x.order_source_updated_at and a.fingerprint_contract_version='shopify-source-content-v1')
  ) then raise exception 'INVALID_ZERO_DISCOUNT_PROOF'; end if;

  insert into public.vault_shopify_discount_application_observations(source,evidence_mode,shopify_order_id,application_index,order_source_updated_at,application_type,code,title,description,allocation_method,target_selection,target_type,pricing_value_type,pricing_value,pricing_currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,application_index,order_source_updated_at,application_type,code,title,description,allocation_method,target_selection,target_type,pricing_value_type,pricing_value,pricing_currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'applications','[]')) as x(source text,evidence_mode text,shopify_order_id text,application_index int,order_source_updated_at timestamptz,application_type text,code text,title text,description text,allocation_method text,target_selection text,target_type text,pricing_value_type text,pricing_value numeric,pricing_currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_line_discount_allocation_observations(source,evidence_mode,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at,allocated_shop_amount,allocated_shop_currency,allocated_presentment_amount,allocated_presentment_currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at,allocated_shop_amount,allocated_shop_currency,allocated_presentment_amount,allocated_presentment_currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'allocations','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_line_item_id text,application_index int,order_source_updated_at timestamptz,allocated_shop_amount numeric,allocated_shop_currency text,allocated_presentment_amount numeric,allocated_presentment_currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_refund_observations(source,evidence_mode,shopify_order_id,shopify_refund_id,refund_created_at,refund_source_updated_at,refund_processed_at,total_refunded_amount,currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,shopify_refund_id,refund_created_at,refund_source_updated_at,refund_processed_at,total_refunded_amount,currency,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'refunds','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,refund_created_at timestamptz,refund_source_updated_at timestamptz,refund_processed_at timestamptz,total_refunded_amount numeric,currency text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_refund_line_observations(source,evidence_mode,shopify_order_id,shopify_refund_id,shopify_refund_line_item_id,shopify_line_item_id,refund_source_updated_at,quantity,price_amount,subtotal_amount,tax_amount,currency,restocked,restock_type,restock_location_id,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,shopify_refund_id,shopify_refund_line_item_id,shopify_line_item_id,refund_source_updated_at,quantity,price_amount,subtotal_amount,tax_amount,currency,restocked,restock_type,restock_location_id,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'refund_lines','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,shopify_refund_line_item_id text,shopify_line_item_id text,refund_source_updated_at timestamptz,quantity int,price_amount numeric,subtotal_amount numeric,tax_amount numeric,currency text,restocked boolean,restock_type text,restock_location_id text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_refund_transaction_observations(source,evidence_mode,shopify_order_id,shopify_refund_id,shopify_order_transaction_id,parent_transaction_id,refund_source_updated_at,transaction_kind,transaction_status,gateway,amount,currency,transaction_created_at,processed_at,is_test,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,shopify_refund_id,shopify_order_transaction_id,parent_transaction_id,refund_source_updated_at,transaction_kind,transaction_status,gateway,amount,currency,transaction_created_at,processed_at,is_test,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'refund_transactions','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_refund_id text,shopify_order_transaction_id text,parent_transaction_id text,refund_source_updated_at timestamptz,transaction_kind text,transaction_status text,gateway text,amount numeric,currency text,transaction_created_at timestamptz,processed_at timestamptz,is_test boolean,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_financial_capture_completeness_observations(source,evidence_mode,shopify_order_id,order_source_updated_at,discount_application_count,discount_allocation_count,refund_count,refund_line_count,refund_transaction_count,discount_applications_complete,line_items_complete,refunds_complete,refund_lines_complete,refund_transactions_complete,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,order_source_updated_at,discount_application_count,discount_allocation_count,refund_count,refund_line_count,refund_transaction_count,discount_applications_complete,line_items_complete,refunds_complete,refund_lines_complete,refund_transactions_complete,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_record(payload->'completeness') as x(source text,evidence_mode text,shopify_order_id text,order_source_updated_at timestamptz,discount_application_count int,discount_allocation_count int,refund_count int,refund_line_count int,refund_transaction_count int,discount_applications_complete boolean,line_items_complete boolean,refunds_complete boolean,refund_lines_complete boolean,refund_transactions_complete boolean,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  insert into public.vault_shopify_line_zero_discount_allocation_observations(source,evidence_mode,shopify_order_id,shopify_line_item_id,order_source_updated_at,evidence_method,discount_application_count,discount_allocation_count,completeness_source_content_fingerprint,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint)
  select source,evidence_mode,shopify_order_id,shopify_line_item_id,order_source_updated_at,evidence_method,discount_application_count,discount_allocation_count,completeness_source_content_fingerprint,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint from jsonb_to_recordset(coalesce(payload->'zero_discount_proofs','[]')) as x(source text,evidence_mode text,shopify_order_id text,shopify_line_item_id text,order_source_updated_at timestamptz,evidence_method text,discount_application_count int,discount_allocation_count int,completeness_source_content_fingerprint text,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text) on conflict do nothing;
  if prospective then update public.vault_shopify_financial_evidence_governance set prospective_started_at=observed where singleton and prospective_started_at is null; end if;
end $$;
create or replace view public.vault_shopify_resolved_line_discount_evidence
with (security_barrier=true,security_invoker=true) as
with current_allocations as (
  select distinct on(source,shopify_order_id,shopify_line_item_id,application_index) *
  from public.vault_shopify_line_discount_allocation_observations
  where fingerprint_contract_version='shopify-source-content-v1'
  order by source,shopify_order_id,shopify_line_item_id,application_index,order_source_updated_at desc,created_at desc
), line_allocations as (
  select source,shopify_order_id,order_source_updated_at,shopify_line_item_id,count(*) allocation_rows,
    sum(allocated_shop_amount) source_discount_allocation,
    bool_and(nullif(payload_fingerprint,'') is not null and payload_fingerprint=source_content_fingerprint and allocated_shop_currency='GBP' and (allocated_presentment_currency is null or allocated_presentment_currency='GBP')) valid,
    max(source_content_fingerprint) source_content_fingerprint
  from current_allocations group by source,shopify_order_id,order_source_updated_at,shopify_line_item_id
), zero_proofs as (
  select z.source,z.shopify_order_id,z.order_source_updated_at,z.shopify_line_item_id,count(*) proof_rows,
    bool_and(z.evidence_method='PROVEN_ZERO_DISCOUNT_ALLOCATION' and z.fingerprint_contract_version='shopify-source-content-v1' and z.payload_fingerprint=z.source_content_fingerprint and c.source_content_fingerprint=z.completeness_source_content_fingerprint and c.discount_applications_complete and c.line_items_complete and c.refunds_complete and c.refund_lines_complete and c.refund_transactions_complete and z.discount_application_count=c.discount_application_count and z.discount_allocation_count=c.discount_allocation_count) valid,
    max(z.source_content_fingerprint) source_content_fingerprint
  from public.vault_shopify_line_zero_discount_allocation_observations z
  join public.vault_shopify_financial_capture_completeness_observations c on c.source=z.source and c.shopify_order_id=z.shopify_order_id and c.order_source_updated_at=z.order_source_updated_at
  group by z.source,z.shopify_order_id,z.order_source_updated_at,z.shopify_line_item_id
)
select l.order_id,o.shopify_order_id,l.id order_line_id,l.shopify_line_item_id,o.currency,
  l.quantity*l.unit_price gross_line_revenue,l.discount_allocation canonical_discount_allocation,
  a.source_discount_allocation,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 and coalesce(z.proof_rows,0)=0 then a.source_discount_allocation when f.order_id is not null and z.valid and z.proof_rows>0 and coalesce(a.allocation_rows,0)=0 then 0 when coalesce(f.discount_allocation_count,0)=0 then l.discount_allocation end resolved_discount_allocation,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 and coalesce(z.proof_rows,0)=0 then l.quantity*l.unit_price-a.source_discount_allocation when f.order_id is not null and z.valid and z.proof_rows>0 and coalesce(a.allocation_rows,0)=0 then l.quantity*l.unit_price when coalesce(f.discount_allocation_count,0)=0 then l.quantity*l.unit_price-l.discount_allocation end resolved_net_line_revenue,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 and coalesce(z.proof_rows,0)=0 then 'resolved_source_backed' when f.order_id is not null and z.valid and z.proof_rows>0 and coalesce(a.allocation_rows,0)=0 then 'resolved_source_backed' when coalesce(f.discount_allocation_count,0)=0 then 'canonical_fallback' else 'unresolved' end resolution_status,
  case when f.order_id is not null and a.valid and a.allocation_rows>0 and coalesce(z.proof_rows,0)=0 then 'SHOPIFY_IMMUTABLE_LINE_DISCOUNT_ALLOCATION' when f.order_id is not null and z.valid and z.proof_rows>0 and coalesce(a.allocation_rows,0)=0 then 'PROVEN_ZERO_DISCOUNT_ALLOCATION' when coalesce(f.discount_allocation_count,0)=0 then 'CANONICAL_LINE_DISCOUNT_ALLOCATION' else 'UNRESOLVED' end evidence_method,
  coalesce(a.source_content_fingerprint,z.source_content_fingerprint) provenance_fingerprint
from public.vault_shopify_order_lines l join public.vault_shopify_orders o on o.id=l.order_id
left join public.vault_shopify_verified_order_financials f on f.order_id=o.id
left join line_allocations a on a.source=o.source and a.shopify_order_id=o.shopify_order_id and a.order_source_updated_at=o.shopify_updated_at and a.shopify_line_item_id=l.shopify_line_item_id
left join zero_proofs z on z.source=o.source and z.shopify_order_id=o.shopify_order_id and z.order_source_updated_at=o.shopify_updated_at and z.shopify_line_item_id=l.shopify_line_item_id;
revoke all on public.vault_shopify_resolved_line_discount_evidence from public,anon,authenticated;
grant select on public.vault_shopify_resolved_line_discount_evidence to service_role;
revoke all on function public.record_shopify_financial_evidence(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_shopify_financial_evidence(jsonb,text) to service_role;
notify pgrst,'reload schema';
commit;
