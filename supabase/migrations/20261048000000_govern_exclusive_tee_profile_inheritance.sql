-- Move the identified current Exclusive tee parents onto the existing governed
-- supplier tee profile.  Legacy product-cost rows deliberately remain for
-- historical snapshots; full inheritance makes those values non-effective for
-- current purchasing intelligence.
begin;

do $$
declare
  exclusive_supplier_id constant uuid := '751bb88d-9f16-4663-a17c-f36a7618e780';
  exclusive_tee_profile_id constant uuid := '5eec6ed8-16af-4024-8f02-e43fdf5c8cd7';
  target_product_ids constant uuid[] := array[
    '5c9318eb-d273-44dc-b732-aeddaaa59d0b',
    'c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c',
    '23d19fdb-5e74-4609-9009-6b36cdc0b7d5',
    '7d8fe898-fa72-43b4-9ab9-c7067e7287c6',
    '224f4683-8147-4e93-a5ec-5a381ff8a1aa',
    '746d5f16-614e-490e-b509-a0e61b0c2393',
    'f75e4ab7-8431-4076-8aa2-c92fa5dad9f6',
    '274e89ef-1532-410b-bdcd-866e9b4f32d4',
    '87b460bb-b8b2-4dd9-b347-d39245ec69ca',
    '4b5652fa-3e28-4c9b-8b7c-97319ed895ad',
    '9c2f40f9-aed9-42ab-8008-4b3421d7ba11',
    'a85a5c1a-291a-4c2f-81aa-f2b287d63432',
    '5e39ef85-f024-44cb-b159-8bd57fe20692',
    '55d7735f-4bb3-4d18-a0bc-e34793c53a1c',
    'd508fd80-e4e8-4813-be92-eb24814b8f5c'
  ];
begin
  if cardinality(target_product_ids) <> 15 then
    raise exception 'Expected 15 Exclusive tee parent products';
  end if;

  if not exists (
    select 1
    from public.vault_supplier_product_type_cost_profiles profile
    where profile.id = exclusive_tee_profile_id
      and profile.supplier_id = exclusive_supplier_id
      and profile.cost_type_id = 'tee'
      and profile.active
      and profile.supplier_currency = 'USD'
      and profile.pack_cost = 50.00
      and profile.shipping_cost_per_pack = 23.25
      and profile.import_cost_per_pack = 0
      and profile.exchange_rate_to_gbp = 0.745755
      and profile.units_per_pack = 5
  ) then
    raise exception 'The authoritative Exclusive tee profile is not the expected active profile';
  end if;

  if (
    select count(*)
    from public.vault_product_commercial_intelligence commercial
    where commercial.product_id = any(target_product_ids)
      and commercial.supplier_id = exclusive_supplier_id
      and commercial.pack_profile = 'tee_5_piece'
  ) <> 15 then
    raise exception 'Every correction target must currently be an Exclusive tee parent product';
  end if;

  if exists (
    select 1
    from public.vault_product_cost_type_assignments assignment
    where assignment.product_id = any(target_product_ids)
      and assignment.cost_type_id <> 'tee'
  ) then
    raise exception 'A correction target already has a non-tee cost-type assignment';
  end if;

  if exists (
    select 1
    from public.vault_product_cost_profile_inheritance inheritance
    where inheritance.product_id = any(target_product_ids)
      and (
        inheritance.profile_id <> exclusive_tee_profile_id
        or not inheritance.inherit_pack_cost
        or not inheritance.inherit_shipping_cost
        or not inheritance.inherit_import_cost
        or not inheritance.inherit_units_per_pack
        or not inheritance.inherit_fx
      )
  ) then
    raise exception 'A correction target already has incompatible cost-profile inheritance';
  end if;
end;
$$;

insert into public.vault_product_cost_type_assignments (product_id, cost_type_id, notes)
values
  ('5c9318eb-d273-44dc-b732-aeddaaa59d0b', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('23d19fdb-5e74-4609-9009-6b36cdc0b7d5', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('7d8fe898-fa72-43b4-9ab9-c7067e7287c6', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('224f4683-8147-4e93-a5ec-5a381ff8a1aa', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('746d5f16-614e-490e-b509-a0e61b0c2393', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('f75e4ab7-8431-4076-8aa2-c92fa5dad9f6', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('274e89ef-1532-410b-bdcd-866e9b4f32d4', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('87b460bb-b8b2-4dd9-b347-d39245ec69ca', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('4b5652fa-3e28-4c9b-8b7c-97319ed895ad', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('9c2f40f9-aed9-42ab-8008-4b3421d7ba11', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('a85a5c1a-291a-4c2f-81aa-f2b287d63432', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('5e39ef85-f024-44cb-b159-8bd57fe20692', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('55d7735f-4bb3-4d18-a0bc-e34793c53a1c', 'tee', 'Governed Exclusive tee profile inheritance'),
  ('d508fd80-e4e8-4813-be92-eb24814b8f5c', 'tee', 'Governed Exclusive tee profile inheritance')
on conflict (product_id) do update
set cost_type_id = excluded.cost_type_id,
    notes = excluded.notes;

insert into public.vault_product_cost_profile_inheritance (
  product_id,
  profile_id,
  inherit_pack_cost,
  inherit_shipping_cost,
  inherit_import_cost,
  inherit_units_per_pack,
  inherit_fx
)
select assignment.product_id,
  '5eec6ed8-16af-4024-8f02-e43fdf5c8cd7',
  true, true, true, true, true
from public.vault_product_cost_type_assignments assignment
where assignment.product_id = any(array[
  '5c9318eb-d273-44dc-b732-aeddaaa59d0b',
  'c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c',
  '23d19fdb-5e74-4609-9009-6b36cdc0b7d5',
  '7d8fe898-fa72-43b4-9ab9-c7067e7287c6',
  '224f4683-8147-4e93-a5ec-5a381ff8a1aa',
  '746d5f16-614e-490e-b509-a0e61b0c2393',
  'f75e4ab7-8431-4076-8aa2-c92fa5dad9f6',
  '274e89ef-1532-410b-bdcd-866e9b4f32d4',
  '87b460bb-b8b2-4dd9-b347-d39245ec69ca',
  '4b5652fa-3e28-4c9b-8b7c-97319ed895ad',
  '9c2f40f9-aed9-42ab-8008-4b3421d7ba11',
  'a85a5c1a-291a-4c2f-81aa-f2b287d63432',
  '5e39ef85-f024-44cb-b159-8bd57fe20692',
  '55d7735f-4bb3-4d18-a0bc-e34793c53a1c',
  'd508fd80-e4e8-4813-be92-eb24814b8f5c'
]::uuid[])
on conflict (product_id) do update
set profile_id = excluded.profile_id,
    inherit_pack_cost = excluded.inherit_pack_cost,
    inherit_shipping_cost = excluded.inherit_shipping_cost,
    inherit_import_cost = excluded.inherit_import_cost,
    inherit_units_per_pack = excluded.inherit_units_per_pack,
    inherit_fx = excluded.inherit_fx;

-- Do not delete vault_product_costs: those immutable historical source rows are
-- retained, while the view above now resolves all current purchasing components
-- from the authoritative supplier profile.
commit;
