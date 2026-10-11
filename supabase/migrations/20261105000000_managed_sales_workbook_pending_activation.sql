-- Automatic workbook projection keeps its immutable candidate if activation
-- cannot be verified. Existing operator writes continue using the original
-- atomic record_sales_workbook_version path.
alter table public.vault_sales_workbook_versions
  add column if not exists activation_status text not null default 'active'
    check (activation_status in ('pending', 'active'));

alter table public.vault_sales_workbook_audit_events
  drop constraint if exists vault_sales_workbook_audit_events_event_type_check,
  add constraint vault_sales_workbook_audit_events_event_type_check
    check (event_type in (
      'upload', 'replace', 'download', 'validation_failed', 'conflict',
      'backfill_ready_sales_orders', 'repair_governed_tracking',
      'pending_ready_sales_workbook_version', 'activate_ready_sales_workbook_version'
    ));

create unique index if not exists vault_sales_workbook_one_pending_version_idx
  on public.vault_sales_workbook_versions (workbook_id)
  where activation_status = 'pending';

create or replace function public.record_sales_workbook_pending_version(payload jsonb)
returns public.vault_sales_workbook_versions
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  w public.vault_sales_workbooks;
  existing_pending public.vault_sales_workbook_versions;
  created public.vault_sales_workbook_versions;
  p text := payload ->> 'storage_path';
  h text := payload ->> 'content_hash';
  f text := payload ->> 'filename';
  op uuid := nullif(payload ->> 'operator_id', '')::uuid;
  expected_v integer := nullif(payload ->> 'expected_version', '')::integer;
  expected_h text := nullif(payload ->> 'expected_checksum', '');
begin
  if jsonb_typeof(payload) <> 'object'
    or p !~ E'^sales-workbook/versions/[0-9a-f-]{36}/[1-9][0-9]*-[0-9a-f]{64}\\.xlsx$'
    or h !~ '^[0-9a-f]{64}$' or nullif(btrim(f), '') is null or op is null then
    raise exception 'invalid pending workbook payload';
  end if;
  select * into w from public.vault_sales_workbooks where singleton = true for update;
  if not found or expected_v is distinct from w.current_version or expected_h is distinct from w.content_hash then
    raise exception 'workbook conflict';
  end if;
  select * into existing_pending from public.vault_sales_workbook_versions
  where workbook_id = w.id and activation_status = 'pending' for update;
  if found then
    if existing_pending.storage_path <> p or existing_pending.content_hash <> h then raise exception 'workbook pending activation conflict'; end if;
    return existing_pending;
  end if;
  if p !~ (E'^sales-workbook/versions/' || w.id::text || '/' || (w.current_version + 1)::text || '-' || h || E'\\.xlsx$') then
    raise exception 'invalid pending workbook identity';
  end if;
  insert into public.vault_sales_workbook_versions (
    workbook_id, version, storage_path, content_hash, filename, uploaded_by_operator_id, predecessor_version, activation_status
  ) values (w.id, w.current_version + 1, p, h, f, op, w.current_version, 'pending') returning * into created;
  insert into public.vault_sales_workbook_audit_events (workbook_id, version, event_type, operator_id, metadata)
  values (w.id, created.version, 'pending_ready_sales_workbook_version', op, jsonb_build_object('content_hash', h, 'predecessor_version', w.current_version));
  return created;
end;
$$;

create or replace function public.activate_sales_workbook_pending_version(payload jsonb)
returns public.vault_sales_workbooks
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  w public.vault_sales_workbooks;
  candidate public.vault_sales_workbook_versions;
  target_version integer := nullif(payload ->> 'version', '')::integer;
  expected_v integer := nullif(payload ->> 'expected_version', '')::integer;
  expected_h text := nullif(payload ->> 'expected_checksum', '');
  h text := payload ->> 'content_hash';
  op uuid := nullif(payload ->> 'operator_id', '')::uuid;
begin
  if jsonb_typeof(payload) <> 'object' or target_version is null or op is null or h !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid workbook activation payload';
  end if;
  select * into w from public.vault_sales_workbooks where singleton = true for update;
  if not found or expected_v is distinct from w.current_version or expected_h is distinct from w.content_hash then
    raise exception 'workbook conflict';
  end if;
  select * into candidate from public.vault_sales_workbook_versions
  where workbook_id = w.id and version = target_version for update;
  if not found or candidate.activation_status <> 'pending' or candidate.version <> w.current_version + 1 or candidate.predecessor_version <> w.current_version or candidate.content_hash <> h then
    raise exception 'workbook activation conflict';
  end if;
  update public.vault_sales_workbooks
  set current_storage_path = candidate.storage_path, current_version = candidate.version,
      content_hash = candidate.content_hash, last_modified_at = now(), uploaded_by_operator_id = op
  where id = w.id returning * into w;
  update public.vault_sales_workbook_versions set activation_status = 'active'
  where id = candidate.id;
  insert into public.vault_sales_workbook_audit_events (workbook_id, version, event_type, operator_id, metadata)
  values (w.id, candidate.version, 'activate_ready_sales_workbook_version', op, jsonb_build_object('content_hash', candidate.content_hash, 'predecessor_version', candidate.predecessor_version));
  return w;
end;
$$;

revoke all on function public.record_sales_workbook_pending_version(jsonb), public.activate_sales_workbook_pending_version(jsonb) from public, anon, authenticated;
grant execute on function public.record_sales_workbook_pending_version(jsonb), public.activate_sales_workbook_pending_version(jsonb) to service_role;
notify pgrst, 'reload schema';
