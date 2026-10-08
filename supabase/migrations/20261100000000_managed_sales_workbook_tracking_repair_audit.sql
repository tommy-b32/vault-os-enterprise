-- Add an immutable, governed tracking-repair audit event without broadening any
-- existing workbook promotion or audit contract.
alter table public.vault_sales_workbook_audit_events
  drop constraint if exists vault_sales_workbook_audit_events_event_type_check,
  add constraint vault_sales_workbook_audit_events_event_type_check
    check (event_type in (
      'upload', 'replace', 'download', 'validation_failed', 'conflict',
      'backfill_ready_sales_orders', 'repair_governed_tracking'
    ));

do $migration$
declare
  definition text;
  amended text;
  old_declaration text := $old$  audit_metadata jsonb;
  source_v integer;$old$;
  new_declaration text := $new$  audit_metadata jsonb;
  tracking_audit_payload jsonb;
  source_v integer;$new$;
  old_validation text := $old$  if payload ? 'backfill_audit_metadata' then
    audit_payload := payload -> 'backfill_audit_metadata';$old$;
  new_validation text := $new$  if payload ? 'backfill_audit_metadata' and payload ? 'tracking_repair_audit_metadata' then
    raise exception 'invalid workbook payload';
  elsif payload ? 'backfill_audit_metadata' then
    audit_payload := payload -> 'backfill_audit_metadata';$new$;
  old_elsif text := $old$  elsif payload ? 'audit_event_type' then
    raise exception 'invalid workbook payload';
  end if;$old$;
  new_elsif text := $new$  elsif payload ? 'tracking_repair_audit_metadata' then
    tracking_audit_payload := payload -> 'tracking_repair_audit_metadata';
    if payload ->> 'audit_event_type' <> 'repair_governed_tracking'
      or jsonb_typeof(tracking_audit_payload) <> 'object'
      or (select count(*) from jsonb_object_keys(tracking_audit_payload)) <> 8
      or exists (select 1 from jsonb_object_keys(tracking_audit_payload) as key where key not in (
        'sourceWorkbookVersion', 'newWorkbookVersion', 'ordersUpdated', 'rowsUpdated',
        'skippedNoTracking', 'skippedAmbiguousTracking', 'skippedConflictTracking', 'source'
      ))
      or jsonb_typeof(tracking_audit_payload -> 'sourceWorkbookVersion') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'newWorkbookVersion') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'ordersUpdated') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'rowsUpdated') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'skippedNoTracking') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'skippedAmbiguousTracking') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'skippedConflictTracking') <> 'number'
      or jsonb_typeof(tracking_audit_payload -> 'source') <> 'string'
      or (tracking_audit_payload ->> 'sourceWorkbookVersion') !~ '^[1-9][0-9]{0,8}$'
      or (tracking_audit_payload ->> 'newWorkbookVersion') !~ '^[1-9][0-9]{0,8}$'
      or (tracking_audit_payload ->> 'ordersUpdated') !~ '^(0|[1-9][0-9]{0,8})$'
      or (tracking_audit_payload ->> 'rowsUpdated') !~ '^(0|[1-9][0-9]{0,8})$'
      or (tracking_audit_payload ->> 'skippedNoTracking') !~ '^(0|[1-9][0-9]{0,8})$'
      or (tracking_audit_payload ->> 'skippedAmbiguousTracking') !~ '^(0|[1-9][0-9]{0,8})$'
      or (tracking_audit_payload ->> 'skippedConflictTracking') !~ '^(0|[1-9][0-9]{0,8})$'
      or tracking_audit_payload ->> 'source' <> 'governed_shopify_fulfillment_tracking' then
      raise exception 'invalid tracking repair audit metadata';
    end if;
    source_v := (tracking_audit_payload ->> 'sourceWorkbookVersion')::integer;
    new_v := (tracking_audit_payload ->> 'newWorkbookVersion')::integer;
    if new_v <= source_v then
      raise exception 'invalid tracking repair audit metadata';
    end if;
  elsif payload ? 'audit_event_type' then
    raise exception 'invalid workbook payload';
  end if;$new$;
  old_event text := $old$    if audit_payload is not null then
      if source_v <> prior or new_v <> v then
        raise exception 'invalid backfill audit metadata';
      end if;
      e := 'backfill_ready_sales_orders';
      audit_metadata := jsonb_build_object(
        'sourceWorkbookVersion', source_v,
        'newWorkbookVersion', new_v,
        'ordersWritten', (audit_payload ->> 'ordersWritten')::integer,
        'rowsWritten', (audit_payload ->> 'rowsWritten')::integer,
        'skippedExistingOrders', (audit_payload ->> 'skippedExistingOrders')::integer,
        'skippedReviewOrders', (audit_payload ->> 'skippedReviewOrders')::integer,
        'targetOrderRange', audit_payload ->> 'targetOrderRange'
      );
    else
      e := 'replace';
    end if;$old$;
  new_event text := $new$    if audit_payload is not null then
      if source_v <> prior or new_v <> v then
        raise exception 'invalid backfill audit metadata';
      end if;
      e := 'backfill_ready_sales_orders';
      audit_metadata := jsonb_build_object(
        'sourceWorkbookVersion', source_v,
        'newWorkbookVersion', new_v,
        'ordersWritten', (audit_payload ->> 'ordersWritten')::integer,
        'rowsWritten', (audit_payload ->> 'rowsWritten')::integer,
        'skippedExistingOrders', (audit_payload ->> 'skippedExistingOrders')::integer,
        'skippedReviewOrders', (audit_payload ->> 'skippedReviewOrders')::integer,
        'targetOrderRange', audit_payload ->> 'targetOrderRange'
      );
    elsif tracking_audit_payload is not null then
      if source_v <> prior or new_v <> v then
        raise exception 'invalid tracking repair audit metadata';
      end if;
      e := 'repair_governed_tracking';
      audit_metadata := jsonb_build_object(
        'sourceWorkbookVersion', source_v,
        'newWorkbookVersion', new_v,
        'ordersUpdated', (tracking_audit_payload ->> 'ordersUpdated')::integer,
        'rowsUpdated', (tracking_audit_payload ->> 'rowsUpdated')::integer,
        'skippedNoTracking', (tracking_audit_payload ->> 'skippedNoTracking')::integer,
        'skippedAmbiguousTracking', (tracking_audit_payload ->> 'skippedAmbiguousTracking')::integer,
        'skippedConflictTracking', (tracking_audit_payload ->> 'skippedConflictTracking')::integer,
        'source', tracking_audit_payload ->> 'source'
      );
    else
      e := 'replace';
    end if;$new$;
  old_initial_audit_guard text := $old$    if expected_v is not null or expected_h is not null or audit_payload is not null then$old$;
  new_initial_audit_guard text := $new$    if expected_v is not null or expected_h is not null or audit_payload is not null or tracking_audit_payload is not null then$new$;
begin
  select pg_get_functiondef('public.record_sales_workbook_version(jsonb)'::regprocedure) into definition;
  if position(old_declaration in definition) = 0
    or position(old_validation in definition) = 0
    or position(old_elsif in definition) = 0
    or position(old_event in definition) = 0
    or position(old_initial_audit_guard in definition) = 0 then
    raise exception 'Unexpected record_sales_workbook_version definition';
  end if;
  amended := replace(definition, old_declaration, new_declaration);
  amended := replace(amended, old_validation, new_validation);
  amended := replace(amended, old_elsif, new_elsif);
  amended := replace(amended, old_event, new_event);
  amended := replace(amended, old_initial_audit_guard, new_initial_audit_guard);
  execute amended;
end;
$migration$;

revoke all on function public.record_sales_workbook_version(jsonb) from public, anon, authenticated;
grant execute on function public.record_sales_workbook_version(jsonb) to service_role;

notify pgrst, 'reload schema';
