-- REPLAY-ONLY compatibility fixture. Do not add to Supabase migration history.
--
-- Reconstructs verified historical Exclusive supplier and Shopify catalogue
-- identities required by the governed Exclusive Tee and Polo COGS foundations.
-- It must run after 20261034000000 and before 20261035000000.

do $$
declare
  exclusive_supplier_id constant uuid := '751bb88d-9f16-4663-a17c-f36a7618e780';
  product record;
begin
  if exists (
    select 1 from public.vault_suppliers
    where id = exclusive_supplier_id
      and (supplier_name <> 'Exclusive' or is_active is distinct from true or currency_code <> 'GBP')
  ) or exists (
    select 1 from public.vault_suppliers
    where supplier_name = 'Exclusive' and id <> exclusive_supplier_id
  ) then
    raise exception 'Replay Exclusive fixture found conflicting supplier identity';
  end if;

  if not exists (select 1 from public.vault_suppliers where id = exclusive_supplier_id) then
    insert into public.vault_suppliers (id, supplier_name, is_active, currency_code)
    values (exclusive_supplier_id, 'Exclusive', true, 'GBP');
  end if;

  for product in
    select * from (values
      ('5c9318eb-d273-44dc-b732-aeddaaa59d0b'::uuid, 'gid://shopify/Product/16086093234554', 'Amir Domino Tee'),
      ('c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c'::uuid, 'gid://shopify/Product/16086093169018', 'Balencia Tee'),
      ('23d19fdb-5e74-4609-9009-6b36cdc0b7d5'::uuid, 'gid://shopify/Product/16086092841338', 'Bamain Tee''s'),
      ('7d8fe898-fa72-43b4-9ab9-c7067e7287c6'::uuid, 'gid://shopify/Product/16086092775802', 'BBerry Tee''s'),
      ('224f4683-8147-4e93-a5ec-5a381ff8a1aa'::uuid, 'gid://shopify/Product/16093419012474', 'Casa Tee''s'),
      ('746d5f16-614e-490e-b509-a0e61b0c2393'::uuid, 'gid://shopify/Product/16086092710266', 'CD Tee''s'),
      ('f75e4ab7-8431-4076-8aa2-c92fa5dad9f6'::uuid, 'gid://shopify/Product/16086093136250', 'D&G Tee''s'),
      ('274e89ef-1532-410b-bdcd-866e9b4f32d4'::uuid, 'gid://shopify/Product/16093411770746', 'Hrmes Tee''s'),
      ('87b460bb-b8b2-4dd9-b347-d39245ec69ca'::uuid, 'gid://shopify/Product/16086092513658', 'LVE Tee''s'),
      ('dfd40a5b-38f4-4ebe-b76e-8daf5a260694'::uuid, 'gid://shopify/Product/16185906758010', 'Mnclr 1952'),
      ('4b5652fa-3e28-4c9b-8b7c-97319ed895ad'::uuid, 'gid://shopify/Product/16086092644730', 'Mnclr Black Badge Tee''s'),
      ('9c2f40f9-aed9-42ab-8008-4b3421d7ba11'::uuid, 'gid://shopify/Product/16086092579194', 'Mnclr classic Tee''s'),
      ('4e3dcdf3-13be-4f9c-8df6-2ec325f92dd6'::uuid, 'gid://shopify/Product/16185913573754', 'Mnclr Double Badge Tee'),
      ('a85a5c1a-291a-4c2f-81aa-f2b287d63432'::uuid, 'gid://shopify/Product/16093502800250', 'Mnclr Stripe'),
      ('5e39ef85-f024-44cb-b159-8bd57fe20692'::uuid, 'gid://shopify/Product/16086092939642', 'Of White Tee''s'),
      ('55d7735f-4bb3-4d18-a0bc-e34793c53a1c'::uuid, 'gid://shopify/Product/16093347938682', 'Prda Tee''s'),
      ('d508fd80-e4e8-4813-be92-eb24814b8f5c'::uuid, 'gid://shopify/Product/16093390537082', 'Ucci Tee''s'),
      ('92aada38-cd9d-4f9c-9786-9597afa26ca3'::uuid, 'gid://shopify/Product/16208544530810', 'Valentino Tee''s'),
      ('374eca12-5ca5-466e-aa0d-194ffbc86aa4'::uuid, 'gid://shopify/Product/16132354376058', 'Monc Polo''s'),
      ('093fbada-eba4-4594-a47d-6aea4abea85d'::uuid, 'gid://shopify/Product/16132348608890', 'Fred P Polo''s')
    ) as identities(id, source_product_id, title)
  loop
    if exists (
      select 1 from public.vault_products
      where id = product.id
        and (source <> 'shopify' or source_product_id <> product.source_product_id or title <> product.title)
    ) or exists (
      select 1 from public.vault_products
      where source_product_id = product.source_product_id and id <> product.id
    ) then
      raise exception 'Replay Exclusive fixture found conflicting product identity';
    end if;

    if not exists (select 1 from public.vault_products where id = product.id) then
      insert into public.vault_products (id, source, source_product_id, title)
      values (product.id, 'shopify', product.source_product_id, product.title);
    end if;
  end loop;
end;
$$;
