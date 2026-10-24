-- Automatic workbook outcomes are immutable operational audit facts emitted by
-- the governed order-ready and deferred-retry handlers. This changes only the
-- existing event allow-list; table ownership, RLS, grants and all audit
-- mutation safeguards remain untouched.
alter table public.vault_sales_workbook_audit_events
  drop constraint if exists vault_sales_workbook_audit_events_event_type_check,
  add constraint vault_sales_workbook_audit_events_event_type_check
    check (event_type in (
      'upload', 'replace', 'download', 'validation_failed', 'conflict',
      'backfill_ready_sales_orders', 'repair_governed_tracking',
      'pending_ready_sales_workbook_version', 'activate_ready_sales_workbook_version',
      'multi_field_correction', 'automatic_sync_outcome'
    ));

notify pgrst, 'reload schema';
