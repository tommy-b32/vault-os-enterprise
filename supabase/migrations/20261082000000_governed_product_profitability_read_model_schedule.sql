-- Source invalidation triggers mark the governed Product Performance projection
-- stale. This scheduler restores it asynchronously; Product Performance remains
-- fail-closed while the state is stale, refreshing, or failed. The refresh path
-- already owns advisory locking that prevents overlapping unsafe rebuilds.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.refresh_vault_product_profitability_read_model_if_needed()
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_state text;
begin
  select state
    into v_state
  from public.vault_shopify_verified_product_profitability_read_model_state
  where singleton;

  if not found then
    raise exception
      'Product profitability read-model singleton state is missing';
  end if;

  if v_state in ('stale', 'failed') then
    perform public.refresh_vault_shopify_verified_product_profitability_read_model();
  end if;
end;
$$;

comment on function public.refresh_vault_product_profitability_read_model_if_needed() is
  'Cron wrapper for governed Product Performance. Invalidation triggers mark the projection stale; cron restores it asynchronously. Product Performance remains fail-closed while stale, refreshing, or failed, and the refresh function advisory lock prevents overlapping unsafe rebuilds.';

revoke all
  on function public.refresh_vault_product_profitability_read_model_if_needed()
  from public, anon, authenticated;

grant execute
  on function public.refresh_vault_product_profitability_read_model_if_needed()
  to service_role;

do $do$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'vault-product-profitability-read-model-refresh'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$do$;

select cron.schedule(
  'vault-product-profitability-read-model-refresh',
  '*/5 * * * *',
  $cron$
    select public.refresh_vault_product_profitability_read_model_if_needed();
  $cron$
);

notify pgrst, 'reload schema';
