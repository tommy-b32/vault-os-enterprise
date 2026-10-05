-- Disposable draft deletion may remove only draft-construction audit events.
-- All operational and accounting evidence remains fail-closed.

create or replace function public.prevent_vault_purchase_order_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  -- This narrow exception is available only while the postgres-owned,
  -- SECURITY DEFINER governed deletion RPC has set its transaction-local
  -- marker. Client/API sessions cannot satisfy the current_user check.
  if tg_op = 'DELETE'
    and current_user = 'postgres'
    and current_setting('vault.disposable_draft_event_deletion', true) = 'on' then
    return old;
  end if;

  raise exception 'Purchase-order event evidence is append-only';
end;
$function$;

create or replace function public.delete_disposable_vault_purchase_order(
  target_purchase_order_id uuid,
  target_operator_id uuid
)
returns table (
  deleted_purchase_order_id uuid,
  deleted_line_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  line_count integer;
begin
  if current_user <> 'postgres' then
    raise exception 'Governed purchase-order deletion must run as the database owner';
  end if;

  if target_purchase_order_id is null or target_operator_id is null then
    raise exception 'Purchase order and operator are required';
  end if;

  if not exists (
    select 1
    from public.vault_operators operator
    where operator.id = target_operator_id
      and operator.is_active
  ) then
    raise exception 'An active operator is required';
  end if;

  select *
  into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order was not found';
  end if;

  if purchase_order.status is distinct from 'draft' then
    raise exception 'Only draft purchase orders can be deleted';
  end if;

  if coalesce(purchase_order.paid_amount_gbp, 0) <> 0
    or exists (
      select 1 from public.vault_purchase_order_payments payment
      where payment.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_cash_payment_reconciliations reconciliation
      where reconciliation.purchase_order_id = purchase_order.id
    ) then
    raise exception 'Purchase order with accounting evidence cannot be deleted';
  end if;

  if exists (
    select 1 from public.vault_purchase_order_receipts receipt
    where receipt.purchase_order_id = purchase_order.id
  )
    or exists (
      select 1
      from public.vault_purchase_order_receipt_lines receipt_line
      join public.vault_purchase_order_lines line on line.id = receipt_line.purchase_order_line_id
      where line.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1
      from public.vault_purchase_order_inventory_postings posting
      join public.vault_purchase_order_receipts receipt on receipt.id = posting.receipt_id
      where receipt.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_governed_inventory_cost_lots lot
      where lot.purchase_order_id = purchase_order.id
         or exists (
           select 1 from public.vault_purchase_order_lines line
           where line.purchase_order_id = purchase_order.id
             and line.id = lot.purchase_order_line_id
         )
    )
    or exists (
      select 1 from public.vault_purchase_order_receipt_cost_dispositions disposition
      where disposition.purchase_order_id = purchase_order.id
         or exists (
           select 1 from public.vault_purchase_order_lines line
           where line.purchase_order_id = purchase_order.id
             and line.id = disposition.purchase_order_line_id
         )
    ) then
    raise exception 'Purchase order with inventory or receipt evidence cannot be deleted';
  end if;

  if exists (
    select 1 from public.vault_purchase_order_expected_lead_time_evidence evidence
    where evidence.purchase_order_id = purchase_order.id
  )
    or exists (
      select 1 from public.vault_purchase_order_freight_evidence evidence
      where evidence.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_fx_commitment_evidence evidence
      where evidence.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_line_merchandise_cost_evidence evidence
      where evidence.purchase_order_id = purchase_order.id
         or exists (
           select 1 from public.vault_purchase_order_lines line
           where line.purchase_order_id = purchase_order.id
             and line.id = evidence.purchase_order_line_id
         )
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_runs allocation_run
      where allocation_run.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_lines allocation_line
      where allocation_line.purchase_order_id = purchase_order.id
         or exists (
           select 1 from public.vault_purchase_order_lines line
           where line.purchase_order_id = purchase_order.id
             and line.id = allocation_line.purchase_order_line_id
         )
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_runs allocation_run
      where allocation_run.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_lines allocation_line
      where allocation_line.purchase_order_id = purchase_order.id
         or exists (
           select 1 from public.vault_purchase_order_lines line
           where line.purchase_order_id = purchase_order.id
             and line.id = allocation_line.purchase_order_line_id
         )
    ) then
    raise exception 'Purchase order with immutable operational evidence cannot be deleted';
  end if;

  if exists (
    select 1
    from public.vault_purchase_order_events event
    where event.purchase_order_id = purchase_order.id
      and (
        event.event_type is null
        or event.event_type not in (
          'fixed_pack_recommendation_added_to_draft',
          'manual_fixed_pack_added_to_draft'
        )
      )
  ) then
    raise exception 'Purchase order has non-draft operational event evidence';
  end if;

  select count(*)::integer
  into line_count
  from public.vault_purchase_order_lines line
  where line.purchase_order_id = purchase_order.id;

  perform set_config('vault.disposable_draft_event_deletion', 'on', true);

  delete from public.vault_purchase_order_events event
  where event.purchase_order_id = purchase_order.id
    and event.event_type in (
      'fixed_pack_recommendation_added_to_draft',
      'manual_fixed_pack_added_to_draft'
    );

  perform set_config('vault.disposable_draft_event_deletion', 'off', true);

  -- This draft-only idempotency record otherwise prevents header deletion.
  delete from public.vault_fixed_pack_draft_idempotency idempotency
  where idempotency.purchase_order_id = purchase_order.id;

  -- Owned lines and their size allocations cascade from the header. All
  -- evidence-bearing children were rejected above.
  delete from public.vault_purchase_orders po
  where po.id = purchase_order.id;

  return query select purchase_order.id, line_count;
end;
$function$;

revoke all on function public.delete_disposable_vault_purchase_order(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.delete_disposable_vault_purchase_order(uuid, uuid)
to service_role;

notify pgrst, 'reload schema';
