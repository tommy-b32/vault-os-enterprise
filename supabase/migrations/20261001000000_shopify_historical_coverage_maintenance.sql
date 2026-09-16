-- Daily maintenance advances successful historical created-at proof only far
-- enough to overlap the rolling seven-day bounded reconciliation by two days.
begin;

create or replace function public.get_shopify_historical_maintenance_window(target_at timestamptz default now())
returns table(created_from timestamptz, created_before timestamptz)
language sql stable security definer set search_path = public as $$
  with policy as (select interval '5 days' as historical_lag, interval '7 days' as maximum_window),
  frontier as (
    select max(created_before) as covered_through
    from vault_shopify_order_sync_runs
    where sync_mode = 'historical_orders_by_created_at'
      and created_from is not null and created_before is not null
  )
  select f.covered_through,
    least(f.covered_through + p.maximum_window, target_at - p.historical_lag)
  from frontier f cross join policy p
  where f.covered_through is not null and f.covered_through < target_at - p.historical_lag;
$$;

revoke all on function public.get_shopify_historical_maintenance_window(timestamptz) from public, anon, authenticated;
grant execute on function public.get_shopify_historical_maintenance_window(timestamptz) to service_role;

do $do$
declare existing_job_id bigint;
begin
  for existing_job_id in select jobid from cron.job where jobname = 'vault-shopify-historical-coverage-maintenance' loop
    perform cron.unschedule(existing_job_id);
  end loop;
  perform cron.schedule(
    'vault-shopify-historical-coverage-maintenance', '17 2 * * *',
    $cron$
      select net.http_post(
        url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
          'x-vault-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_order_sync_secret' order by created_at desc limit 1),
          'Content-Type', 'application/json'
        ), body := '{"mode":"historical_maintenance"}'::jsonb
      );
    $cron$
  );
end $do$;
commit;
