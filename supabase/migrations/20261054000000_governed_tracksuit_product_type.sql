begin;

insert into public.vault_cost_types (id, display_name)
values ('tracksuit', 'Tracksuit')
on conflict (id) do nothing;

insert into public.vault_pack_profiles (id, display_name, units_per_pack)
values ('tracksuit_5_piece', 'Tracksuit', 5)
on conflict (id) do nothing;

insert into public.vault_cost_type_pack_profile_compatibilities (cost_type_id, pack_profile_id)
values ('tracksuit', 'tracksuit_5_piece')
on conflict (cost_type_id, pack_profile_id) do nothing;

do $evidence$
declare exclusive_supplier_id uuid;
begin
  select supplier.id into exclusive_supplier_id
  from public.vault_suppliers supplier
  where lower(trim(supplier.supplier_name)) = 'exclusive' and supplier.is_active;
  if exclusive_supplier_id is null then raise exception 'Active Exclusive supplier is required for Tracksuit merchandise-cost evidence'; end if;
  insert into public.vault_supplier_product_type_merchandise_cost_evidence
    (supplier_id, cost_type_id, pack_profile_id, supplier_currency, merchandise_pack_cost, cost_scope, shipping_evidence_status, source_note)
  values
    (exclusive_supplier_id, 'tracksuit', 'tracksuit_5_piece', 'USD', 175.00, 'merchandise_only', 'unknown', 'Owner-supplied Exclusive Tracksuit merchandise cost: USD 175.00 per five-unit pack; shipping is unknown and product-unallocated.')
  on conflict do nothing;
end $evidence$;

notify pgrst, 'reload schema';
commit;
