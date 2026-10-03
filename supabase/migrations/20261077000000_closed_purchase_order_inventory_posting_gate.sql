begin;

-- Serialize a reservation with the governed PO close transition.  Replays of
-- an already-created reservation remain idempotent; only a new reservation is
-- prohibited once the canonical parent is closed.
do $migration$
declare
  definition text;
  reservation_lookup text := $needle$  select id into existing_id from public.vault_purchase_order_inventory_postings
    where receipt_id = target_receipt_id and idempotency_key = target_idempotency_key;$needle$;
  parent_lock text := $replacement$  perform 1 from public.vault_purchase_orders purchase_order
    where purchase_order.id = target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  select id into existing_id from public.vault_purchase_order_inventory_postings
    where receipt_id = target_receipt_id and idempotency_key = target_idempotency_key;$replacement$;
  new_reservation_gate text := $needle$  if (select count(*) from jsonb_array_elements(target_allocations)) <>$needle$;
  gated_new_reservation text := $replacement$  if exists (
    select 1 from public.vault_purchase_orders purchase_order
    where purchase_order.id = target_purchase_order_id and purchase_order.status = 'closed'
  ) then
    raise exception 'Closed purchase orders cannot create inventory posting reservations';
  end if;
  if (select count(*) from jsonb_array_elements(target_allocations)) <>$replacement$;
begin
  select pg_get_functiondef('public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb)'::regprocedure)
    into definition;
  if definition is null or position(reservation_lookup in definition) = 0 then
    raise exception 'Inventory posting reservation predecessor was not found';
  end if;
  definition := replace(definition, reservation_lookup, parent_lock);
  if position(new_reservation_gate in definition) = 0 then
    raise exception 'Inventory posting reservation allocation predecessor was not found';
  end if;
  definition := replace(definition, new_reservation_gate, gated_new_reservation);
  if position('Closed purchase orders cannot create inventory posting reservations' in definition) = 0
     or position('for update' in definition) = 0 then
    raise exception 'Closed purchase order inventory posting gate patch failed';
  end if;
  execute definition;
end;
$migration$;

revoke all on function public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_vault_purchase_order_inventory_posting(uuid,uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
