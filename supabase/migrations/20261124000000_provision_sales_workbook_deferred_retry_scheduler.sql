-- The original scheduler migration was intentionally not applied to production.
-- Provision it only after the authenticated relay and web retry endpoint exist.
-- Validate every required Vault value before replacing any same-named schedule.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $do$
declare
  retry_base_url text;
  service_jwt text;
  sync_secret text;
  job_id bigint;
begin
  select decrypted_secret into retry_base_url
    from vault.decrypted_secrets
    where name = 'vault_sales_workbook_deferred_retry_base_url'
    order by created_at desc
    limit 1;
  select decrypted_secret into service_jwt
    from vault.decrypted_secrets
    where name = 'vault_shopify_order_sync_service_role_jwt'
    order by created_at desc
    limit 1;
  select decrypted_secret into sync_secret
    from vault.decrypted_secrets
    where name = 'vault_order_sync_secret'
    order by created_at desc
    limit 1;

  if retry_base_url is null
    or retry_base_url !~ '^https://[a-z0-9.-]+$'
    or service_jwt is null
    or length(service_jwt) = 0
    or sync_secret is null
    or length(sync_secret) = 0 then
    raise exception 'sales workbook deferred retry cron configuration is unavailable';
  end if;

  -- There can be at most one producer for the bounded retry worker.
  -- This runs only after validation, so a configuration error preserves an
  -- existing working job rather than disabling retries.
  for job_id in select jobid from cron.job where jobname = 'vault-sales-workbook-deferred-retry'
  loop
    perform cron.unschedule(job_id);
  end loop;

  perform cron.schedule(
    'vault-sales-workbook-deferred-retry',
    '*/15 * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'vault_sales_workbook_deferred_retry_base_url' order by created_at desc limit 1)
          || '/functions/v1/sales-workbook-deferred-retry',
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
end $do$;
