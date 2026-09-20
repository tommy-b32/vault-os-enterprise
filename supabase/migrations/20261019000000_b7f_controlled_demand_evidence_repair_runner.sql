-- B7F demand-evidence repair only. This does not initialise, invoke, or alter the completed historical runner.
create table public.vault_b7f_demand_evidence_repair_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique check (job_key = 'b7f-2026-demand-evidence-repair'),
  from_boundary timestamptz not null check (from_boundary = '2026-04-30T00:00:00.000Z'::timestamptz),
  through_boundary timestamptz not null check (through_boundary = '2026-09-03T00:00:00.000Z'::timestamptz),
  window_hours integer not null check (window_hours = 168),
  status text not null check (status in ('ready', 'running', 'complete', 'failed')),
  next_window_start timestamptz not null,
  active_window_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  check (from_boundary < through_boundary),
  check (next_window_start >= from_boundary and next_window_start <= through_boundary)
);

create table public.vault_b7f_demand_evidence_repair_windows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.vault_b7f_demand_evidence_repair_jobs(id) on delete restrict,
  created_from timestamptz not null,
  created_before timestamptz not null,
  state text not null check (state in ('pending', 'submitted', 'uncertain', 'completed', 'failed', 'window_too_large')),
  preflight_orders integer not null check (preflight_orders >= 0),
  preflight_expected_lines integer not null check (preflight_expected_lines >= 0),
  preflight_existing_observations integer not null check (preflight_existing_observations >= 0),
  preflight_missing_observations integer not null check (preflight_missing_observations >= 0),
  pg_net_request_id bigint,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz,
  completed_sync_run_id uuid references public.vault_shopify_order_sync_runs(id) on delete restrict,
  receipt_orders_synced integer check (receipt_orders_synced >= 0),
  receipt_order_lines_synced integer check (receipt_order_lines_synced >= 0),
  postflight_expected_lines integer,
  postflight_existing_observations integer,
  postflight_missing_observations integer,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (job_id, created_from, created_before),
  check (created_from < created_before),
  check (state <> 'pending' or (pg_net_request_id is null and submitted_at is null)),
  check (state <> 'submitted' or (pg_net_request_id is not null and submitted_at is not null and attempt_count > 0)),
  check (state not in ('uncertain', 'failed', 'window_too_large') or failure_reason is not null),
  check (state <> 'completed' or (
    completed_at is not null
    and postflight_expected_lines is not null
    and postflight_existing_observations is not null
    and postflight_missing_observations is not null
    and postflight_expected_lines = preflight_expected_lines
    and postflight_existing_observations = postflight_expected_lines
    and postflight_missing_observations = 0
    and ((pg_net_request_id is null and completed_sync_run_id is null and receipt_orders_synced is null and receipt_order_lines_synced is null)
      or (pg_net_request_id is not null and completed_sync_run_id is not null and receipt_orders_synced is not null and receipt_order_lines_synced is not null))
  ))
);
create unique index vault_b7f_demand_evidence_repair_one_active_window
  on public.vault_b7f_demand_evidence_repair_windows(job_id)
  where state in ('pending', 'submitted', 'uncertain');
alter table public.vault_b7f_demand_evidence_repair_jobs
  add constraint vault_b7f_demand_evidence_repair_active_window_fk
  foreign key (active_window_id) references public.vault_b7f_demand_evidence_repair_windows(id) on delete restrict;
create trigger vault_b7f_demand_evidence_repair_jobs_touch before update on public.vault_b7f_demand_evidence_repair_jobs for each row execute function public.b7f_backfill_touch();
create trigger vault_b7f_demand_evidence_repair_windows_touch before update on public.vault_b7f_demand_evidence_repair_windows for each row execute function public.b7f_backfill_touch();

create function public.initialize_b7f_demand_evidence_repair_job()
returns uuid language plpgsql security invoker as $$
declare v_job_id uuid;
begin
  insert into public.vault_b7f_demand_evidence_repair_jobs(job_key, from_boundary, through_boundary, window_hours, status, next_window_start)
  values ('b7f-2026-demand-evidence-repair', '2026-04-30T00:00:00.000Z', '2026-09-03T00:00:00.000Z', 168, 'ready', '2026-04-30T00:00:00.000Z')
  on conflict (job_key) do update set job_key = excluded.job_key
  returning id into v_job_id;
  return v_job_id;
end;
$$;

create procedure public.advance_b7f_demand_evidence_repair_job_safely(
  out action text,
  out repair_job_id uuid,
  out repair_window_id uuid,
  out created_from timestamptz,
  out created_before timestamptz,
  out request_id bigint,
  out detail text
)
language plpgsql
as $$
declare
  repair_job public.vault_b7f_demand_evidence_repair_jobs%rowtype;
  repair_window public.vault_b7f_demand_evidence_repair_windows%rowtype;
  exact_receipt public.vault_shopify_order_sync_runs%rowtype;
  response record;
  window_before timestamptz;
  preflight_orders integer;
  preflight_expected integer;
  preflight_existing integer;
  preflight_missing integer;
  postflight_expected integer;
  postflight_existing integer;
  postflight_missing integer;
  new_request_id bigint;
  http_response_found boolean;
  valid_http_response boolean;
  response_body jsonb;
begin
  -- Must be a top-level CALL. An explicit caller transaction fails before any DML or pg_net allocation.
  commit;
  select * into repair_job from public.vault_b7f_demand_evidence_repair_jobs as rj
  where rj.job_key = 'b7f-2026-demand-evidence-repair' for update;
  if not found then raise exception 'B7F_DEMAND_REPAIR_JOB_NOT_INITIALIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(repair_job.id::text, 7148));

  if repair_job.status = 'complete' then action := 'complete'; repair_job_id := repair_job.id; detail := 'all repair windows verified'; commit; return; end if;
  if repair_job.active_window_id is not null then
    select * into repair_window from public.vault_b7f_demand_evidence_repair_windows as rw where rw.id = repair_job.active_window_id for update;
    if not found then raise exception 'B7F_DEMAND_REPAIR_ACTIVE_WINDOW_MISSING'; end if;
    if repair_window.state = 'uncertain' then action := 'uncertain'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'manual investigation required; automatic replay is forbidden'; commit; return; end if;
    if repair_window.state in ('failed', 'window_too_large') then action := repair_window.state; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := repair_window.failure_reason; commit; return; end if;
    if repair_window.state = 'submitted' then
      select hr.status_code, hr.timed_out, hr.error_msg, hr.content into response from net._http_response as hr where hr.id = repair_window.pg_net_request_id order by hr.created desc limit 1;
      http_response_found := found;
      if http_response_found and (response.timed_out or response.status_code < 200 or response.status_code >= 300 or response.error_msg is not null) then
        update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'failed', failure_reason = coalesce(response.error_msg, response.content, 'pg_net request failed') where rw.id = repair_window.id;
        update public.vault_b7f_demand_evidence_repair_jobs as rj set status = 'failed' where rj.id = repair_job.id;
        action := 'failed'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'pg_net response failed'; commit; return;
      end if;
      valid_http_response := false;
      if http_response_found and response.content is not null and pg_input_is_valid(response.content, 'jsonb') then
        response_body := response.content::jsonb;
        valid_http_response := coalesce(response_body -> 'success' = 'true'::jsonb
          and response_body ->> 'sync_mode' = 'historical_orders_by_created_at'
          and pg_input_is_valid(response_body ->> 'created_from', 'timestamptz')
          and pg_input_is_valid(response_body ->> 'created_before', 'timestamptz')
          and (response_body ->> 'created_from')::timestamptz = repair_window.created_from
          and (response_body ->> 'created_before')::timestamptz = repair_window.created_before, false);
      end if;
      if http_response_found and not valid_http_response then
        update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'uncertain', failure_reason = 'HTTP response is not a valid successful exact historical receipt' where rw.id = repair_window.id;
        action := 'uncertain'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'invalid HTTP application response; automatic replay is forbidden'; commit; return;
      end if;
      select * into exact_receipt from public.vault_shopify_order_sync_runs as sr
      where sr.sync_mode = 'historical_orders_by_created_at' and sr.created_from = repair_window.created_from and sr.created_before = repair_window.created_before and sr.completed_at is not null and sr.started_at >= repair_window.submitted_at
      order by sr.completed_at desc, sr.id desc limit 1;
      if not valid_http_response or not found then
        if repair_window.submitted_at < now() - interval '5 minutes' then
          update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'uncertain', failure_reason = 'valid HTTP response or fresh exact receipt unavailable after grace period' where rw.id = repair_window.id;
          action := 'uncertain'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'required external proof absent; automatic replay is forbidden'; commit; return;
        end if;
        action := 'waiting'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'awaiting valid HTTP response and fresh exact receipt'; commit; return;
      end if;
      select coalesce(count(l.id), 0)::integer, coalesce(count(d.id), 0)::integer, coalesce(count(l.id) filter (where d.id is null), 0)::integer into postflight_expected, postflight_existing, postflight_missing
      from public.vault_shopify_orders as o join public.vault_shopify_order_lines as l on l.order_id = o.id
      left join public.vault_shopify_demand_line_observations as d on d.source = l.source and d.shopify_line_item_id = l.shopify_line_item_id
      where o.source = 'shopify' and o.shopify_created_at >= repair_window.created_from and o.shopify_created_at < repair_window.created_before;
      if postflight_expected is null or postflight_existing is null or postflight_missing is null or postflight_expected <> repair_window.preflight_expected_lines or postflight_existing <> postflight_expected or postflight_missing <> 0 then
        update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'uncertain', postflight_expected_lines = postflight_expected, postflight_existing_observations = postflight_existing, postflight_missing_observations = postflight_missing, failure_reason = 'postflight B7F observation reconciliation differs from preflight or remains incomplete' where rw.id = repair_window.id;
        action := 'uncertain'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'postflight reconciliation mismatch; automatic replay is forbidden'; commit; return;
      end if;
      update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'completed', completed_sync_run_id = exact_receipt.id, receipt_orders_synced = exact_receipt.orders_synced, receipt_order_lines_synced = exact_receipt.order_lines_synced, postflight_expected_lines = postflight_expected, postflight_existing_observations = postflight_existing, postflight_missing_observations = postflight_missing, completed_at = now(), failure_reason = null where rw.id = repair_window.id;
      update public.vault_b7f_demand_evidence_repair_jobs as rj set next_window_start = repair_window.created_before, active_window_id = null, status = case when repair_window.created_before >= rj.through_boundary then 'complete' else 'ready' end, completed_at = case when repair_window.created_before >= rj.through_boundary then now() else null end where rj.id = repair_job.id;
      action := 'attested'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := repair_window.pg_net_request_id; detail := 'successful HTTP response, exact receipt, and zero missing observations attested'; commit; return;
    end if;
    -- Pending was committed before pg_net. A prior crash cannot dispatch it because pg_net dispatches only after commit.
    if repair_window.state <> 'pending' then raise exception 'B7F_DEMAND_REPAIR_INVALID_ACTIVE_STATE'; end if;
  else
    if repair_job.next_window_start >= repair_job.through_boundary then
      update public.vault_b7f_demand_evidence_repair_jobs as rj set status = 'complete', completed_at = now() where rj.id = repair_job.id;
      action := 'complete'; repair_job_id := repair_job.id; detail := 'repair boundary reached'; commit; return;
    end if;
    window_before := least(repair_job.next_window_start + make_interval(hours => repair_job.window_hours), repair_job.through_boundary);
    select count(distinct o.id)::integer, count(l.id)::integer, count(d.id)::integer, count(l.id) filter (where d.id is null)::integer into preflight_orders, preflight_expected, preflight_existing, preflight_missing
    from public.vault_shopify_orders as o left join public.vault_shopify_order_lines as l on l.order_id = o.id
    left join public.vault_shopify_demand_line_observations as d on d.source = l.source and d.shopify_line_item_id = l.shopify_line_item_id
    where o.source = 'shopify' and o.shopify_created_at >= repair_job.next_window_start and o.shopify_created_at < window_before;
    if preflight_missing = 0 then
      insert into public.vault_b7f_demand_evidence_repair_windows(job_id, created_from, created_before, state, preflight_orders, preflight_expected_lines, preflight_existing_observations, preflight_missing_observations, attempt_count, postflight_expected_lines, postflight_existing_observations, postflight_missing_observations, completed_at)
      values (repair_job.id, repair_job.next_window_start, window_before, 'completed', preflight_orders, preflight_expected, preflight_existing, preflight_missing, 0, preflight_expected, preflight_existing, 0, now()) on conflict do nothing returning * into repair_window;
      if repair_window.id is null then select * into repair_window from public.vault_b7f_demand_evidence_repair_windows as rw where rw.job_id = repair_job.id and rw.created_from = repair_job.next_window_start and rw.created_before = window_before for update; end if;
      if repair_window.state <> 'completed' then raise exception 'B7F_DEMAND_REPAIR_WINDOW_REQUIRES_MANUAL_RECONCILIATION'; end if;
      update public.vault_b7f_demand_evidence_repair_jobs as rj set next_window_start = window_before, status = case when window_before >= rj.through_boundary then 'complete' else 'ready' end, completed_at = case when window_before >= rj.through_boundary then now() else null end where rj.id = repair_job.id;
      action := 'verified'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; detail := 'preflight found zero missing observations; no HTTP submitted'; commit; return;
    end if;
    if preflight_orders > 50 then
      insert into public.vault_b7f_demand_evidence_repair_windows(job_id, created_from, created_before, state, preflight_orders, preflight_expected_lines, preflight_existing_observations, preflight_missing_observations, attempt_count, failure_reason)
      values (repair_job.id, repair_job.next_window_start, window_before, 'window_too_large', preflight_orders, preflight_expected, preflight_existing, preflight_missing, 0, 'preflight order count exceeds 50') on conflict do nothing returning * into repair_window;
      update public.vault_b7f_demand_evidence_repair_jobs as rj set status = 'failed' where rj.id = repair_job.id;
      action := 'window_too_large'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_job.next_window_start; created_before := window_before; detail := 'preflight order count exceeds 50; no HTTP submitted'; commit; return;
    end if;
    insert into public.vault_b7f_demand_evidence_repair_windows(job_id, created_from, created_before, state, preflight_orders, preflight_expected_lines, preflight_existing_observations, preflight_missing_observations, attempt_count)
    values (repair_job.id, repair_job.next_window_start, window_before, 'pending', preflight_orders, preflight_expected, preflight_existing, preflight_missing, 1) on conflict do nothing returning * into repair_window;
    if repair_window.id is null then select * into repair_window from public.vault_b7f_demand_evidence_repair_windows as rw where rw.job_id = repair_job.id and rw.created_from = repair_job.next_window_start and rw.created_before = window_before for update; end if;
    if repair_window.state <> 'pending' then raise exception 'B7F_DEMAND_REPAIR_WINDOW_REQUIRES_MANUAL_RECONCILIATION'; end if;
    update public.vault_b7f_demand_evidence_repair_jobs as rj set active_window_id = repair_window.id, status = 'running' where rj.id = repair_job.id;
    commit;
  end if;

  select * into repair_job from public.vault_b7f_demand_evidence_repair_jobs as rj where rj.job_key = 'b7f-2026-demand-evidence-repair' for update;
  perform pg_advisory_xact_lock(hashtextextended(repair_job.id::text, 7148));
  select * into repair_window from public.vault_b7f_demand_evidence_repair_windows as rw where rw.id = repair_job.active_window_id for update;
  if not found or repair_window.state <> 'pending' then action := 'waiting'; repair_job_id := repair_job.id; repair_window_id := repair_job.active_window_id; detail := 'window changed by another committed operator'; commit; return; end if;
  select net.http_post(url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync', headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1), 'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1), 'x-vault-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_order_sync_secret' order by created_at desc limit 1), 'Content-Type', 'application/json'), body := jsonb_build_object('created_from', repair_window.created_from, 'created_before', repair_window.created_before), timeout_milliseconds := 120000) into new_request_id;
  if new_request_id is null then
    update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'uncertain', failure_reason = 'pg_net did not return a request id' where rw.id = repair_window.id and rw.state = 'pending';
    action := 'uncertain'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; detail := 'pg_net request outcome is ambiguous; automatic replay is forbidden';
    commit; return;
  end if;
  update public.vault_b7f_demand_evidence_repair_windows as rw set state = 'submitted', pg_net_request_id = new_request_id, submitted_at = now() where rw.id = repair_window.id and rw.state = 'pending';
  if not found then raise exception 'B7F_DEMAND_REPAIR_PENDING_WINDOW_CHANGED'; end if;
  action := 'submitted'; repair_job_id := repair_job.id; repair_window_id := repair_window.id; created_from := repair_window.created_from; created_before := repair_window.created_before; request_id := new_request_id; detail := 'durably submitted after durable repair reservation';
  commit;
end;
$$;

revoke all on public.vault_b7f_demand_evidence_repair_jobs, public.vault_b7f_demand_evidence_repair_windows from public, anon, authenticated, service_role;
revoke all on function public.initialize_b7f_demand_evidence_repair_job() from public, anon, authenticated, service_role;
revoke all on procedure public.advance_b7f_demand_evidence_repair_job_safely() from public, anon, authenticated, service_role;
grant execute on function public.initialize_b7f_demand_evidence_repair_job() to postgres;
grant execute on procedure public.advance_b7f_demand_evidence_repair_job_safely() to postgres;
notify pgrst, 'reload schema';
