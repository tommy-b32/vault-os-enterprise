begin;

revoke all privileges on table public.vault_purchase_order_governed_liability from public,anon,authenticated,service_role;
grant select on table public.vault_purchase_order_governed_liability to service_role;

commit;
