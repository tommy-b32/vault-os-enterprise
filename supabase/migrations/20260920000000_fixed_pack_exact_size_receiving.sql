alter table public.vault_purchase_order_receipt_allocations
  drop constraint if exists vault_purchase_order_receipt_allocations_quantity_received_check;
alter table public.vault_purchase_order_receipt_allocations
  add constraint vault_purchase_order_receipt_allocations_physical_quantity_positive
  check (quantity_received >= 0 and quantity_received + non_sellable_quantity > 0);

create or replace function public.record_vault_purchase_order_receipt(target_purchase_order_id uuid,target_operator_id uuid,target_received_date date,target_received_location_id uuid,target_idempotency_key text,target_lines jsonb)
returns table(receipt_id uuid,purchase_order_id uuid,status text,received_at timestamptz,fully_received boolean,transitioned boolean)
language plpgsql security invoker set search_path = '' as $function$
declare po public.vault_purchase_orders%rowtype; existing public.vault_purchase_order_receipts%rowtype; new_receipt uuid; receipt_created_at timestamptz; input_line jsonb; input_allocation jsonb; receipt_line uuid; line_id uuid; source_type text; location_snapshot text; allocation_id uuid; saved public.vault_purchase_order_line_size_allocations%rowtype; sellable integer; nonsellable integer; line_sellable integer; line_nonsellable integer; ordered integer; accounted integer; prior_physical integer; all_received boolean;
begin
  if target_received_date is null then raise exception 'Received date is required'; end if;
  if target_received_location_id is null then raise exception 'Receiving location is required'; end if;
  if target_idempotency_key is null or length(trim(target_idempotency_key))=0 then raise exception 'Receipt idempotency key is required'; end if;
  if target_lines is null or jsonb_typeof(target_lines)<>'array' or jsonb_array_length(target_lines)=0 then raise exception 'At least one received purchase-order line is required'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=target_operator_id and o.is_active) then raise exception 'An active operator is required'; end if;
  select * into po from public.vault_purchase_orders where id=target_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found'; end if;
  select * into existing from public.vault_purchase_order_receipts receipt where receipt.purchase_order_id=po.id and receipt.idempotency_key=target_idempotency_key;
  if found then return query select existing.id,po.id,po.status,po.received_at,po.status='received',false; return; end if;
  select source_location_id into location_snapshot from public.vault_locations where id=target_received_location_id and source='shopify' and active and length(trim(source_location_id))>0;
  if not found then raise exception 'An active canonical Shopify location is required'; end if;
  if po.status not in ('ordered','part_paid','paid','shipped') then raise exception 'Purchase order cannot be received from status %',po.status; end if;
  if exists(select 1 from jsonb_array_elements(target_lines) x where jsonb_typeof(x)<>'object' or not(x?'purchase_order_line_id') or not(x?'allocations') or jsonb_typeof(x->'allocations')<>'array') then raise exception 'Every receipt line requires a PO line and exact variant allocations'; end if;
  if (select count(*) from jsonb_array_elements(target_lines))<>(select count(distinct x->>'purchase_order_line_id') from jsonb_array_elements(target_lines) x) then raise exception 'Each purchase-order line may appear only once per receipt'; end if;

  -- Validate all input before writing any immutable evidence.
  for input_line in select value from jsonb_array_elements(target_lines) loop
    begin line_id:=(input_line->>'purchase_order_line_id')::uuid; exception when others then raise exception 'Receipt line identity and quantity must be valid'; end;
    select line.source_recommendation_type into source_type from public.vault_purchase_order_lines line where line.id=line_id and line.purchase_order_id=po.id;
    if not found then raise exception 'Receipt line is not part of this purchase order'; end if;
    if source_type is null or source_type not in ('purchase_intelligence_required','purchase_intelligence_bring_forward','fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then raise exception 'RECEIPT_SOURCE_TYPE_UNSUPPORTED'; end if;
    if source_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then
      if jsonb_array_length(input_line->'allocations')=0 then raise exception 'FIXED_PACK_MALFORMED_QUANTITY'; end if;
      if (select count(*) from jsonb_array_elements(input_line->'allocations'))<>(select count(distinct x->>'purchase_order_line_size_allocation_id') from jsonb_array_elements(input_line->'allocations') x) then raise exception 'FIXED_PACK_DUPLICATE_SIZE_ALLOCATION'; end if;
      for input_allocation in select value from jsonb_array_elements(input_line->'allocations') loop
        begin allocation_id:=(input_allocation->>'purchase_order_line_size_allocation_id')::uuid; sellable:=coalesce((input_allocation->>'quantity_received')::integer,0); nonsellable:=coalesce((input_allocation->>'non_sellable_quantity')::integer,0); exception when others then raise exception 'FIXED_PACK_MALFORMED_QUANTITY'; end;
        if allocation_id is null then raise exception 'FIXED_PACK_SIZE_ALLOCATION_REQUIRED'; end if;
        if sellable<0 or nonsellable<0 or sellable+nonsellable<=0 then raise exception 'FIXED_PACK_MALFORMED_QUANTITY'; end if;
        select * into saved from public.vault_purchase_order_line_size_allocations where id=allocation_id for update;
        if not found then raise exception 'FIXED_PACK_SIZE_ALLOCATION_NOT_FOUND'; end if;
        if saved.purchase_order_line_id<>line_id then raise exception 'FIXED_PACK_SIZE_ALLOCATION_LINE_MISMATCH'; end if;
        if (select count(*) from public.vault_variants v where v.id=saved.variant_id and v.source='shopify' and v.source_active and v.identity_resolution_status='resolved' and v.product_id=saved.parent_product_id and v.model_design=saved.model_design and v.normalized_size=saved.normalized_size and v.source_variant_id=saved.shopify_variant_id_snapshot and v.source_inventory_item_id=saved.shopify_inventory_item_id_snapshot)<>1 then raise exception 'FIXED_PACK_VARIANT_IDENTITY_CHANGED'; end if;
        select coalesce(sum(a.quantity_received+a.non_sellable_quantity),0)::integer into prior_physical from public.vault_purchase_order_receipt_allocations a where a.purchase_order_line_size_allocation_id=saved.id;
        if prior_physical+sellable+nonsellable>saved.ordered_units then raise exception 'FIXED_PACK_PHYSICAL_ALLOCATION_EXCEEDED'; end if;
      end loop;
    else
      begin line_sellable:=coalesce((select sum((x->>'quantity_received')::integer) from jsonb_array_elements(input_line->'allocations') x),0); line_nonsellable:=coalesce((input_line->>'non_sellable_quantity')::integer,0); exception when others then raise exception 'Receipt line identity and quantity must be valid'; end;
      if line_sellable<0 or line_nonsellable<0 or line_sellable+line_nonsellable<=0 then raise exception 'Every receipt line requires sellable or non-sellable physical units'; end if;
      select coalesce(recommended_units,recommended_packs*units_per_pack) into ordered from public.vault_purchase_order_lines where id=line_id;
      select coalesce(sum(quantity_received+non_sellable_quantity),0)::integer into accounted from public.vault_purchase_order_receipt_lines where purchase_order_line_id=line_id;
      if accounted+line_sellable+line_nonsellable>ordered then raise exception 'Physical receipt exceeds the ordered quantity for purchase-order line %',line_id; end if;
      for input_allocation in select value from jsonb_array_elements(input_line->'allocations') loop
        begin allocation_id:=(input_allocation->>'variant_id')::uuid; sellable:=(input_allocation->>'quantity_received')::integer; exception when others then raise exception 'Receipt variant allocation identity and quantity must be valid'; end;
        if sellable is null or sellable<=0 or not exists(select 1 from public.vault_variants v join public.vault_purchase_order_lines l on l.id=line_id where v.id=allocation_id and v.source='shopify' and v.source_active and v.source_variant_id is not null and v.source_inventory_item_id is not null and v.identity_resolution_status='resolved' and nullif(trim(v.model_design),'') is not null and nullif(trim(v.normalized_size),'') is not null and v.product_id::text||'::'||trim(v.model_design)=l.style_id) then raise exception 'Variant allocation does not exactly match the persisted PO style'; end if;
      end loop;
    end if;
  end loop;
  insert into public.vault_purchase_order_receipts(purchase_order_id,received_location_id,shopify_location_id_snapshot,received_date,created_by_operator_id,idempotency_key) values(po.id,target_received_location_id,location_snapshot,target_received_date,target_operator_id,target_idempotency_key) returning id,created_at into new_receipt,receipt_created_at;
  for input_line in select value from jsonb_array_elements(target_lines) loop
    line_id:=(input_line->>'purchase_order_line_id')::uuid; select source_recommendation_type into source_type from public.vault_purchase_order_lines where id=line_id;
    if source_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then
      select coalesce(sum(coalesce((x->>'quantity_received')::integer,0)),0)::integer,coalesce(sum(coalesce((x->>'non_sellable_quantity')::integer,0)),0)::integer into line_sellable,line_nonsellable from jsonb_array_elements(input_line->'allocations') x;
    else
      select coalesce(sum((x->>'quantity_received')::integer),0)::integer into line_sellable from jsonb_array_elements(input_line->'allocations') x; line_nonsellable:=coalesce((input_line->>'non_sellable_quantity')::integer,0);
    end if;
    insert into public.vault_purchase_order_receipt_lines(receipt_id,purchase_order_line_id,quantity_received,non_sellable_quantity,discrepancy_note) values(new_receipt,line_id,line_sellable,line_nonsellable,nullif(trim(input_line->>'discrepancy_note'),'')) returning id into receipt_line;
    for input_allocation in select value from jsonb_array_elements(input_line->'allocations') loop
      if source_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then
        allocation_id:=(input_allocation->>'purchase_order_line_size_allocation_id')::uuid; select * into saved from public.vault_purchase_order_line_size_allocations where id=allocation_id;
        insert into public.vault_purchase_order_receipt_allocations(receipt_line_id,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,quantity_received,non_sellable_quantity,purchase_order_line_size_allocation_id) values(receipt_line,saved.variant_id,saved.shopify_variant_id_snapshot,saved.shopify_inventory_item_id_snapshot,coalesce((input_allocation->>'quantity_received')::integer,0),coalesce((input_allocation->>'non_sellable_quantity')::integer,0),saved.id);
      else
        allocation_id:=(input_allocation->>'variant_id')::uuid; insert into public.vault_purchase_order_receipt_allocations(receipt_line_id,variant_id,shopify_variant_id_snapshot,shopify_inventory_item_id_snapshot,quantity_received,non_sellable_quantity,purchase_order_line_size_allocation_id) select receipt_line,v.id,v.source_variant_id,v.source_inventory_item_id,(input_allocation->>'quantity_received')::integer,0,null from public.vault_variants v where v.id=allocation_id;
      end if;
    end loop;
  end loop;
  select bool_and(case when l.source_recommendation_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase') then not exists(select 1 from public.vault_purchase_order_line_size_allocations s where s.purchase_order_line_id=l.id and coalesce((select sum(a.quantity_received+a.non_sellable_quantity) from public.vault_purchase_order_receipt_allocations a where a.purchase_order_line_size_allocation_id=s.id),0)<>s.ordered_units) else coalesce((select sum(rl.quantity_received+rl.non_sellable_quantity) from public.vault_purchase_order_receipt_lines rl where rl.purchase_order_line_id=l.id),0)=coalesce(l.recommended_units,l.recommended_packs*l.units_per_pack) end) into all_received from public.vault_purchase_order_lines l where l.purchase_order_id=po.id;
  if all_received then update public.vault_purchase_orders set status='received',received_at=receipt_created_at where id=po.id; end if;
  return query select new_receipt,po.id,case when all_received then 'received' else po.status end,case when all_received then receipt_created_at else null end,all_received,true;
end;
$function$;
revoke all on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
