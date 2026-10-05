-- One-time cleanup for a known obsolete test draft purchase order. The draft
-- was never operational: its only blocking audit rows are verified
-- draft-construction events. Normal governed deletion protections, including
-- delete_disposable_vault_purchase_order, remain unchanged.

do $cleanup$
declare
  target_purchase_order_id constant uuid := '5328b05b-b46b-4403-80bb-f3e062fda1a0';
  expected_event_ids constant uuid[] := array[
    '7302925c-df69-4f24-bcc9-5aea6cb753d4'::uuid,
    '14555f78-16b4-4d46-aea6-5ee44bcf5e71'::uuid
  ];
  expected_line_ids constant uuid[] := array[
    'ee43e4eb-ec2f-41ca-9185-51067287cf1a'::uuid,
    'fad9dad5-e358-4c56-be79-8763442790ab'::uuid
  ];
  purchase_order public.vault_purchase_orders%rowtype;
begin
  select *
  into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;

  if not found then
    raise exception 'Target obsolete test purchase order was not found';
  end if;

  if purchase_order.status is distinct from 'draft'
    or coalesce(purchase_order.estimated_total_gbp, 0) <> 125.20
    or purchase_order.total_packs is distinct from 2
    or not exists (
      select 1
      from public.vault_suppliers supplier
      where supplier.id = purchase_order.supplier_id
        and supplier.supplier_name = 'Exclusive'
    ) then
    raise exception 'Target purchase order no longer matches the approved obsolete test draft';
  end if;

  if coalesce(purchase_order.paid_amount_gbp, 0) <> 0
    or exists (
    select 1 from public.vault_purchase_order_payments payment
    where payment.purchase_order_id = target_purchase_order_id
  )
    or exists (
      select 1 from public.vault_purchase_order_cash_payment_reconciliations reconciliation
      where reconciliation.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_receipts receipt
      where receipt.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1
      from public.vault_purchase_order_receipt_lines receipt_line
      join public.vault_purchase_order_lines line on line.id = receipt_line.purchase_order_line_id
      where line.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_receipt_cost_dispositions disposition
      where disposition.purchase_order_id = target_purchase_order_id
         or disposition.purchase_order_line_id = any(expected_line_ids)
    )
    or exists (
      select 1
      from public.vault_purchase_order_inventory_postings posting
      join public.vault_purchase_order_receipts receipt on receipt.id = posting.receipt_id
      where receipt.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_governed_inventory_cost_lots lot
      where lot.purchase_order_id = target_purchase_order_id
         or lot.purchase_order_line_id = any(expected_line_ids)
    )
    or exists (
      select 1 from public.vault_purchase_order_expected_lead_time_evidence evidence
      where evidence.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_evidence evidence
      where evidence.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_fx_commitment_evidence evidence
      where evidence.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_line_merchandise_cost_evidence evidence
      where evidence.purchase_order_id = target_purchase_order_id
         or evidence.purchase_order_line_id = any(expected_line_ids)
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_runs allocation_run
      where allocation_run.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_freight_allocation_lines allocation_line
      where allocation_line.purchase_order_id = target_purchase_order_id
         or allocation_line.purchase_order_line_id = any(expected_line_ids)
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_runs allocation_run
      where allocation_run.purchase_order_id = target_purchase_order_id
    )
    or exists (
      select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_lines allocation_line
      where allocation_line.purchase_order_id = target_purchase_order_id
         or allocation_line.purchase_order_line_id = any(expected_line_ids)
    ) then
    raise exception 'Target obsolete test purchase order has operational or accounting evidence';
  end if;

  if (select count(*) from public.vault_purchase_order_events event where event.purchase_order_id = target_purchase_order_id) <> 2
    or exists (
      select 1
      from public.vault_purchase_order_events event
      where event.purchase_order_id = target_purchase_order_id
        and (
          event.id <> all(expected_event_ids)
          or (event.id = expected_event_ids[1] and (event.event_type <> 'fixed_pack_recommendation_added_to_draft' or event.purchase_order_line_id <> expected_line_ids[1]))
          or (event.id = expected_event_ids[2] and (event.event_type <> 'manual_fixed_pack_added_to_draft' or event.purchase_order_line_id <> expected_line_ids[2]))
        )
    ) then
    raise exception 'Target obsolete test purchase order has unexpected audit events';
  end if;

  if (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id = target_purchase_order_id) <> 2
    or exists (
      select 1
      from public.vault_purchase_order_lines line
      where line.purchase_order_id = target_purchase_order_id
        and line.id <> all(expected_line_ids)
    )
    or (select count(*) from public.vault_purchase_order_lines line where line.purchase_order_id = target_purchase_order_id and line.id = any(expected_line_ids)) <> 2 then
    raise exception 'Target obsolete test purchase order no longer has exactly the approved draft lines';
  end if;

  -- This one-time cleanup removes only known test draft-construction events.
  -- Their exact IDs, types, and line associations were verified above; the
  -- normal append-only invariant is re-enabled unchanged immediately after.
  alter table public.vault_purchase_order_events
    disable trigger vault_purchase_order_events_append_only;

  delete from public.vault_purchase_order_events event
  where event.purchase_order_id = target_purchase_order_id
    and event.id = any(expected_event_ids);

  alter table public.vault_purchase_order_events
    enable trigger vault_purchase_order_events_append_only;

  delete from public.vault_fixed_pack_draft_idempotency idempotency
  where idempotency.purchase_order_id = target_purchase_order_id;

  -- Owned lines and line-size allocations are removed by their existing
  -- ON DELETE CASCADE foreign keys after every guard above has passed.
  delete from public.vault_purchase_orders po
  where po.id = target_purchase_order_id;
end;
$cleanup$;
