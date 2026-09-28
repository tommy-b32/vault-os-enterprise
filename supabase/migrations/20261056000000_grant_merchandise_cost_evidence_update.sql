-- Grant the service role the write privilege required by the governed
-- merchandise-only pending catalogue intake RPC.
grant update
on table public.vault_supplier_product_type_merchandise_cost_evidence
to service_role;
