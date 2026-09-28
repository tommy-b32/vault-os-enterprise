begin;

-- The draft-only quantity correction RPC is SECURITY INVOKER and needs to
-- lock and update only these bounded fields on the canonical line evidence.
grant update (pack_count, merchandise_line_total, source_snapshot)
on table public.vault_purchase_order_line_merchandise_cost_evidence
to service_role;

commit;
