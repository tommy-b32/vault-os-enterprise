alter table public.vault_purchase_orders
  add column if not exists approved_by_operator_id uuid null
    references public.vault_operators(id)
    on delete restrict;

create index if not exists
  vault_purchase_orders_approved_by_operator_idx
on public.vault_purchase_orders(approved_by_operator_id)
where approved_by_operator_id is not null;

comment on column public.vault_purchase_orders.approved_by_operator_id is
  'Active Vault OS operator who performed the durable draft-to-approved transition.';
