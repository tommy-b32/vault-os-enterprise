begin;

alter table public.vault_purchase_orders
  add column if not exists closed_at timestamptz null,
  add column if not exists closed_by_operator_id uuid null references public.vault_operators(id) on delete restrict;

alter table public.vault_purchase_orders
  drop constraint if exists vault_purchase_orders_status_check,
  add constraint vault_purchase_orders_status_check check (status in (
    'draft', 'recommended', 'approved', 'ordered', 'part_paid',
    'paid', 'shipped', 'received', 'cancelled', 'closed'
  ));

create or replace function public.close_governed_purchase_order(
  target_purchase_order_id uuid,
  target_operator_id uuid
) returns table(purchase_order_id uuid, status text, closed_at timestamptz, closed_by_operator_id uuid, transitioned boolean)
language plpgsql security invoker set search_path='' as $$
declare
  po public.vault_purchase_orders%rowtype;
  payment record;
  landed record;
  physical_incomplete boolean;
  posting_incomplete boolean;
  closed_time timestamptz;
begin
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then
    raise exception 'An active operator is required';
  end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  if po.status='closed' then
    if po.closed_at is null or po.closed_by_operator_id is null then raise exception 'Closed purchase order lacks closure evidence'; end if;
    return query select po.id,po.status,po.closed_at,po.closed_by_operator_id,false;
    return;
  end if;
  if po.status<>'received' then raise exception 'Only physically received purchase orders can be closed'; end if;

  select exists(
    select 1 from public.vault_purchase_order_lines l
    where l.purchase_order_id=po.id and (
      case when l.source_recommendation_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then exists(
        select 1 from public.vault_purchase_order_line_size_allocations a
        where a.purchase_order_line_id=l.id and coalesce((select sum(ra.quantity_received+ra.non_sellable_quantity) from public.vault_purchase_order_receipt_allocations ra where ra.purchase_order_line_size_allocation_id=a.id),0)<>a.ordered_units
      ) else coalesce((select sum(rl.quantity_received+rl.non_sellable_quantity) from public.vault_purchase_order_receipt_lines rl join public.vault_purchase_order_receipts r on r.id=rl.receipt_id where rl.purchase_order_line_id=l.id and r.purchase_order_id=po.id),0)<>coalesce(l.recommended_units,l.recommended_packs*l.units_per_pack) end
    )
  ) into physical_incomplete;
  if physical_incomplete then raise exception 'Physical receipt is incomplete'; end if;

  select exists(
    select 1 from public.vault_purchase_order_receipt_allocations ra
    join public.vault_purchase_order_receipt_lines rl on rl.id=ra.receipt_line_id
    join public.vault_purchase_order_receipts r on r.id=rl.receipt_id
    where r.purchase_order_id=po.id and ra.quantity_received>0 and (
      coalesce((select sum(pl.quantity) from public.vault_purchase_order_inventory_posting_lines pl join public.vault_purchase_order_inventory_postings p on p.id=pl.posting_id join public.vault_purchase_order_inventory_posting_events e on e.posting_id=p.id and e.event_type='shopify_succeeded' where p.receipt_id=r.id and pl.receipt_allocation_id=ra.id),0)<>ra.quantity_received
      or exists(select 1 from public.vault_purchase_order_inventory_posting_lines pl join public.vault_purchase_order_inventory_postings p on p.id=pl.posting_id join public.vault_purchase_order_inventory_posting_events e on e.posting_id=p.id and e.event_type='shopify_outcome_unknown' where p.receipt_id=r.id and pl.receipt_allocation_id=ra.id)
    )
  ) into posting_incomplete;
  if posting_incomplete then raise exception 'Shopify inventory posting is incomplete or unresolved'; end if;

  select * into landed from public.vault_purchase_order_landed_cost_completeness landed_cost where landed_cost.purchase_order_id=po.id;
  if not found or landed.landed_cost_completeness<>'complete_landed_cost' then raise exception 'Governed landed-cost evidence is incomplete'; end if;
  select * into payment from public.vault_purchase_order_governed_reconciled_payment_state payment_state where payment_state.purchase_order_id=po.id;
  if found then
    if payment.supplier_balance_minor_units<>0 then raise exception 'Governed supplier liability remains outstanding'; end if;
  elsif coalesce(po.actual_total_gbp,po.estimated_total_gbp) is null or po.paid_amount_gbp<>coalesce(po.actual_total_gbp,po.estimated_total_gbp) then
    raise exception 'Supplier payment is not reconciled';
  end if;

  closed_time:=clock_timestamp();
  update public.vault_purchase_orders set status='closed',closed_at=closed_time,closed_by_operator_id=target_operator_id where id=po.id;
  insert into public.vault_purchase_order_events(purchase_order_id,operator_id,event_type,idempotency_key,event_snapshot)
    values(po.id,target_operator_id,'governed_purchase_order_closed','governed-close:'||po.id::text,jsonb_build_object('physical_receipt_complete',true,'shopify_posting_complete',true,'landed_cost_completeness',landed.landed_cost_completeness,'supplier_payment_reconciled',true));
  return query select po.id,'closed'::text,closed_time,target_operator_id,true;
end;
$$;

revoke all on function public.close_governed_purchase_order(uuid,uuid) from public,anon,authenticated;
grant execute on function public.close_governed_purchase_order(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
