-- Repair the canonical Shopify inventory synchronisation schedule.
--
-- The original schedule expected an inventory-specific Vault secret that was
-- not part of the production secret-provisioning contract. Reuse the existing,
-- proven service-role JWT used by the canonical Shopify order reconciliation
-- job instead of maintaining a second copy of the same credential.

do $do$
declare
  service_role_jwt text;
  existing_job_id bigint;
begin
  select decrypted_secret
  into service_role_jwt
  from vault.decrypted_secrets
  where name = 'vault_shopify_order_sync_service_role_jwt'
  order by created_at desc
  limit 1;

  if service_role_jwt is null or btrim(service_role_jwt) = '' then
    raise exception
      'Shopify inventory sync schedule requires a service-role JWT in Supabase Vault';
  end if;

  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'vault-shopify-inventory-sync'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'vault-shopify-inventory-sync',
    '*/10 * * * *',
    $cron$
      with service_role_credential as (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'vault_shopify_order_sync_service_role_jwt'
        order by created_at desc
        limit 1
      )
      select net.http_post(
        url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-inventory-sync',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || decrypted_secret,
          'apikey', decrypted_secret,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
      from service_role_credential;
    $cron$
  );
end
$do$;
