-- Close direct service-role mutation paths for governed historical receipts.
-- Existing evidence and historical COGS policies are intentionally untouched.
begin;

revoke all on public.vault_historical_delivery_cost_batches,
  public.vault_historical_delivery_cost_batch_approvals,
  public.vault_historical_delivery_cost_batch_corrections
from public, anon, authenticated, service_role;
grant select on public.vault_historical_delivery_cost_batches,
  public.vault_historical_delivery_cost_batch_approvals,
  public.vault_historical_delivery_cost_batch_corrections
to service_role;

create function public.assert_governed_historical_delivery_operator(p_operator_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.vault_operators
    where id = p_operator_id
      and is_active
      and role in ('owner', 'operator')
  ) then
    raise exception 'GOVERNED_HISTORICAL_DELIVERY_OPERATOR_UNAUTHORISED';
  end if;
end;
$$;

create or replace function public.stage_governed_historical_delivery_cost_batch(
  p_supplier_id uuid,
  p_merchandise_class_id text,
  p_entered_by_operator_id uuid,
  p_original_import jsonb,
  p_normalized jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  perform public.assert_governed_historical_delivery_operator(p_entered_by_operator_id);
  if jsonb_typeof(p_original_import) <> 'object' or jsonb_typeof(p_normalized) <> 'object'
    or not (p_normalized ?& array[
      'source_reference','source_document_reference','supplier_order_date','received_at',
      'received_quantity','goods_cost_gbp','inbound_shipping_gbp','stated_landed_total_gbp','receipt_status',
      'validation_status','validation_reasons'
    ]) then
    raise exception 'GOVERNED_HISTORICAL_DELIVERY_EVIDENCE_INCOMPLETE';
  end if;
  if nullif(trim(p_normalized->>'source_reference'), '') is null
    or nullif(trim(p_normalized->>'source_document_reference'), '') is null
    or nullif(trim(p_normalized->>'stated_landed_total_gbp'), '') is null then
    raise exception 'GOVERNED_HISTORICAL_DELIVERY_EVIDENCE_INCOMPLETE';
  end if;
  if p_normalized->>'receipt_status' not in ('RECEIVED','SEIZED','NOT_RECEIVED','CANCELLED','REVIEW')
    or p_normalized->>'validation_status' not in ('VALID','REVIEW')
    or jsonb_typeof(p_normalized->'validation_reasons') <> 'array' then
    raise exception 'GOVERNED_HISTORICAL_DELIVERY_EVIDENCE_INVALID';
  end if;
  insert into public.vault_historical_delivery_cost_batches(
    merchandise_class_id, supplier_id, source_reference, source_document_reference,
    supplier_order_date, received_at, received_quantity, goods_cost_gbp,
    inbound_shipping_gbp, other_direct_landed_gbp, stated_landed_total_gbp,
    unit_purchase_price_gbp, receipt_status, validation_status, validation_reasons,
    approval_status, note, entered_by_operator_id, original_import
  ) values (
    p_merchandise_class_id, p_supplier_id, p_normalized->>'source_reference',
    p_normalized->>'source_document_reference', (p_normalized->>'supplier_order_date')::date,
    nullif(p_normalized->>'received_at','')::timestamptz,
    (p_normalized->>'received_quantity')::integer,
    (p_normalized->>'goods_cost_gbp')::numeric,
    (p_normalized->>'inbound_shipping_gbp')::numeric,
    coalesce(nullif(p_normalized->>'other_direct_landed_gbp','')::numeric, 0),
    nullif(p_normalized->>'stated_landed_total_gbp','')::numeric,
    nullif(p_normalized->>'unit_purchase_price_gbp','')::numeric,
    p_normalized->>'receipt_status', p_normalized->>'validation_status',
    p_normalized->'validation_reasons', 'PENDING', nullif(p_normalized->>'note',''),
    p_entered_by_operator_id, p_original_import
  ) returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'DUPLICATE_GOVERNED_HISTORICAL_DELIVERY_SOURCE';
end;
$$;

create or replace function public.correct_governed_historical_delivery_cost_batch(
  p_batch_id uuid, p_expected_revision bigint, p_field_name text,
  p_normalized jsonb, p_reason text, p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.vault_historical_delivery_cost_batches%rowtype; v_previous jsonb; v_replacement jsonb;
begin
  perform public.assert_governed_historical_delivery_operator(p_actor_id);
  if p_reason is null or nullif(trim(p_reason),'') is null
    or p_field_name not in ('receivedDate','quantity','goods','shipping','statedTotal','unitPrice','status','reference','note')
    or jsonb_typeof(p_normalized) <> 'object'
    or not (p_normalized ?& array[
      'source_reference','source_document_reference','supplier_order_date','received_quantity',
      'goods_cost_gbp','inbound_shipping_gbp','stated_landed_total_gbp','receipt_status','validation_status','validation_reasons'
    ]) then
    raise exception 'GOVERNED_CORRECTION_INVALID';
  end if;
  select * into b from public.vault_historical_delivery_cost_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.revision <> p_expected_revision then raise exception 'STALE_HISTORICAL_DELIVERY_WRITE'; end if;
  v_previous := case p_field_name when 'receivedDate' then to_jsonb(b.received_at) when 'quantity' then to_jsonb(b.received_quantity) when 'goods' then to_jsonb(b.goods_cost_gbp) when 'shipping' then to_jsonb(b.inbound_shipping_gbp) when 'statedTotal' then to_jsonb(b.stated_landed_total_gbp) when 'unitPrice' then to_jsonb(b.unit_purchase_price_gbp) when 'status' then to_jsonb(b.receipt_status) when 'reference' then to_jsonb(b.source_reference) else to_jsonb(b.note) end;
  v_replacement := p_normalized -> case p_field_name when 'receivedDate' then 'received_at' when 'quantity' then 'received_quantity' when 'goods' then 'goods_cost_gbp' when 'shipping' then 'inbound_shipping_gbp' when 'statedTotal' then 'stated_landed_total_gbp' when 'unitPrice' then 'unit_purchase_price_gbp' when 'status' then 'receipt_status' when 'reference' then 'source_reference' else 'note' end;
  insert into public.vault_historical_delivery_cost_batch_corrections(batch_id,field_name,previous_value,replacement_value,reason,corrected_by_operator_id)
  values(p_batch_id,p_field_name,coalesce(v_previous,'null'::jsonb),coalesce(v_replacement,'null'::jsonb),p_reason,p_actor_id);
  update public.vault_historical_delivery_cost_batches set
    source_reference=p_normalized->>'source_reference', source_document_reference=p_normalized->>'source_document_reference',
    supplier_order_date=(p_normalized->>'supplier_order_date')::date,
    received_at=nullif(p_normalized->>'received_at','')::timestamptz,
    received_quantity=(p_normalized->>'received_quantity')::integer,
    goods_cost_gbp=(p_normalized->>'goods_cost_gbp')::numeric,
    inbound_shipping_gbp=(p_normalized->>'inbound_shipping_gbp')::numeric,
    stated_landed_total_gbp=nullif(p_normalized->>'stated_landed_total_gbp','')::numeric,
    unit_purchase_price_gbp=nullif(p_normalized->>'unit_purchase_price_gbp','')::numeric,
    receipt_status=p_normalized->>'receipt_status', note=nullif(p_normalized->>'note',''),
    validation_status=p_normalized->>'validation_status', validation_reasons=p_normalized->'validation_reasons',
    approval_status='REJECTED', approved_by_operator_id=null, approved_at=null, revision=revision+1
  where id=p_batch_id;
  return jsonb_build_object('id',p_batch_id,'revision',b.revision+1,'validation_status',p_normalized->>'validation_status','approval_status','REJECTED');
end;
$$;

create or replace function public.approve_governed_historical_delivery_cost_batch(
  p_batch_id uuid, p_expected_revision bigint, p_note text, p_actor_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare b public.vault_historical_delivery_cost_batches%rowtype;
begin
  perform public.assert_governed_historical_delivery_operator(p_actor_id);
  if p_note is null or nullif(trim(p_note),'') is null then raise exception 'GOVERNED_APPROVAL_INVALID'; end if;
  select * into b from public.vault_historical_delivery_cost_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.revision <> p_expected_revision then raise exception 'STALE_HISTORICAL_DELIVERY_WRITE'; end if;
  if nullif(trim(b.source_document_reference),'') is null
    or b.stated_landed_total_gbp is null
    or b.receipt_status <> 'RECEIVED' or b.validation_status <> 'VALID'
    or jsonb_array_length(b.validation_reasons) <> 0 or b.received_at is null then
    raise exception 'APPROVAL_VALIDATION_REQUIRED';
  end if;
  insert into public.vault_historical_delivery_cost_batch_approvals(batch_id,approval_note,validation_status,validation_messages,approved_by_operator_id)
  values(p_batch_id,p_note,b.validation_status,b.validation_reasons,p_actor_id);
  update public.vault_historical_delivery_cost_batches
  set approval_status='APPROVED', approved_by_operator_id=p_actor_id, approved_at=clock_timestamp(), revision=revision+1
  where id=p_batch_id;
  return jsonb_build_object('id',p_batch_id,'revision',b.revision+1,'costing_eligible',true);
end;
$$;

revoke all on function public.assert_governed_historical_delivery_operator(uuid),
  public.stage_governed_historical_delivery_cost_batch(uuid,text,uuid,jsonb,jsonb),
  public.correct_governed_historical_delivery_cost_batch(uuid,bigint,text,jsonb,text,uuid),
  public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid)
from public, anon, authenticated;
grant execute on function public.stage_governed_historical_delivery_cost_batch(uuid,text,uuid,jsonb,jsonb),
  public.correct_governed_historical_delivery_cost_batch(uuid,bigint,text,jsonb,text,uuid),
  public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid)
to service_role;

notify pgrst, 'reload schema';
commit;
