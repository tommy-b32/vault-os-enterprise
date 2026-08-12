-- Canonical Shopify catalogue reconciliation diagnostics and orchestration.
-- Historical variants remain addressable; source_active controls current truth.

alter table public.vault_variants
  add column if not exists source_active boolean not null default true,
  add column if not exists source_deleted_at timestamptz;

create index if not exists vault_variants_current_shopify_idx
  on public.vault_variants (source, source_active, source_variant_id);

create table if not exists public.vault_shopify_catalogue_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_status text not null check (sync_status in ('syncing', 'current', 'failed')),
  sync_started_at timestamptz not null default now(),
  sync_completed_at timestamptz,
  sync_duration_ms bigint check (sync_duration_ms is null or sync_duration_ms >= 0),
  shopify_products_processed integer check (shopify_products_processed is null or shopify_products_processed >= 0),
  shopify_variants_processed integer check (shopify_variants_processed is null or shopify_variants_processed >= 0),
  products_created integer check (products_created is null or products_created >= 0),
  products_updated integer check (products_updated is null or products_updated >= 0),
  variants_created integer check (variants_created is null or variants_created >= 0),
  variants_updated integer check (variants_updated is null or variants_updated >= 0),
  stale_variants_reconciled integer check (stale_variants_reconciled is null or stale_variants_reconciled >= 0),
  shopify_api_success boolean,
  inventory_sync_requested boolean not null default false,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists vault_shopify_catalogue_sync_runs_started_idx
  on public.vault_shopify_catalogue_sync_runs (sync_started_at desc);

create unique index if not exists vault_shopify_catalogue_one_active_sync_idx
  on public.vault_shopify_catalogue_sync_runs (sync_status)
  where sync_status = 'syncing';

revoke all on public.vault_shopify_catalogue_sync_runs from anon, authenticated;

-- Current style and owned-stock intelligence excludes source-tombstoned variants.
create or replace view public.vault_variant_inventory_normalized as
select
  p.id as product_id, p.title as product_name, p.handle, p.vendor,
  case when p.title ilike '%polo%' then 'polo_6_piece' else 'tee_5_piece' end as pack_profile,
  case when p.title ilike '%polo%' then 6 else 5 end as pack_size,
  coalesce(nullif(trim(v.option_1), ''), 'Default') as colour_design,
  v.id as variant_id, v.title as variant_title, v.option_2 as size_raw,
  case
    when upper(trim(v.option_2)) in ('S', 'SMALL') then 'S'
    when upper(trim(v.option_2)) in ('M', 'MEDIUM') then 'M'
    when upper(trim(v.option_2)) in ('L', 'LARGE') then 'L'
    when upper(trim(v.option_2)) in ('XL', 'X-LARGE', 'EXTRA LARGE') then 'XL'
    when upper(trim(v.option_2)) in ('2XL', 'XXL', '2X', 'XX-LARGE', 'EXTRA EXTRA LARGE') then 'XXL'
    when upper(trim(v.option_2)) in ('3XL', 'XXXL', '3X', 'XXX-LARGE', 'EXTRA EXTRA EXTRA LARGE') then 'XXXL'
    else upper(trim(v.option_2))
  end as normalized_size,
  coalesce(sum(i.available_quantity), 0)::integer as available_quantity,
  coalesce(sum(i.committed_quantity), 0)::integer as committed_quantity,
  coalesce(sum(i.incoming_quantity), 0)::integer as incoming_quantity,
  max(i.synced_at) as last_inventory_sync
from public.vault_products p
join public.vault_variants v on v.product_id = p.id
left join public.vault_inventory_levels i on i.variant_id = v.id
where p.source = 'shopify'
  and v.source_active = true
  and upper(coalesce(p.status, '')) = 'ACTIVE'
  and not (v.option_2 is null and upper(trim(v.option_1)) ~ '^[0-9]+(\.[0-9]+)?$')
group by p.id, p.title, p.handle, p.vendor, v.id, v.title, v.option_1, v.option_2;

do $do$
declare
  service_role_jwt text;
  existing_job_id bigint;
begin
  select decrypted_secret into service_role_jwt
  from vault.decrypted_secrets
  where name = 'vault_shopify_order_sync_service_role_jwt'
  order by created_at desc limit 1;

  if service_role_jwt is null or btrim(service_role_jwt) = '' then
    raise exception 'Shopify catalogue sync schedule requires a service-role JWT in Supabase Vault';
  end if;

  for existing_job_id in select jobid from cron.job
    where jobname in ('vault-shopify-inventory-sync', 'vault-shopify-catalogue-sync')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'vault-shopify-catalogue-sync',
    '*/10 * * * *',
    $cron$
      with service_role_credential as (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'vault_shopify_order_sync_service_role_jwt'
        order by created_at desc limit 1
      )
      select net.http_post(
        url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || decrypted_secret,
          'apikey', decrypted_secret,
          'Content-Type', 'application/json'
        ),
        body := '{"runInventoryAfterCatalogue":true}'::jsonb
      ) from service_role_credential;
    $cron$
  );
end
$do$;

notify pgrst, 'reload schema';
