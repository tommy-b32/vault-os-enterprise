alter table public.vault_variants
  add column if not exists shopify_image_url text null;
