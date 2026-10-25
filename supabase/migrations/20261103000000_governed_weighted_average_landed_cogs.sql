-- Phase 1 governed weighted-average landed COGS.  No existing COGS is changed.
begin;

create table public.vault_governed_cost_pool_cutovers (
  id uuid primary key default gen_random_uuid(),
  merchandise_class_id text not null references public.vault_historical_merchandise_classes(id),
  effective_at timestamptz not null,
  purchase_order_id uuid references public.vault_purchase_orders(id),
  rationale text not null check (length(trim(rationale)) > 0),
  approved_by_operator_id uuid not null references public.vault_operators(id),
  approved_at timestamptz not null default clock_timestamp(),
  unique (merchandise_class_id, effective_at)
);

create table public.vault_historical_delivery_cost_batches (
  id uuid primary key default gen_random_uuid(),
  merchandise_class_id text not null references public.vault_historical_merchandise_classes(id),
  supplier_id uuid not null references public.vault_suppliers(id),
  source_reference text not null check (length(trim(source_reference)) > 0),
  supplier_order_date date not null,
  received_at timestamptz,
  received_quantity integer not null check (received_quantity > 0),
  goods_cost_gbp numeric(14,2) not null check (goods_cost_gbp >= 0),
  inbound_shipping_gbp numeric(14,2) not null check (inbound_shipping_gbp >= 0),
  other_direct_landed_gbp numeric(14,2) not null default 0 check (other_direct_landed_gbp >= 0),
  stated_landed_total_gbp numeric(14,2),
  unit_purchase_price_gbp numeric(14,4),
  weight_kg numeric(14,4),
  receipt_status text not null check (receipt_status in ('RECEIVED','SEIZED','NOT_RECEIVED','CANCELLED','REVIEW')),
  validation_status text not null check (validation_status in ('VALID','REVIEW')),
  validation_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_reasons)='array'),
  approval_status text not null check (approval_status in ('PENDING','APPROVED','REJECTED')),
  approved_by_operator_id uuid references public.vault_operators(id),
  approved_at timestamptz,
  exception_approved boolean not null default false,
  exception_reason text,
  note text,
  source_document_reference text,
  entered_by_operator_id uuid not null references public.vault_operators(id),
  entered_at timestamptz not null default clock_timestamp(),
  linked_purchase_order_receipt_id uuid references public.vault_purchase_order_receipts(id),
  landed_cost_gbp numeric(18,2) generated always as (goods_cost_gbp + inbound_shipping_gbp + other_direct_landed_gbp) stored,
  unique (supplier_id, source_reference),
  unique (linked_purchase_order_receipt_id),
  check ((approval_status='APPROVED') = (approved_by_operator_id is not null and approved_at is not null)),
  check (received_at is null or received_at::date >= supplier_order_date or (exception_approved and nullif(trim(exception_reason),'') is not null)),
  -- Reconciliation discrepancies are retained with a REVIEW result by the
  -- preview validator; they must never be silently corrected or discarded.
  check (validation_status <> 'VALID' or (unit_purchase_price_gbp is null or abs(goods_cost_gbp - unit_purchase_price_gbp * received_quantity) <= 0.02)),
  check (validation_status <> 'VALID' or (stated_landed_total_gbp is null or abs(stated_landed_total_gbp - (goods_cost_gbp + inbound_shipping_gbp + other_direct_landed_gbp)) <= 0.02))
);

create table public.vault_historical_weighted_average_cogs_overrides (
  id uuid primary key default gen_random_uuid(),
  order_line_id uuid not null unique references public.vault_shopify_order_lines(id),
  unit_landed_cogs_gbp numeric(14,4) not null check (unit_landed_cogs_gbp >= 0),
  basis text not null check (length(trim(basis)) > 0), note text not null check (length(trim(note)) > 0),
  effective_sale_at timestamptz not null, entered_by_operator_id uuid not null references public.vault_operators(id),
  entered_at timestamptz not null default clock_timestamp(), approval_status text not null check (approval_status in ('PENDING','APPROVED','REJECTED')),
  approved_by_operator_id uuid references public.vault_operators(id), approved_at timestamptz
);
create table public.vault_historical_delivery_cost_batch_corrections (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.vault_historical_delivery_cost_batches(id),field_name text not null,previous_value jsonb not null,replacement_value jsonb not null,reason text not null,corrected_by_operator_id uuid not null references public.vault_operators(id),corrected_at timestamptz not null default clock_timestamp()
);
create table public.vault_historical_delivery_cost_batch_approvals (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null references public.vault_historical_delivery_cost_batches(id),approval_note text not null,validation_status text not null,validation_messages jsonb not null,approved_by_operator_id uuid not null references public.vault_operators(id),approved_at timestamptz not null default clock_timestamp(),unique(batch_id)
);
alter table public.vault_historical_delivery_cost_batches add column original_import jsonb not null default '{}'::jsonb;
alter table public.vault_historical_delivery_cost_batches add column revision bigint not null default 1 check (revision > 0);

-- These functions are SECURITY INVOKER and executable only by service_role.  The
-- caller supplies an operator id, but it is accepted only over that trusted path.
create function public.correct_governed_historical_delivery_cost_batch(
  p_batch_id uuid, p_expected_revision bigint, p_field_name text,
  p_normalized jsonb, p_reason text, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.vault_historical_delivery_cost_batches%rowtype; v_previous jsonb; v_replacement jsonb;
begin
  if p_reason is null or nullif(trim(p_reason),'') is null or p_field_name not in ('receivedDate','quantity','goods','shipping','statedTotal','unitPrice','status','reference','note') then
    raise exception 'GOVERNED_CORRECTION_INVALID';
  end if;
  select * into b from public.vault_historical_delivery_cost_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.revision <> p_expected_revision then raise exception 'STALE_HISTORICAL_DELIVERY_WRITE'; end if;
  if jsonb_typeof(p_normalized) <> 'object' or not (p_normalized ?& array['source_reference','supplier_order_date','received_quantity','goods_cost_gbp','inbound_shipping_gbp','receipt_status','validation_status','validation_reasons']) then
    raise exception 'GOVERNED_CORRECTION_INVALID';
  end if;
  v_previous := case p_field_name when 'receivedDate' then to_jsonb(b.received_at) when 'quantity' then to_jsonb(b.received_quantity) when 'goods' then to_jsonb(b.goods_cost_gbp) when 'shipping' then to_jsonb(b.inbound_shipping_gbp) when 'statedTotal' then to_jsonb(b.stated_landed_total_gbp) when 'unitPrice' then to_jsonb(b.unit_purchase_price_gbp) when 'status' then to_jsonb(b.receipt_status) when 'reference' then to_jsonb(b.source_reference) else to_jsonb(b.note) end;
  v_replacement := p_normalized -> case p_field_name when 'receivedDate' then 'received_at' when 'quantity' then 'received_quantity' when 'goods' then 'goods_cost_gbp' when 'shipping' then 'inbound_shipping_gbp' when 'statedTotal' then 'stated_landed_total_gbp' when 'unitPrice' then 'unit_purchase_price_gbp' when 'status' then 'receipt_status' when 'reference' then 'source_reference' else 'note' end;
  insert into public.vault_historical_delivery_cost_batch_corrections(batch_id,field_name,previous_value,replacement_value,reason,corrected_by_operator_id)
  values(p_batch_id,p_field_name,coalesce(v_previous,'null'::jsonb),coalesce(v_replacement,'null'::jsonb),p_reason,p_actor_id);
  update public.vault_historical_delivery_cost_batches set
    source_reference=p_normalized->>'source_reference', supplier_order_date=(p_normalized->>'supplier_order_date')::date,
    received_at=nullif(p_normalized->>'received_at','')::timestamptz, received_quantity=(p_normalized->>'received_quantity')::integer,
    goods_cost_gbp=(p_normalized->>'goods_cost_gbp')::numeric, inbound_shipping_gbp=(p_normalized->>'inbound_shipping_gbp')::numeric,
    stated_landed_total_gbp=nullif(p_normalized->>'stated_landed_total_gbp','')::numeric, unit_purchase_price_gbp=nullif(p_normalized->>'unit_purchase_price_gbp','')::numeric,
    receipt_status=p_normalized->>'receipt_status', note=nullif(p_normalized->>'note',''),
    validation_status=p_normalized->>'validation_status', validation_reasons=p_normalized->'validation_reasons',
    approval_status='REJECTED', approved_by_operator_id=null, approved_at=null, revision=revision+1
  where id=p_batch_id;
  return jsonb_build_object('id',p_batch_id,'revision',b.revision+1,'validation_status',p_normalized->>'validation_status','approval_status','REJECTED');
end $$;

alter table public.vault_historical_delivery_cost_batch_approvals drop constraint vault_historical_delivery_cost_batch_approvals_batch_id_key;
create function public.approve_governed_historical_delivery_cost_batch(
  p_batch_id uuid, p_expected_revision bigint, p_note text, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.vault_historical_delivery_cost_batches%rowtype; v_eligible boolean;
begin
  if p_note is null or nullif(trim(p_note),'') is null then raise exception 'GOVERNED_APPROVAL_INVALID'; end if;
  select * into b from public.vault_historical_delivery_cost_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.revision <> p_expected_revision then raise exception 'STALE_HISTORICAL_DELIVERY_WRITE'; end if;
  if b.merchandise_class_id is null or b.supplier_id is null or b.received_quantity <= 0 or b.goods_cost_gbp < 0 or b.inbound_shipping_gbp < 0 then raise exception 'GOVERNED_APPROVAL_EVIDENCE_INCOMPLETE'; end if;
  if b.receipt_status='RECEIVED' and (b.validation_status <> 'VALID' or jsonb_array_length(b.validation_reasons) <> 0 or b.received_at is null) then raise exception 'APPROVAL_VALIDATION_REQUIRED'; end if;
  if b.receipt_status='REVIEW' then raise exception 'APPROVAL_VALIDATION_REQUIRED'; end if;
  v_eligible := b.receipt_status='RECEIVED' and b.validation_status='VALID';
  insert into public.vault_historical_delivery_cost_batch_approvals(batch_id,approval_note,validation_status,validation_messages,approved_by_operator_id)
  values(p_batch_id,p_note,b.validation_status,b.validation_reasons,p_actor_id);
  update public.vault_historical_delivery_cost_batches set approval_status='APPROVED',approved_by_operator_id=p_actor_id,approved_at=clock_timestamp(),revision=revision+1 where id=p_batch_id;
  return jsonb_build_object('id',p_batch_id,'revision',b.revision+1,'costing_eligible',v_eligible);
end $$;

create function public.prevent_governed_historical_delivery_audit_mutation() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$ begin raise exception 'GOVERNED_AUDIT_APPEND_ONLY'; end $$;
create trigger vault_historical_delivery_corrections_append_only before update or delete on public.vault_historical_delivery_cost_batch_corrections for each row execute function public.prevent_governed_historical_delivery_audit_mutation();
create trigger vault_historical_delivery_approvals_append_only before update or delete on public.vault_historical_delivery_cost_batch_approvals for each row execute function public.prevent_governed_historical_delivery_audit_mutation();
create function public.prevent_governed_historical_delivery_original_import_mutation() returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$ begin if new.original_import is distinct from old.original_import then raise exception 'ORIGINAL_IMPORT_IMMUTABLE'; end if; return new; end $$;
create trigger vault_historical_delivery_original_import_immutable before update on public.vault_historical_delivery_cost_batches for each row execute function public.prevent_governed_historical_delivery_original_import_mutation();

create function public.get_governed_weighted_average_landed_cogs(p_order_line_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare sale record; cutover timestamptz; eligible jsonb; excluded jsonb; total_units numeric; total_goods numeric; total_shipping numeric; total_landed numeric;
begin
 select l.id,l.order_id,o.shopify_created_at sale_at,p.id product_id,m.merchandise_class_id into sale
 from vault_shopify_order_lines l join vault_shopify_orders o on o.id=l.order_id
 join vault_variants v on v.source='shopify' and v.source_variant_id=l.shopify_variant_id
 join vault_products p on p.id=v.product_id and p.source='shopify'
 join vault_historical_merchandise_class_memberships m on m.product_id=p.id and (o.shopify_created_at at time zone 'Europe/London')::date between m.effective_from and m.effective_through
 where l.id=p_order_line_id;
 if not found then return jsonb_build_object('status','UNRESOLVED','reason','NO_GOVERNED_COST_CLASS_AT_SALE'); end if;
 select max(effective_at) into cutover from vault_governed_cost_pool_cutovers where merchandise_class_id=sale.merchandise_class_id and effective_at<=sale.sale_at;
 with candidates as (
   select id,received_quantity,goods_cost_gbp,inbound_shipping_gbp,other_direct_landed_gbp,landed_cost_gbp,received_at,receipt_status,validation_status,approval_status
   from vault_historical_delivery_cost_batches where merchandise_class_id=sale.merchandise_class_id
 ), classified as (
   select *,case when receipt_status<>'RECEIVED' then receipt_status when validation_status<>'VALID' then 'REVIEW' when approval_status<>'APPROVED' then 'UNAPPROVED' when received_at is null then 'MISSING_RECEIPT_TIMESTAMP' when received_at>sale.sale_at then 'POST_SALE' when cutover is not null and received_at>=cutover then 'POST_CUTOVER_HISTORICAL_SOURCE' else 'ELIGIBLE' end reason from candidates
 ) select jsonb_agg(to_jsonb(classified) - 'goods_cost_gbp' - 'inbound_shipping_gbp' - 'other_direct_landed_gbp') filter(where reason='ELIGIBLE'),jsonb_agg(to_jsonb(classified) - 'goods_cost_gbp' - 'inbound_shipping_gbp' - 'other_direct_landed_gbp') filter(where reason<>'ELIGIBLE'),sum(received_quantity) filter(where reason='ELIGIBLE'),sum(goods_cost_gbp) filter(where reason='ELIGIBLE'),sum(inbound_shipping_gbp+other_direct_landed_gbp) filter(where reason='ELIGIBLE'),sum(landed_cost_gbp) filter(where reason='ELIGIBLE') into eligible,excluded,total_units,total_goods,total_shipping,total_landed from classified;
 return jsonb_build_object('calculation_version','weighted-average-landed-cogs-v1','order_line_id',p_order_line_id,'cost_class',sale.merchandise_class_id,'sale_timestamp',sale.sale_at,'eligible_batches',coalesce(eligible,'[]'::jsonb),'excluded_batches',coalesce(excluded,'[]'::jsonb),'eligible_units',coalesce(total_units,0),'total_goods_gbp',coalesce(total_goods,0),'total_inbound_shipping_gbp',coalesce(total_shipping,0),'total_landed_gbp',coalesce(total_landed,0),'unit_landed_cogs_gbp',case when total_units>0 then total_landed/total_units end,'rounded_workbook_unit_cogs_gbp',case when total_units>0 then round(total_landed/total_units,2) end,'status',case when coalesce(total_units,0)>0 then 'CALCULATED' else 'UNRESOLVED' end);
end $$;

alter table public.vault_governed_cost_pool_cutovers enable row level security;
alter table public.vault_historical_delivery_cost_batches enable row level security;
alter table public.vault_historical_weighted_average_cogs_overrides enable row level security;
alter table public.vault_historical_delivery_cost_batch_corrections enable row level security;
alter table public.vault_historical_delivery_cost_batch_approvals enable row level security;
revoke all on public.vault_governed_cost_pool_cutovers,public.vault_historical_delivery_cost_batches,public.vault_historical_weighted_average_cogs_overrides from public,anon,authenticated;
grant select,insert on public.vault_governed_cost_pool_cutovers,public.vault_historical_delivery_cost_batches,public.vault_historical_weighted_average_cogs_overrides to service_role;
revoke all on public.vault_historical_delivery_cost_batch_corrections,public.vault_historical_delivery_cost_batch_approvals from public,anon,authenticated;
grant select,insert on public.vault_historical_delivery_cost_batch_corrections,public.vault_historical_delivery_cost_batch_approvals to service_role;
revoke all on function public.get_governed_weighted_average_landed_cogs(uuid) from public,anon,authenticated;
grant execute on function public.get_governed_weighted_average_landed_cogs(uuid) to service_role;
revoke all on function public.correct_governed_historical_delivery_cost_batch(uuid,bigint,text,jsonb,text,uuid),public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.correct_governed_historical_delivery_cost_batch(uuid,bigint,text,jsonb,text,uuid),public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid) to service_role;
notify pgrst,'reload schema';
commit;
