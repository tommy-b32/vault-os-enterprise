-- REPLAY-ONLY compatibility fixture. Do not add to Supabase migration history.
--
-- Reconstructs the one external Shopify catalogue identity that production had
-- received through shopify-sync before the governed financial-treatment migrations.
-- It must run after 20261030000000 and before 20261031000000.

do $$
declare
  vaultcare_product_id constant uuid := '0df03817-3bd0-4a74-a3e4-488fc17fd59e';
  vaultcare_product_gid constant text := 'gid://shopify/Product/16145627939194';
  vaultcare_product_title constant text := 'VaultCare - Return Protection';
  vaultcare_variant_gid constant text := 'gid://shopify/ProductVariant/57053091955066';
begin
  if exists (
    select 1 from public.vault_products
    where id = vaultcare_product_id
      and (source <> 'shopify' or source_product_id <> vaultcare_product_gid or title <> vaultcare_product_title)
  ) or exists (
    select 1 from public.vault_products
    where source = 'shopify' and source_product_id = vaultcare_product_gid
      and (id <> vaultcare_product_id or title <> vaultcare_product_title)
  ) then
    raise exception 'Replay VaultCare fixture found conflicting canonical product identity';
  end if;

  if not exists (select 1 from public.vault_products where id = vaultcare_product_id) then
    insert into public.vault_products (id, source, source_product_id, title)
    values (vaultcare_product_id, 'shopify', vaultcare_product_gid, vaultcare_product_title);
  end if;

  if exists (
    select 1 from public.vault_variants
    where source = 'shopify' and source_variant_id = vaultcare_variant_gid
      and product_id <> vaultcare_product_id
  ) then
    raise exception 'Replay VaultCare fixture found conflicting canonical variant identity';
  end if;

  if not exists (
    select 1 from public.vault_variants
    where product_id = vaultcare_product_id and source = 'shopify'
      and source_variant_id = vaultcare_variant_gid
  ) then
    insert into public.vault_variants (product_id, source, source_variant_id)
    values (vaultcare_product_id, 'shopify', vaultcare_variant_gid);
  end if;
end;
$$;
