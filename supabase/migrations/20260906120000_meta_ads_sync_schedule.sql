select cron.schedule(
  'vault-meta-ads-refresh',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/meta-ads-sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_order_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_shopify_order_sync_service_role_jwt'
          order by created_at desc
          limit 1
        ),
        'x-vault-sync-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'vault_order_sync_secret'
          order by created_at desc
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cron$
)
where not exists (
  select 1
  from cron.job
  where jobname = 'vault-meta-ads-refresh'
);
