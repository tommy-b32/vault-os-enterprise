begin;

revoke all privileges on table public.vault_purchase_order_gbp_landed_cost_allocation_runs from public,anon,authenticated,service_role;
grant select,insert on table public.vault_purchase_order_gbp_landed_cost_allocation_runs to service_role;
grant update(id) on table public.vault_purchase_order_gbp_landed_cost_allocation_runs to service_role;

revoke all privileges on table public.vault_purchase_order_gbp_landed_cost_allocation_lines from public,anon,authenticated,service_role;
grant select,insert on table public.vault_purchase_order_gbp_landed_cost_allocation_lines to service_role;

revoke all privileges on table public.vault_purchase_order_current_gbp_landed_cost_allocation_runs from public,anon,authenticated,service_role;
grant select on table public.vault_purchase_order_current_gbp_landed_cost_allocation_runs to service_role;
grant update(id) on table public.vault_purchase_order_current_gbp_landed_cost_allocation_runs to service_role;

revoke all on function public.capture_purchase_order_gbp_landed_cost_allocation(jsonb) from public,anon,authenticated;
grant execute on function public.capture_purchase_order_gbp_landed_cost_allocation(jsonb) to service_role;

notify pgrst,'reload schema';
commit;
