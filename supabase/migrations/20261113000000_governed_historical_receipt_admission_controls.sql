-- Forward-only admission controls for documented historical deliveries.
-- This migration deliberately does not insert/link historical policy evidence.
begin;

alter table public.vault_historical_delivery_cost_batches
  add constraint vault_historical_delivery_source_document_required
  check (length(trim(source_document_reference)) > 0) not valid;

create function public.reject_duplicate_legacy_historical_batch_evidence()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.vault_historical_supplier_batch_evidence legacy
    where legacy.merchandise_class_id = new.merchandise_class_id
      and legacy.supplier_id = new.supplier_id
      and legacy.supplier_order_date = new.supplier_order_date
      and legacy.received_date = new.received_at::date
      and legacy.quantity = new.received_quantity
      and legacy.landed_total_gbp = (
        new.goods_cost_gbp + new.inbound_shipping_gbp + new.other_direct_landed_gbp
      )
  ) then
    raise exception 'DUPLICATE_LEGACY_HISTORICAL_BATCH_EVIDENCE';
  end if;
  return new;
end;
$$;

create trigger vault_historical_delivery_reject_legacy_duplicate
before insert or update of merchandise_class_id, supplier_id, supplier_order_date,
  received_at, received_quantity, goods_cost_gbp, inbound_shipping_gbp,
  other_direct_landed_gbp
on public.vault_historical_delivery_cost_batches
for each row execute function public.reject_duplicate_legacy_historical_batch_evidence();

create or replace function public.approve_governed_historical_delivery_cost_batch(
  p_batch_id uuid, p_expected_revision bigint, p_note text, p_actor_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare b public.vault_historical_delivery_cost_batches%rowtype; v_eligible boolean;
begin
  if p_note is null or nullif(trim(p_note),'') is null then raise exception 'GOVERNED_APPROVAL_INVALID'; end if;
  select * into b from public.vault_historical_delivery_cost_batches where id=p_batch_id for update;
  if not found then raise exception 'BATCH_NOT_FOUND'; end if;
  if b.revision <> p_expected_revision then raise exception 'STALE_HISTORICAL_DELIVERY_WRITE'; end if;
  if nullif(trim(b.source_document_reference),'') is null then raise exception 'GOVERNED_APPROVAL_EVIDENCE_INCOMPLETE'; end if;
  if b.merchandise_class_id is null or b.supplier_id is null or b.received_quantity <= 0 or b.goods_cost_gbp < 0 or b.inbound_shipping_gbp < 0 then raise exception 'GOVERNED_APPROVAL_EVIDENCE_INCOMPLETE'; end if;
  if b.receipt_status='RECEIVED' and (b.validation_status <> 'VALID' or jsonb_array_length(b.validation_reasons) <> 0 or b.received_at is null) then raise exception 'APPROVAL_VALIDATION_REQUIRED'; end if;
  if b.receipt_status='REVIEW' then raise exception 'APPROVAL_VALIDATION_REQUIRED'; end if;
  v_eligible := b.receipt_status='RECEIVED' and b.validation_status='VALID';
  insert into public.vault_historical_delivery_cost_batch_approvals(batch_id,approval_note,validation_status,validation_messages,approved_by_operator_id)
  values(p_batch_id,p_note,b.validation_status,b.validation_reasons,p_actor_id);
  update public.vault_historical_delivery_cost_batches set approval_status='APPROVED',approved_by_operator_id=p_actor_id,approved_at=clock_timestamp(),revision=revision+1 where id=p_batch_id;
  return jsonb_build_object('id',p_batch_id,'revision',b.revision+1,'costing_eligible',v_eligible);
end $$;

revoke all on function public.reject_duplicate_legacy_historical_batch_evidence() from public, anon, authenticated, service_role;
revoke all on function public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.approve_governed_historical_delivery_cost_batch(uuid,bigint,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;
