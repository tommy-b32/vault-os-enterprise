-- Backfill audit evidence is file-management metadata only. It does not make
-- workbook values canonical Vault OS financial data or Vault Brain input.

alter table public.vault_sales_workbook_audit_events
  drop constraint if exists vault_sales_workbook_audit_events_event_type_check,
  add constraint vault_sales_workbook_audit_events_event_type_check
    check (event_type in (
      'upload',
      'replace',
      'download',
      'validation_failed',
      'conflict',
      'backfill_ready_sales_orders'
    ));

create or replace function public.record_sales_workbook_version(payload jsonb)
returns public.vault_sales_workbooks
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  w public.vault_sales_workbooks;
  v integer;
  e text;
  p text;
  h text;
  f text;
  op uuid;
  expected_v integer;
  expected_h text;
  prior integer;
  audit_payload jsonb;
  audit_metadata jsonb;
  source_v integer;
  new_v integer;
  range_start integer;
  range_end integer;
begin
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid workbook payload';
  end if;

  p := payload ->> 'storage_path';
  h := payload ->> 'content_hash';
  f := payload ->> 'filename';
  expected_h := nullif(payload ->> 'expected_checksum', '');

  if (payload ->> 'operator_id') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or (payload ->> 'workbook_id') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or p !~ '^sales-workbook/versions/[0-9a-f-]{36}/[1-9][0-9]*-[0-9a-f]{64}\\.xlsx$'
    or h !~ '^[0-9a-f]{64}$'
    or nullif(btrim(f), '') is null
    or length(f) > 255
    or (expected_h is not null and expected_h !~ '^[0-9a-f]{64}$')
    or (payload ? 'expected_version' and nullif(payload ->> 'expected_version', '') is not null
      and (payload ->> 'expected_version') !~ '^[1-9][0-9]{0,8}$') then
    raise exception 'invalid workbook payload';
  end if;

  op := (payload ->> 'operator_id')::uuid;
  expected_v := nullif(payload ->> 'expected_version', '')::integer;

  if payload ? 'backfill_audit_metadata' then
    audit_payload := payload -> 'backfill_audit_metadata';
    if payload ->> 'audit_event_type' <> 'backfill_ready_sales_orders'
      or jsonb_typeof(audit_payload) <> 'object'
      or (select count(*) from jsonb_object_keys(audit_payload)) <> 7
      or exists (
        select 1
        from jsonb_object_keys(audit_payload) as key
        where key not in (
          'sourceWorkbookVersion',
          'newWorkbookVersion',
          'ordersWritten',
          'rowsWritten',
          'skippedExistingOrders',
          'skippedReviewOrders',
          'targetOrderRange'
        )
      )
      or jsonb_typeof(audit_payload -> 'sourceWorkbookVersion') <> 'number'
      or jsonb_typeof(audit_payload -> 'newWorkbookVersion') <> 'number'
      or jsonb_typeof(audit_payload -> 'ordersWritten') <> 'number'
      or jsonb_typeof(audit_payload -> 'rowsWritten') <> 'number'
      or jsonb_typeof(audit_payload -> 'skippedExistingOrders') <> 'number'
      or jsonb_typeof(audit_payload -> 'skippedReviewOrders') <> 'number'
      or jsonb_typeof(audit_payload -> 'targetOrderRange') <> 'string'
      or (audit_payload ->> 'sourceWorkbookVersion') !~ '^[1-9][0-9]{0,8}$'
      or (audit_payload ->> 'newWorkbookVersion') !~ '^[1-9][0-9]{0,8}$'
      or (audit_payload ->> 'ordersWritten') !~ '^(0|[1-9][0-9]{0,8})$'
      or (audit_payload ->> 'rowsWritten') !~ '^(0|[1-9][0-9]{0,8})$'
      or (audit_payload ->> 'skippedExistingOrders') !~ '^(0|[1-9][0-9]{0,8})$'
      or (audit_payload ->> 'skippedReviewOrders') !~ '^(0|[1-9][0-9]{0,8})$'
      or (audit_payload ->> 'targetOrderRange') !~ '^[1-9][0-9]{0,8}-[1-9][0-9]{0,8}$' then
      raise exception 'invalid backfill audit metadata';
    end if;

    source_v := (audit_payload ->> 'sourceWorkbookVersion')::integer;
    new_v := (audit_payload ->> 'newWorkbookVersion')::integer;
    range_start := split_part(audit_payload ->> 'targetOrderRange', '-', 1)::integer;
    range_end := split_part(audit_payload ->> 'targetOrderRange', '-', 2)::integer;
    if range_start > range_end then
      raise exception 'invalid backfill audit metadata';
    end if;
  elsif payload ? 'audit_event_type' then
    raise exception 'invalid workbook payload';
  end if;

  select * into w
  from public.vault_sales_workbooks
  where singleton = true
  for update;

  if not found then
    if expected_v is not null or expected_h is not null or audit_payload is not null then
      raise exception 'workbook conflict';
    end if;
    if p !~ ('^sales-workbook/versions/' || (payload ->> 'workbook_id') || '/1-' || h || '\\.xlsx$') then
      raise exception 'invalid initial workbook identity';
    end if;
    insert into public.vault_sales_workbooks (
      id, filename, storage_bucket, current_storage_path, current_version,
      content_hash, last_sync_status, uploaded_by_operator_id, singleton
    ) values (
      (payload ->> 'workbook_id')::uuid, f, 'vault-documents', p, 1,
      h, 'never', op, true
    ) returning * into w;
    v := 1;
    prior := null;
    e := 'upload';
  else
    if expected_v is distinct from w.current_version
      or expected_h is distinct from w.content_hash then
      raise exception 'workbook conflict';
    end if;
    v := w.current_version + 1;
    prior := w.current_version;
    if payload ->> 'workbook_id' <> w.id::text
      or p !~ ('^sales-workbook/versions/' || w.id::text || '/' || v::text || '-' || h || '\\.xlsx$') then
      raise exception 'invalid replacement workbook identity';
    end if;
    if audit_payload is not null then
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
    end if;
    update public.vault_sales_workbooks
    set filename = f,
        current_storage_path = p,
        current_version = v,
        content_hash = h,
        last_modified_at = now(),
        uploaded_by_operator_id = op
    where id = w.id
    returning * into w;
  end if;

  insert into public.vault_sales_workbook_versions (
    workbook_id, version, storage_path, content_hash, filename,
    uploaded_by_operator_id, predecessor_version
  ) values (w.id, v, p, h, f, op, prior);

  if audit_metadata is null then
    audit_metadata := jsonb_build_object(
      'filename', f,
      'storage_path', p,
      'content_hash', h,
      'version', v,
      'predecessor_version', prior
    );
  end if;

  insert into public.vault_sales_workbook_audit_events (
    workbook_id, version, event_type, operator_id, metadata
  ) values (w.id, v, e, op, audit_metadata);

  return w;
end;
$$;

comment on function public.record_sales_workbook_version(jsonb) is
  'Atomically records immutable Sales Workbook versions and bounded file-management audit metadata only.';

revoke all on function public.record_sales_workbook_version(jsonb) from public, anon, authenticated;
grant execute on function public.record_sales_workbook_version(jsonb) to service_role;

notify pgrst, 'reload schema';
