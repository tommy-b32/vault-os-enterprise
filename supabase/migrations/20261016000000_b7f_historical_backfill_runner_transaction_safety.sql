-- B7F transaction-safe operator protocol.  This migration does not initialise or advance a job.
-- A SECURITY DEFINER procedure cannot control transactions, so this deliberately remains SECURITY INVOKER.
-- It is for the Supabase SQL Editor database-admin path only; CALL must be issued as one top-level statement.

revoke execute on function public.advance_b7f_historical_backfill_job() from service_role;
drop function public.advance_b7f_historical_backfill_job();

create procedure public.advance_b7f_historical_backfill_job_safely(
  out action text,
  out job_id uuid,
  out window_id uuid,
  out created_from timestamptz,
  out created_before timestamptz,
  out request_id bigint,
  out detail text
)
language plpgsql
as $$
declare
  j public.vault_b7f_historical_backfill_jobs%rowtype;
  w public.vault_b7f_historical_backfill_windows%rowtype;
  v_before timestamptz;
  response record;
  v_request bigint;
begin
  -- This is intentionally first.  PostgreSQL rejects it when CALL is inside BEGIN/COMMIT,
  -- before this procedure can read, write, allocate a pg_net request id, or return success.
  commit;

  select * into j
  from public.vault_b7f_historical_backfill_jobs
  where job_key = 'b7f-2026-historical-demand'
  for update;
  if not found then
    raise exception 'B7F_BACKFILL_JOB_NOT_INITIALIZED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(j.id::text, 7147));

  if j.status = 'complete' then
    action := 'complete'; job_id := j.id; detail := 'all exact windows attested';
    commit; return;
  end if;

  if j.active_window_id is not null then
    select * into w from public.vault_b7f_historical_backfill_windows where id = j.active_window_id for update;
    if public.b7f_backfill_complete_if_attested(w.id) then
      action := 'attested'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := 'exact historical sync run adopted';
      commit; return;
    end if;
    if w.state = 'uncertain' then
      action := 'uncertain'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := 'explicit retry required';
      commit; return;
    end if;
    if w.state in ('failed', 'window_too_large') then
      action := w.state; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := w.failure_reason;
      commit; return;
    end if;
    if w.state = 'submitted' then
      select status_code, timed_out, error_msg, content into response
      from net._http_response where id = w.pg_net_request_id order by created desc limit 1;
      if found and (response.timed_out or response.status_code >= 400 or response.error_msg is not null) then
        update public.vault_b7f_historical_backfill_windows
        set state = case when coalesce(response.content, '') ilike '%pagination exceeded%' or coalesce(response.content, '') ilike '%exceeds the supported%' then 'window_too_large' else 'failed' end,
            failure_reason = coalesce(response.error_msg, response.content, 'pg_net request failed')
        where id = w.id;
        update public.vault_b7f_historical_backfill_jobs set status = 'failed' where id = j.id;
        action := (select state from public.vault_b7f_historical_backfill_windows where id = w.id); job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := 'pg_net response failed';
        commit; return;
      elsif not found and w.submitted_at < now() - interval '5 minutes' then
        update public.vault_b7f_historical_backfill_windows set state = 'uncertain', failure_reason = 'pg_net response unavailable; exact sync-run receipt absent' where id = w.id;
        action := 'uncertain'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := 'exact receipt absent after response grace period';
        commit; return;
      else
        action := 'waiting'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := w.pg_net_request_id; detail := 'awaiting exact sync-run receipt';
        commit; return;
      end if;
    end if;
  end if;

  if j.next_window_start >= j.through_boundary then
    update public.vault_b7f_historical_backfill_jobs set status = 'complete', completed_at = now() where id = j.id;
    action := 'complete'; job_id := j.id; detail := 'boundary reached';
    commit; return;
  end if;

  v_before := least(j.next_window_start + make_interval(hours => j.window_hours), j.through_boundary);
  insert into public.vault_b7f_historical_backfill_windows(job_id, created_from, created_before, state, attempt_count, failure_reason)
  values (j.id, j.next_window_start, v_before, 'pending', 1, null)
  on conflict (job_id, created_from, created_before) do nothing
  returning * into w;
  if w.id is null then
    select * into w from public.vault_b7f_historical_backfill_windows
    where job_id = j.id and created_from = j.next_window_start and created_before = v_before for update;
  end if;
  update public.vault_b7f_historical_backfill_jobs set active_window_id = w.id, status = 'running' where id = j.id;

  if public.b7f_backfill_complete_if_attested(w.id) then
    action := 'adopted'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; detail := 'existing exact historical sync run adopted';
    commit; return;
  end if;

  -- Make the pending window durable before any request can be queued.  A crash here is safe: pending blocks replay.
  commit;

  select * into j from public.vault_b7f_historical_backfill_jobs where job_key = 'b7f-2026-historical-demand' for update;
  perform pg_advisory_xact_lock(hashtextextended(j.id::text, 7147));
  select * into w from public.vault_b7f_historical_backfill_windows where id = j.active_window_id for update;
  if not found or w.state <> 'pending' then
    action := 'waiting'; job_id := j.id; window_id := j.active_window_id; detail := 'window changed by another committed operator';
    commit; return;
  end if;
  -- A receipt may have committed after the reservation transaction.  Re-attest while
  -- holding the submission-phase locks so an existing run is never needlessly replayed.
  if public.b7f_backfill_complete_if_attested(w.id) then
    action := 'adopted'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; detail := 'exact historical sync run adopted after pending reservation';
    commit; return;
  end if;

  select net.http_post(
    url := 'https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),
      'x-vault-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vault_order_sync_secret' order by created_at desc limit 1),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('created_from', w.created_from, 'created_before', w.created_before),
    timeout_milliseconds := 120000
  ) into v_request;
  update public.vault_b7f_historical_backfill_windows
  set state = 'submitted', pg_net_request_id = v_request, submitted_at = now()
  where id = w.id and state = 'pending';
  if not found then
    raise exception 'B7F_BACKFILL_PENDING_WINDOW_CHANGED';
  end if;
  action := 'submitted'; job_id := j.id; window_id := w.id; created_from := w.created_from; created_before := w.created_before; request_id := v_request; detail := 'durably submitted after durable pending reservation';
  -- pg_net dispatch begins only after this commit.  No submitted result is emitted before it succeeds.
  commit;
end;
$$;

revoke all on procedure public.advance_b7f_historical_backfill_job_safely() from public, anon, authenticated, service_role;
grant execute on procedure public.advance_b7f_historical_backfill_job_safely() to postgres;

notify pgrst, 'reload schema';
