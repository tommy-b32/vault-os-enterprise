-- REPLAY-ONLY: inert placeholders required by historical schedule validation.
-- Cron execution is disabled at the server level for this isolated runtime.
select vault.create_secret(
  'replay-inert-service-role-jwt',
  'vault_shopify_order_sync_service_role_jwt',
  'Isolated baseline replay inert placeholder'
);

select vault.create_secret(
  'replay-inert-order-sync-secret',
  'vault_order_sync_secret',
  'Isolated baseline replay inert placeholder'
);
