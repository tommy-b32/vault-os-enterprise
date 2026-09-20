-- B7F receipt-adoption helper. No HTTP, Vault access, job initialisation, or automatic execution.
create procedure public.adopt_b7f_historical_backfill_receipts_safely(
  out adopted_windows integer,
  out resulting_next_window_start timestamptz,
  out stop_reason text,
  out first_missing_created_from timestamptz,
  out first_missing_created_before timestamptz
)
language plpgsql
as $$
declare
  j public.vault_b7f_historical_backfill_jobs%rowtype;
  w public.vault_b7f_historical_backfill_windows%rowtype;
  matching public.vault_shopify_order_sync_runs%rowtype;
  v_before timestamptz;
begin
  -- Must be first: CALL inside an explicit transaction fails before reads, writes, or output.
  commit;
  adopted_windows := 0;

  loop
    select * into j
    from public.vault_b7f_historical_backfill_jobs
    where job_key = 'b7f-2026-historical-demand'
    for update;
    if not found then
      raise exception 'B7F_BACKFILL_JOB_NOT_INITIALIZED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(j.id::text, 7147));

    if j.active_window_id is not null then
      raise exception 'B7F_BACKFILL_ACTIVE_WINDOW_REQUIRES_RECONCILIATION';
    end if;
    if j.next_window_start >= j.through_boundary then
      resulting_next_window_start := j.next_window_start;
      stop_reason := 'boundary_reached';
      commit;
      return;
    end if;

    v_before := least(j.next_window_start + make_interval(hours => j.window_hours), j.through_boundary);
    select * into matching
    from public.vault_shopify_order_sync_runs
    where sync_mode = 'historical_orders_by_created_at'
      and created_from = j.next_window_start
      and created_before = v_before
      and completed_at is not null
    order by completed_at desc, id desc
    limit 1;
    -- Hold the authoritative receipt stable through the completed-window write.
    -- This blocks deletion or alteration until this iteration commits.
    select * into matching
    from public.vault_shopify_order_sync_runs
    where id = matching.id
    for share;

    if matching.id is null then
      resulting_next_window_start := j.next_window_start;
      stop_reason := 'missing_exact_completed_receipt';
      first_missing_created_from := j.next_window_start;
      first_missing_created_before := v_before;
      commit;
      return;
    end if;

    insert into public.vault_b7f_historical_backfill_windows(
      job_id, created_from, created_before, state, attempt_count,
      completed_sync_run_id, orders_synced, order_lines_synced, completed_at, failure_reason
    ) values (
      j.id, j.next_window_start, v_before, 'completed', 1,
      matching.id, matching.orders_synced, matching.order_lines_synced, matching.completed_at, null
    ) on conflict (job_id, created_from, created_before) do nothing
    returning * into w;

    if w.id is null then
      select * into w from public.vault_b7f_historical_backfill_windows
      where job_id = j.id and created_from = j.next_window_start and created_before = v_before
      for update;
      if w.state <> 'completed' then
        raise exception 'B7F_BACKFILL_WINDOW_REQUIRES_RECONCILIATION';
      end if;
      if w.completed_sync_run_id is distinct from matching.id
         or w.orders_synced is distinct from matching.orders_synced
         or w.order_lines_synced is distinct from matching.order_lines_synced
         or w.completed_at is distinct from matching.completed_at then
        raise exception 'B7F_BACKFILL_COMPLETED_WINDOW_RECEIPT_CONFLICT';
      end if;
    end if;

    update public.vault_b7f_historical_backfill_jobs
    set next_window_start = v_before,
        active_window_id = null,
        status = case when v_before >= through_boundary then 'complete' else 'running' end,
        completed_at = case when v_before >= through_boundary then now() else null end
    where id = j.id;

    adopted_windows := adopted_windows + 1;
    resulting_next_window_start := v_before;
    -- Every adopted receipt is durable before this procedure can report it or inspect the next window.
    commit;
  end loop;
end;
$$;

revoke all on procedure public.adopt_b7f_historical_backfill_receipts_safely() from public, anon, authenticated, service_role;
grant execute on procedure public.adopt_b7f_historical_backfill_receipts_safely() to postgres;

notify pgrst, 'reload schema';
