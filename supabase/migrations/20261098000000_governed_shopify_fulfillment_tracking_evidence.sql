-- Immutable Shopify fulfilment tracking evidence. This is canonical source evidence only;
-- workbook/manual values must never enter these relations.
create table public.vault_shopify_fulfillment_tracking_capture_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source='shopify'),
  evidence_mode text not null check (evidence_mode in ('historical','prospective')),
  shopify_order_id text not null check (nullif(trim(shopify_order_id),'') is not null),
  order_source_updated_at timestamptz not null,
  observed_at timestamptz not null,
  fulfillments_complete boolean not null check (fulfillments_complete),
  tracking_count integer not null check (tracking_count>=0),
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-tracking-source-content-v1'),
  source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  unique (source, shopify_order_id, order_source_updated_at, fingerprint_contract_version)
);

create table public.vault_shopify_fulfillment_tracking_observations (
  capture_id uuid not null references public.vault_shopify_fulfillment_tracking_capture_observations(id),
  source text not null check (source='shopify'),
  shopify_order_id text not null check (nullif(trim(shopify_order_id),'') is not null),
  shopify_fulfillment_id text not null check (nullif(trim(shopify_fulfillment_id),'') is not null),
  fulfillment_status text not null check (nullif(trim(fulfillment_status),'') is not null),
  fulfillment_updated_at timestamptz not null,
  tracking_number text not null check (nullif(trim(tracking_number),'') is not null),
  tracking_company text,
  tracking_url text,
  observed_at timestamptz not null,
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-tracking-source-content-v1'),
  source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  primary key (capture_id, shopify_fulfillment_id, tracking_number)
);

create index vault_shopify_fulfillment_tracking_order_idx on public.vault_shopify_fulfillment_tracking_observations(shopify_order_id, observed_at desc);
alter table public.vault_shopify_fulfillment_tracking_capture_observations enable row level security;
alter table public.vault_shopify_fulfillment_tracking_observations enable row level security;
revoke all on public.vault_shopify_fulfillment_tracking_capture_observations, public.vault_shopify_fulfillment_tracking_observations from public, anon, authenticated, service_role;
grant select, insert on public.vault_shopify_fulfillment_tracking_capture_observations, public.vault_shopify_fulfillment_tracking_observations to service_role;
create policy vault_shopify_fulfillment_tracking_capture_service on public.vault_shopify_fulfillment_tracking_capture_observations for all to service_role using (true) with check (true);
create policy vault_shopify_fulfillment_tracking_service on public.vault_shopify_fulfillment_tracking_observations for all to service_role using (true) with check (true);
create trigger vault_shopify_fulfillment_tracking_capture_immutable before update or delete on public.vault_shopify_fulfillment_tracking_capture_observations for each row execute function public.reject_shopify_financial_evidence_mutation();
create trigger vault_shopify_fulfillment_tracking_immutable before update or delete on public.vault_shopify_fulfillment_tracking_observations for each row execute function public.reject_shopify_financial_evidence_mutation();

create function public.record_shopify_fulfillment_tracking_evidence(payload jsonb, capture_mode text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c record; f jsonb; t jsonb; capture_id uuid; existing_id uuid; existing_fingerprint text; tracking_total int:=0;
begin
  if capture_mode not in ('historical','prospective') or jsonb_typeof(payload)<>'object' or payload->>'capture_mode' is distinct from capture_mode or jsonb_typeof(payload->'completeness')<>'object' or jsonb_typeof(payload->'fulfillments')<>'array' then raise exception 'INVALID_FULFILLMENT_TRACKING_CAPTURE'; end if;
  select * into c from jsonb_to_record(payload->'completeness') as x(source text,evidence_mode text,shopify_order_id text,order_source_updated_at timestamptz,observed_at timestamptz,fulfillments_complete boolean,tracking_count int,fingerprint_contract_version text,source_content_fingerprint text);
  if c.source<>'shopify' or c.evidence_mode<>capture_mode or nullif(c.shopify_order_id,'') is null or c.order_source_updated_at is null or c.observed_at is null or c.observed_at>clock_timestamp()+interval '1 minute' or not coalesce(c.fulfillments_complete,false) or c.tracking_count<0 or c.fingerprint_contract_version<>'shopify-fulfillment-tracking-source-content-v1' or nullif(c.source_content_fingerprint,'') is null then raise exception 'INCOMPLETE_FULFILLMENT_TRACKING_CAPTURE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.source||':'||c.shopify_order_id||':'||c.order_source_updated_at::text||':'||c.fingerprint_contract_version,98000));
  select id,source_content_fingerprint into existing_id,existing_fingerprint from public.vault_shopify_fulfillment_tracking_capture_observations where source=c.source and shopify_order_id=c.shopify_order_id and order_source_updated_at=c.order_source_updated_at and fingerprint_contract_version=c.fingerprint_contract_version for update;
  if existing_id is not null then if existing_fingerprint=c.source_content_fingerprint then return existing_id; end if; raise exception 'FULFILLMENT_TRACKING_SOURCE_VERSION_CONFLICT'; end if;
  for f in select value from jsonb_array_elements(payload->'fulfillments') loop
    if nullif(f->>'shopify_fulfillment_id','') is null or nullif(f->>'fulfillment_status','') is null or nullif(f->>'fulfillment_updated_at','') is null or jsonb_typeof(f->'tracking')<>'array' then raise exception 'REQUIRED_FULFILLMENT_TRACKING_FIELD_MISSING'; end if;
    for t in select value from jsonb_array_elements(f->'tracking') loop
      if nullif(t->>'tracking_number','') is null then raise exception 'TRACKING_NUMBER_MISSING'; end if;
      tracking_total:=tracking_total+1;
    end loop;
  end loop;
  if tracking_total<>c.tracking_count then raise exception 'FULFILLMENT_TRACKING_CAPTURE_COUNT_MISMATCH'; end if;
  insert into public.vault_shopify_fulfillment_tracking_capture_observations(source,evidence_mode,shopify_order_id,order_source_updated_at,observed_at,fulfillments_complete,tracking_count,fingerprint_contract_version,source_content_fingerprint) values(c.source,c.evidence_mode,c.shopify_order_id,c.order_source_updated_at,c.observed_at,c.fulfillments_complete,c.tracking_count,c.fingerprint_contract_version,c.source_content_fingerprint) returning id into capture_id;
  for f in select value from jsonb_array_elements(payload->'fulfillments') loop for t in select value from jsonb_array_elements(f->'tracking') loop insert into public.vault_shopify_fulfillment_tracking_observations(capture_id,source,shopify_order_id,shopify_fulfillment_id,fulfillment_status,fulfillment_updated_at,tracking_number,tracking_company,tracking_url,observed_at,fingerprint_contract_version,source_content_fingerprint) values(capture_id,c.source,c.shopify_order_id,f->>'shopify_fulfillment_id',f->>'fulfillment_status',(f->>'fulfillment_updated_at')::timestamptz,t->>'tracking_number',nullif(t->>'tracking_company',''),nullif(t->>'tracking_url',''),c.observed_at,c.fingerprint_contract_version,c.source_content_fingerprint); end loop; end loop;
  return capture_id;
end $$;
revoke all on function public.record_shopify_fulfillment_tracking_evidence(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_shopify_fulfillment_tracking_evidence(jsonb,text) to service_role;

create function public.get_shopify_fulfillment_tracking_for_orders(p_order_ids uuid[])
returns table(order_id uuid, tracking_number text, tracking_company text, tracking_url text, shopify_fulfillment_id text, fulfillment_status text, observed_at timestamptz, source text)
language plpgsql security invoker set search_path='' as $$
begin
  if p_order_ids is null or cardinality(p_order_ids)<1 or cardinality(p_order_ids)>100 or exists(select 1 from unnest(p_order_ids) as value where value is null) then raise exception 'INVALID_TRACKING_ORDER_IDS'; end if;
  return query
  select o.id, t.tracking_number, t.tracking_company, t.tracking_url, t.shopify_fulfillment_id, t.fulfillment_status, t.observed_at, t.source
  from public.vault_shopify_orders o
  join public.vault_shopify_fulfillment_tracking_capture_observations c on c.source='shopify' and c.shopify_order_id=o.shopify_order_id and c.order_source_updated_at=o.shopify_updated_at
  join public.vault_shopify_fulfillment_tracking_observations t on t.capture_id=c.id
  where o.id = any(p_order_ids)
  order by o.id, t.tracking_number, t.shopify_fulfillment_id;
end $$;
revoke all on function public.get_shopify_fulfillment_tracking_for_orders(uuid[]) from public,anon,authenticated;
grant execute on function public.get_shopify_fulfillment_tracking_for_orders(uuid[]) to service_role;
notify pgrst,'reload schema';
