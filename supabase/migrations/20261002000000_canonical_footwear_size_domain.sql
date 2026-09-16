-- Explicit domain/system prevents identical numeric footwear labels colliding.
begin;
alter table public.vault_variants add column if not exists size_domain text;
alter table public.vault_variants add column if not exists size_system text;
alter table public.vault_variants drop constraint if exists vault_variants_size_domain_check;
alter table public.vault_variants add constraint vault_variants_size_domain_check check (
  (size_domain is null and size_system is null)
  or (size_domain = 'apparel' and size_system = 'apparel')
  or (size_domain = 'footwear' and size_system in ('UK','US','EU'))
);
create index if not exists vault_variants_canonical_size_domain_idx on public.vault_variants(product_id, model_design, size_domain, size_system, normalized_size) where source='shopify' and source_active and identity_resolution_status='resolved';
commit;
