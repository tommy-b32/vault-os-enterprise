begin;

alter table public.vault_historical_delivery_cost_batches
  drop constraint vault_historical_delivery_cost_batches_check1;

alter table public.vault_historical_delivery_cost_batches
  add constraint vault_historical_delivery_received_date_workflow_check
  check (
    received_at is null
    or received_at::date >= supplier_order_date
    or (
      validation_status = 'REVIEW'
      and approval_status <> 'APPROVED'
    )
    or (
      exception_approved
      and nullif(trim(exception_reason), '') is not null
    )
  );

commit;
