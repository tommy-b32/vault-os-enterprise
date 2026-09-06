-- Payment-fee ingestion can exceed the existing thirty-second pg_net request limit.
-- Change only job 9's HTTP timeout; cron.alter_job preserves its existing schedule.
do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobid = 9
      and jobname = 'vault-shopify-analytics-refresh'
  ) then
    raise exception 'Expected cron job 9 (vault-shopify-analytics-refresh) is unavailable';
  end if;
end;
$$;

select cron.alter_job(
  job_id := 9,
  command := $cron$
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-analytics-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
        'x-vault-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_order_sync_secret' order by created_at desc limit 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cron$
);
