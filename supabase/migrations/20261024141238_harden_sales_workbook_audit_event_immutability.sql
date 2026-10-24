-- Sales Workbook audit events are append-only operational evidence. Keep the
-- existing event allow-list, RLS and INSERT/SELECT access unchanged.
create or replace function public.reject_sales_workbook_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'sales workbook audit events are immutable';
end;
$$;

revoke update, delete on public.vault_sales_workbook_audit_events from service_role;
grant select, insert on public.vault_sales_workbook_audit_events to service_role;

drop trigger if exists vault_sales_workbook_audit_events_immutable on public.vault_sales_workbook_audit_events;
create trigger vault_sales_workbook_audit_events_immutable
before update or delete on public.vault_sales_workbook_audit_events
for each row execute function public.reject_sales_workbook_audit_event_mutation();
