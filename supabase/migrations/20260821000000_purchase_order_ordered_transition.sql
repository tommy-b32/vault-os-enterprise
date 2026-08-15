alter table public.vault_purchase_orders
  add column if not exists ordered_by_operator_id uuid null
    references public.vault_operators(id)
    on delete restrict;

create index if not exists
  vault_purchase_orders_ordered_by_operator_idx
on public.vault_purchase_orders(ordered_by_operator_id)
where ordered_by_operator_id is not null;

comment on column public.vault_purchase_orders.ordered_by_operator_id is
  'Active Vault OS operator who confirmed the approved purchase order was placed with the supplier.';
