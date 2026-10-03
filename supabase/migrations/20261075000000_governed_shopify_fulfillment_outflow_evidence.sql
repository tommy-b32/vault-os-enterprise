-- 75000: immutable, complete Shopify fulfillment outflow evidence only.
-- This migration deliberately creates no inventory consumption, COGS, refund, or restock behaviour.

create table public.vault_shopify_fulfillment_outflow_capture_completeness_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'shopify' check (source='shopify'),
  evidence_mode text not null check (evidence_mode in ('historical','prospective')),
  shopify_order_id text not null,
  order_source_updated_at timestamptz not null,
  fulfillment_count integer not null check (fulfillment_count>=0),
  fulfillment_line_count integer not null check (fulfillment_line_count>=0),
  fulfillment_event_count integer not null check (fulfillment_event_count>=0),
  fulfillments_complete boolean not null check (fulfillments_complete),
  fulfillment_lines_complete boolean not null check (fulfillment_lines_complete),
  fulfillment_events_complete boolean not null check (fulfillment_events_complete),
  observed_at timestamptz not null,
  payload_fingerprint text not null check (nullif(trim(payload_fingerprint),'') is not null),
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-source-content-v1'),
  source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  created_at timestamptz not null default now(),
  unique (source,shopify_order_id,order_source_updated_at,fingerprint_contract_version)
);

create table public.vault_shopify_fulfillment_observations (
  capture_id uuid not null references public.vault_shopify_fulfillment_outflow_capture_completeness_observations(id),
  source text not null check (source='shopify'), shopify_order_id text not null check (nullif(trim(shopify_order_id),'') is not null), order_source_updated_at timestamptz not null,
  shopify_fulfillment_id text not null check (nullif(trim(shopify_fulfillment_id),'') is not null), fulfillment_status text not null check(nullif(trim(fulfillment_status),'') is not null),
  fulfillment_display_status text, fulfillment_created_at timestamptz not null, fulfillment_updated_at timestamptz not null,
  in_transit_at timestamptz, delivered_at timestamptz, shopify_location_id text,
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-source-content-v1'), source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  created_at timestamptz not null default now(),
  primary key(capture_id,shopify_fulfillment_id)
);

create table public.vault_shopify_fulfillment_line_observations (
  capture_id uuid not null references public.vault_shopify_fulfillment_outflow_capture_completeness_observations(id),
  shopify_fulfillment_id text not null check (nullif(trim(shopify_fulfillment_id),'') is not null), shopify_fulfillment_line_id text not null check (nullif(trim(shopify_fulfillment_line_id),'') is not null),
  shopify_order_id text not null check (nullif(trim(shopify_order_id),'') is not null), shopify_order_line_id text not null check (nullif(trim(shopify_order_line_id),'') is not null),
  shopify_variant_id text not null check (nullif(trim(shopify_variant_id),'') is not null), shopify_inventory_item_id text not null check (nullif(trim(shopify_inventory_item_id),'') is not null),
  fulfilled_quantity integer not null check(fulfilled_quantity>0),
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-source-content-v1'), source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  created_at timestamptz not null default now(),
  primary key(capture_id,shopify_fulfillment_id,shopify_fulfillment_line_id)
);

create table public.vault_shopify_fulfillment_event_observations (
  capture_id uuid not null references public.vault_shopify_fulfillment_outflow_capture_completeness_observations(id),
  shopify_fulfillment_id text not null check (nullif(trim(shopify_fulfillment_id),'') is not null), shopify_fulfillment_event_id text not null check (nullif(trim(shopify_fulfillment_event_id),'') is not null),
  event_status text not null check(nullif(trim(event_status),'') is not null), happened_at timestamptz not null, event_created_at timestamptz not null,
  fingerprint_contract_version text not null check (fingerprint_contract_version='shopify-fulfillment-source-content-v1'), source_content_fingerprint text not null check (nullif(trim(source_content_fingerprint),'') is not null),
  created_at timestamptz not null default now(),
  primary key(capture_id,shopify_fulfillment_id,shopify_fulfillment_event_id)
);

alter table public.vault_shopify_fulfillment_line_observations
  add constraint vault_shopify_fulfillment_line_parent_fk
  foreign key (capture_id,shopify_fulfillment_id)
  references public.vault_shopify_fulfillment_observations(capture_id,shopify_fulfillment_id);

alter table public.vault_shopify_fulfillment_event_observations
  add constraint vault_shopify_fulfillment_event_parent_fk
  foreign key (capture_id,shopify_fulfillment_id)
  references public.vault_shopify_fulfillment_observations(capture_id,shopify_fulfillment_id);

create index vault_shopify_fulfillment_capture_order_idx on public.vault_shopify_fulfillment_outflow_capture_completeness_observations(shopify_order_id,order_source_updated_at desc);
create index vault_shopify_fulfillment_line_order_line_idx on public.vault_shopify_fulfillment_line_observations(shopify_order_line_id);
create index vault_shopify_fulfillment_line_inventory_item_idx on public.vault_shopify_fulfillment_line_observations(shopify_inventory_item_id);

create trigger vault_shopify_fulfillment_capture_immutable before update or delete on public.vault_shopify_fulfillment_outflow_capture_completeness_observations for each row execute function public.reject_shopify_financial_evidence_mutation();
create trigger vault_shopify_fulfillment_immutable before update or delete on public.vault_shopify_fulfillment_observations for each row execute function public.reject_shopify_financial_evidence_mutation();
create trigger vault_shopify_fulfillment_line_immutable before update or delete on public.vault_shopify_fulfillment_line_observations for each row execute function public.reject_shopify_financial_evidence_mutation();
create trigger vault_shopify_fulfillment_event_immutable before update or delete on public.vault_shopify_fulfillment_event_observations for each row execute function public.reject_shopify_financial_evidence_mutation();

alter table public.vault_shopify_fulfillment_outflow_capture_completeness_observations enable row level security;
alter table public.vault_shopify_fulfillment_observations enable row level security;
alter table public.vault_shopify_fulfillment_line_observations enable row level security;
alter table public.vault_shopify_fulfillment_event_observations enable row level security;
revoke all on public.vault_shopify_fulfillment_outflow_capture_completeness_observations,public.vault_shopify_fulfillment_observations,public.vault_shopify_fulfillment_line_observations,public.vault_shopify_fulfillment_event_observations from public,anon,authenticated,service_role;
grant select,insert on public.vault_shopify_fulfillment_outflow_capture_completeness_observations,public.vault_shopify_fulfillment_observations,public.vault_shopify_fulfillment_line_observations,public.vault_shopify_fulfillment_event_observations to service_role;
create policy vault_shopify_fulfillment_capture_service_select on public.vault_shopify_fulfillment_outflow_capture_completeness_observations for select to service_role using(true);
create policy vault_shopify_fulfillment_capture_service_insert on public.vault_shopify_fulfillment_outflow_capture_completeness_observations for insert to service_role with check(true);
create policy vault_shopify_fulfillment_service_select on public.vault_shopify_fulfillment_observations for select to service_role using(true);
create policy vault_shopify_fulfillment_service_insert on public.vault_shopify_fulfillment_observations for insert to service_role with check(true);
create policy vault_shopify_fulfillment_line_service_select on public.vault_shopify_fulfillment_line_observations for select to service_role using(true);
create policy vault_shopify_fulfillment_line_service_insert on public.vault_shopify_fulfillment_line_observations for insert to service_role with check(true);
create policy vault_shopify_fulfillment_event_service_select on public.vault_shopify_fulfillment_event_observations for select to service_role using(true);
create policy vault_shopify_fulfillment_event_service_insert on public.vault_shopify_fulfillment_event_observations for insert to service_role with check(true);

create function public.record_shopify_fulfillment_outflow_evidence(payload jsonb,capture_mode text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c record; f jsonb; l jsonb; e jsonb; existing_id uuid; existing_fingerprint text; capture_id uuid;
  fulfillment_total int:=0; line_total int:=0; event_total int:=0;
begin
  if capture_mode not in ('historical','prospective') or jsonb_typeof(payload)<>'object' or payload->>'capture_mode' is distinct from capture_mode or jsonb_typeof(payload->'completeness')<>'object' or jsonb_typeof(payload->'fulfillments')<>'array' then raise exception 'INVALID_FULFILLMENT_OUTFLOW_CAPTURE'; end if;
  select * into c from jsonb_to_record(payload->'completeness') as x(source text,evidence_mode text,shopify_order_id text,order_source_updated_at timestamptz,fulfillment_count int,fulfillment_line_count int,fulfillment_event_count int,fulfillments_complete boolean,fulfillment_lines_complete boolean,fulfillment_events_complete boolean,observed_at timestamptz,payload_fingerprint text,fingerprint_contract_version text,source_content_fingerprint text);
  if c.source<>'shopify' or c.evidence_mode<>capture_mode or nullif(c.shopify_order_id,'') is null or c.order_source_updated_at is null or c.observed_at is null or c.observed_at>clock_timestamp()+interval '1 minute' or c.fingerprint_contract_version<>'shopify-fulfillment-source-content-v1' or nullif(c.payload_fingerprint,'') is null or nullif(c.source_content_fingerprint,'') is null or not coalesce(c.fulfillments_complete,false) or not coalesce(c.fulfillment_lines_complete,false) or not coalesce(c.fulfillment_events_complete,false) then raise exception 'INCOMPLETE_FULFILLMENT_OUTFLOW_CAPTURE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.source||':'||c.shopify_order_id||':'||c.order_source_updated_at::text||':'||c.fingerprint_contract_version,75000));
  select id,source_content_fingerprint into existing_id,existing_fingerprint from public.vault_shopify_fulfillment_outflow_capture_completeness_observations where source=c.source and shopify_order_id=c.shopify_order_id and order_source_updated_at=c.order_source_updated_at and fingerprint_contract_version=c.fingerprint_contract_version for update;
  if existing_id is not null then
    if existing_fingerprint= c.source_content_fingerprint then return existing_id; end if;
    raise exception 'FULFILLMENT_SOURCE_VERSION_CONFLICT';
  end if;
  for f in select value from jsonb_array_elements(payload->'fulfillments') loop
    if nullif(f->>'shopify_fulfillment_id','') is null or nullif(f->>'fulfillment_status','') is null or nullif(f->>'fulfillment_created_at','') is null or nullif(f->>'fulfillment_updated_at','') is null or jsonb_typeof(f->'line_items')<>'array' or jsonb_typeof(f->'events')<>'array' then raise exception 'REQUIRED_FULFILLMENT_FIELD_MISSING'; end if;
    fulfillment_total:=fulfillment_total+1;
    for l in select value from jsonb_array_elements(f->'line_items') loop
      if nullif(l->>'shopify_fulfillment_line_id','') is null or nullif(l->>'shopify_order_line_id','') is null or nullif(l->>'shopify_variant_id','') is null or nullif(l->>'shopify_inventory_item_id','') is null or coalesce((l->>'fulfilled_quantity')::int,0)<=0 then raise exception 'FULFILLMENT_VARIANT_IDENTITY_UNAVAILABLE'; end if;
      line_total:=line_total+1;
    end loop;
    for e in select value from jsonb_array_elements(f->'events') loop
      if nullif(e->>'shopify_fulfillment_event_id','') is null or nullif(e->>'event_status','') is null or nullif(e->>'happened_at','') is null or nullif(e->>'event_created_at','') is null then raise exception 'REQUIRED_FULFILLMENT_EVENT_FIELD_MISSING'; end if;
      event_total:=event_total+1;
    end loop;
  end loop;
  if c.fulfillment_count<>fulfillment_total or c.fulfillment_line_count<>line_total or c.fulfillment_event_count<>event_total then raise exception 'FULFILLMENT_CAPTURE_COUNT_MISMATCH'; end if;
  insert into public.vault_shopify_fulfillment_outflow_capture_completeness_observations(source,evidence_mode,shopify_order_id,order_source_updated_at,fulfillment_count,fulfillment_line_count,fulfillment_event_count,fulfillments_complete,fulfillment_lines_complete,fulfillment_events_complete,observed_at,payload_fingerprint,fingerprint_contract_version,source_content_fingerprint) values(c.source,c.evidence_mode,c.shopify_order_id,c.order_source_updated_at,c.fulfillment_count,c.fulfillment_line_count,c.fulfillment_event_count,c.fulfillments_complete,c.fulfillment_lines_complete,c.fulfillment_events_complete,c.observed_at,c.payload_fingerprint,c.fingerprint_contract_version,c.source_content_fingerprint) returning id into capture_id;
  for f in select value from jsonb_array_elements(payload->'fulfillments') loop
    insert into public.vault_shopify_fulfillment_observations(capture_id,source,shopify_order_id,order_source_updated_at,shopify_fulfillment_id,fulfillment_status,fulfillment_display_status,fulfillment_created_at,fulfillment_updated_at,in_transit_at,delivered_at,shopify_location_id,fingerprint_contract_version,source_content_fingerprint) values(capture_id,c.source,c.shopify_order_id,c.order_source_updated_at,f->>'shopify_fulfillment_id',f->>'fulfillment_status',nullif(f->>'fulfillment_display_status',''),(f->>'fulfillment_created_at')::timestamptz,(f->>'fulfillment_updated_at')::timestamptz,nullif(f->>'in_transit_at','')::timestamptz,nullif(f->>'delivered_at','')::timestamptz,nullif(f->>'shopify_location_id',''),c.fingerprint_contract_version,c.source_content_fingerprint);
    for l in select value from jsonb_array_elements(f->'line_items') loop insert into public.vault_shopify_fulfillment_line_observations(capture_id,shopify_fulfillment_id,shopify_fulfillment_line_id,shopify_order_id,shopify_order_line_id,shopify_variant_id,shopify_inventory_item_id,fulfilled_quantity,fingerprint_contract_version,source_content_fingerprint) values(capture_id,f->>'shopify_fulfillment_id',l->>'shopify_fulfillment_line_id',c.shopify_order_id,l->>'shopify_order_line_id',l->>'shopify_variant_id',l->>'shopify_inventory_item_id',(l->>'fulfilled_quantity')::int,c.fingerprint_contract_version,c.source_content_fingerprint); end loop;
    for e in select value from jsonb_array_elements(f->'events') loop insert into public.vault_shopify_fulfillment_event_observations(capture_id,shopify_fulfillment_id,shopify_fulfillment_event_id,event_status,happened_at,event_created_at,fingerprint_contract_version,source_content_fingerprint) values(capture_id,f->>'shopify_fulfillment_id',e->>'shopify_fulfillment_event_id',e->>'event_status',(e->>'happened_at')::timestamptz,(e->>'event_created_at')::timestamptz,c.fingerprint_contract_version,c.source_content_fingerprint); end loop;
  end loop;
  return capture_id;
end $$;
revoke all on function public.record_shopify_fulfillment_outflow_evidence(jsonb,text) from public,anon,authenticated;
grant execute on function public.record_shopify_fulfillment_outflow_evidence(jsonb,text) to service_role;
notify pgrst,'reload schema';
