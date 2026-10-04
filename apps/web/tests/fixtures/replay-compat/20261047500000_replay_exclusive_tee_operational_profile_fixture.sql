-- REPLAY-ONLY compatibility fixture. Do not add to Supabase migration history.
-- Reconstructs only the verified historical operational state required by 20261048000000.
-- Values were recovered read-only from production. Place after 20261047000000 and before 20261048000000.
begin;

-- Do not create the later historical profile-version evidence merely by supplying
-- the current profile needed for this migration.
alter table public.vault_supplier_product_type_cost_profiles disable trigger supplier_cost_profile_version_record;

do $$
declare
  exclusive_supplier_id constant uuid := '751bb88d-9f16-4663-a17c-f36a7618e780';
  exclusive_tee_profile_id constant uuid := '5eec6ed8-16af-4024-8f02-e43fdf5c8cd7';
  target record;
begin
  if exists (select 1 from public.vault_supplier_product_type_cost_profiles profile
    where profile.id = exclusive_tee_profile_id and (profile.supplier_id is distinct from exclusive_supplier_id or profile.cost_type_id is distinct from 'tee' or profile.active is distinct from true or profile.superseded_at is not null or profile.supplier_currency is distinct from 'USD' or profile.pack_cost is distinct from 50.00 or profile.shipping_cost_per_pack is distinct from 23.25 or profile.import_cost_per_pack is distinct from 0 or profile.exchange_rate_to_gbp is distinct from 0.745755 or profile.units_per_pack is distinct from 5 or profile.price_updated_at is distinct from date '2026-09-16' or profile.effective_from is distinct from timestamptz '2026-09-16T12:00:00Z'))
    or exists (select 1 from public.vault_supplier_product_type_cost_profiles profile where profile.supplier_id = exclusive_supplier_id and profile.cost_type_id = 'tee' and profile.active and profile.id <> exclusive_tee_profile_id) then
    raise exception 'Replay Exclusive tee fixture found conflicting supplier profile';
  end if;
  if not exists (select 1 from public.vault_supplier_product_type_cost_profiles where id = exclusive_tee_profile_id) then
    insert into public.vault_supplier_product_type_cost_profiles (id, supplier_id, cost_type_id, supplier_currency, exchange_rate_to_gbp, pack_cost, shipping_cost_per_pack, import_cost_per_pack, units_per_pack, price_updated_at, effective_from, active, superseded_at)
    values (exclusive_tee_profile_id, exclusive_supplier_id, 'tee', 'USD', 0.745755, 50.00, 23.25, 0, 5, date '2026-09-16', timestamptz '2026-09-16T12:00:00Z', true, null);
  end if;
  for target in select * from (values
    ('5c9318eb-d273-44dc-b732-aeddaaa59d0b'::uuid,14),('c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c'::uuid,14),('23d19fdb-5e74-4609-9009-6b36cdc0b7d5'::uuid,7),('7d8fe898-fa72-43b4-9ab9-c7067e7287c6'::uuid,7),('224f4683-8147-4e93-a5ec-5a381ff8a1aa'::uuid,7),('746d5f16-614e-490e-b509-a0e61b0c2393'::uuid,7),('f75e4ab7-8431-4076-8aa2-c92fa5dad9f6'::uuid,7),('274e89ef-1532-410b-bdcd-866e9b4f32d4'::uuid,5),('87b460bb-b8b2-4dd9-b347-d39245ec69ca'::uuid,7),('4b5652fa-3e28-4c9b-8b7c-97319ed895ad'::uuid,7),('9c2f40f9-aed9-42ab-8008-4b3421d7ba11'::uuid,7),('a85a5c1a-291a-4c2f-81aa-f2b287d63432'::uuid,7),('5e39ef85-f024-44cb-b159-8bd57fe20692'::uuid,7),('55d7735f-4bb3-4d18-a0bc-e34793c53a1c'::uuid,7),('d508fd80-e4e8-4813-be92-eb24814b8f5c'::uuid,7)
  ) as settings(product_id,target_stock_days) loop
    if exists (select 1 from public.vault_product_settings settings where settings.product_id=target.product_id and (settings.supplier_id is distinct from exclusive_supplier_id or settings.inventory_strategy is distinct from 'stocked' or settings.restock_enabled is distinct from true or settings.pack_profile is distinct from 'tee_5_piece' or settings.supplier_moq_packs is distinct from 1 or settings.target_stock_days is distinct from target.target_stock_days)) then
      raise exception 'Replay Exclusive tee fixture found conflicting product settings for %', target.product_id;
    end if;
    insert into public.vault_product_settings (product_id,supplier_id,inventory_strategy,restock_enabled,pack_profile,supplier_moq_packs,target_stock_days)
    values (target.product_id,exclusive_supplier_id,'stocked',true,'tee_5_piece',1,target.target_stock_days) on conflict (product_id) do nothing;
  end loop;
end;
$$;

alter table public.vault_supplier_product_type_cost_profiles enable trigger supplier_cost_profile_version_record;
commit;
