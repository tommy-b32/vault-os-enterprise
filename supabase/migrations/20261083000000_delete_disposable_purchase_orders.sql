-- Permanent deletion is deliberately limited to disposable, pre-operational
-- purchase orders. Any immutable evidence or operational posting blocks it.

create function public.delete_disposable_vault_purchase_order(
  target_purchase_order_id uuid,
  target_operator_id uuid
)
returns table (
  deleted_purchase_order_id uuid,
  deleted_line_count integer
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  line_count integer;
begin
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

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;

  if not found then
    raise exception 'Purchase order was not found';
  end if;

  if purchase_order.status not in ('draft', 'cancelled') then
    raise exception 'Only draft or cancelled purchase orders can be deleted';
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
    )
    or exists (
      select 1 from public.vault_purchase_order_receipt_cost_dispositions disposition
      where disposition.purchase_order_id = purchase_order.id
    ) then
    raise exception 'Purchase order with inventory or receipt evidence cannot be deleted';
  end if;

  if exists (
    select 1 from public.vault_purchase_order_events event
    where event.purchase_order_id = purchase_order.id
  )
    or exists (
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
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_runs allocation_run
      where allocation_run.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_lines allocation_line
      where allocation_line.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_runs allocation_run
      where allocation_run.purchase_order_id = purchase_order.id
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_lines allocation_line
      where allocation_line.purchase_order_id = purchase_order.id
    ) then
    raise exception 'Purchase order with immutable operational evidence cannot be deleted';
  end if;

  select count(*)::integer into line_count
  from public.vault_purchase_order_lines line
  where line.purchase_order_id = purchase_order.id;

  -- This is exclusively an idempotency record for the target draft. Its line
  -- and header references otherwise prevent deletion; no shared catalogue,
  -- supplier, product, inventory, or evidence record is deleted.
  delete from public.vault_fixed_pack_draft_idempotency idempotency
  where idempotency.purchase_order_id = purchase_order.id;

  -- Purchase-order lines and their size allocations are owned by the header
  -- through ON DELETE CASCADE. All evidence-bearing children were rejected.
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
