-- B7F operator-driven historical backfill. No cron and no automatic execution.
create table public.vault_b7f_historical_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique check (job_key = 'b7f-2026-historical-demand'),
  from_boundary timestamptz not null,
  through_boundary timestamptz not null,
  window_hours integer not null check (window_hours = 168),
  status text not null check (status in ('ready','running','complete','failed')),
  next_window_start timestamptz not null,
  active_window_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz,
  check (from_boundary = '2026-01-01T00:00:00.000Z'::timestamptz),
  check (through_boundary = '2026-09-20T09:34:53.489Z'::timestamptz),
  check (from_boundary < through_boundary),
  check (next_window_start >= from_boundary and next_window_start <= through_boundary)
);

create table public.vault_b7f_historical_backfill_windows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.vault_b7f_historical_backfill_jobs(id) on delete restrict,
  created_from timestamptz not null, created_before timestamptz not null,
  state text not null check (state in ('pending','submitted','uncertain','completed','failed','window_too_large')),
  pg_net_request_id bigint, attempt_count integer not null default 0 check (attempt_count >= 0),
  submitted_at timestamptz, completed_sync_run_id uuid references public.vault_shopify_order_sync_runs(id) on delete restrict,
  orders_synced integer check (orders_synced >= 0), order_lines_synced integer check (order_lines_synced >= 0),
  completed_at timestamptz, failure_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(job_id, created_from, created_before),
  check (created_from < created_before),
  check ((state = 'completed') = (completed_sync_run_id is not null and completed_at is not null and orders_synced is not null and order_lines_synced is not null)),
  check ((state in ('pending','submitted','uncertain')) or failure_reason is not null or state = 'completed')
);
create unique index vault_b7f_historical_backfill_one_active_window
  on public.vault_b7f_historical_backfill_windows(job_id)
  where state in ('pending','submitted','uncertain');

alter table public.vault_b7f_historical_backfill_jobs
  add constraint vault_b7f_historical_backfill_active_window_fk
  foreign key (active_window_id) references public.vault_b7f_historical_backfill_windows(id) on delete restrict;

create function public.b7f_backfill_touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
create trigger vault_b7f_backfill_jobs_touch before update on public.vault_b7f_historical_backfill_jobs for each row execute function public.b7f_backfill_touch();
create trigger vault_b7f_backfill_windows_touch before update on public.vault_b7f_historical_backfill_windows for each row execute function public.b7f_backfill_touch();

create function public.initialize_b7f_historical_backfill_job()
returns uuid language plpgsql security definer set search_path=public,pg_catalog as $$
declare job_id uuid;
begin
  insert into public.vault_b7f_historical_backfill_jobs(job_key,from_boundary,through_boundary,window_hours,status,next_window_start)
  values ('b7f-2026-historical-demand','2026-01-01T00:00:00.000Z','2026-09-20T09:34:53.489Z',168,'ready','2026-01-01T00:00:00.000Z')
  on conflict(job_key) do update set job_key=excluded.job_key
  returning id into job_id;
  return job_id;
end; $$;

create function public.b7f_backfill_complete_if_attested(target_window uuid)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare w public.vault_b7f_historical_backfill_windows%rowtype; matching public.vault_shopify_order_sync_runs%rowtype;
begin
  select * into w from public.vault_b7f_historical_backfill_windows where id=target_window for update;
  if not found or w.state='completed' then return found; end if;
  select * into matching from public.vault_shopify_order_sync_runs
  where sync_mode='historical_orders_by_created_at' and created_from=w.created_from and created_before=w.created_before and completed_at is not null
  order by completed_at desc,id desc limit 1;
  if matching.id is null then return false; end if;
  update public.vault_b7f_historical_backfill_windows set state='completed',completed_sync_run_id=matching.id,orders_synced=matching.orders_synced,order_lines_synced=matching.order_lines_synced,completed_at=matching.completed_at,failure_reason=null where id=w.id;
  update public.vault_b7f_historical_backfill_jobs set next_window_start=w.created_before,active_window_id=null,status=case when w.created_before>=through_boundary then 'complete' else 'running' end,completed_at=case when w.created_before>=through_boundary then now() else null end where id=w.job_id;
  return true;
end; $$;

create function public.advance_b7f_historical_backfill_job()
returns table(action text, job_id uuid, window_id uuid, created_from timestamptz, created_before timestamptz, request_id bigint, detail text)
language plpgsql security definer set search_path=public,vault,net,pg_catalog as $$
declare j public.vault_b7f_historical_backfill_jobs%rowtype; w public.vault_b7f_historical_backfill_windows%rowtype; v_before timestamptz; response record; v_request bigint;
begin
  select * into j from public.vault_b7f_historical_backfill_jobs where job_key='b7f-2026-historical-demand' for update;
  if not found then raise exception 'B7F_BACKFILL_JOB_NOT_INITIALIZED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(j.id::text, 7147));
  if j.status='complete' then return query select 'complete',j.id,null::uuid,null::timestamptz,null::timestamptz,null::bigint,'all exact windows attested'; return; end if;
  if j.active_window_id is not null then
    select * into w from public.vault_b7f_historical_backfill_windows where id=j.active_window_id for update;
    if public.b7f_backfill_complete_if_attested(w.id) then return query select 'attested',j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,'exact historical sync run adopted'; return; end if;
    if w.state='uncertain' then return query select 'uncertain',j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,'explicit retry required'; return; end if;
    if w.state in ('failed','window_too_large') then return query select w.state,j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,w.failure_reason; return; end if;
    if w.state='submitted' then
      select status_code,timed_out,error_msg,content into response from net._http_response where id=w.pg_net_request_id order by created desc limit 1;
      if found and (response.timed_out or response.status_code >= 400 or response.error_msg is not null) then
        update public.vault_b7f_historical_backfill_windows set state=case when coalesce(response.content,'') ilike '%pagination exceeded%' or coalesce(response.content,'') ilike '%exceeds the supported%' then 'window_too_large' else 'failed' end,failure_reason=coalesce(response.error_msg,response.content,'pg_net request failed') where id=w.id;
        update public.vault_b7f_historical_backfill_jobs set status='failed' where id=j.id;
        return query select (select state from public.vault_b7f_historical_backfill_windows where id=w.id),j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,'pg_net response failed'; return;
      elsif not found and w.submitted_at < now()-interval '5 minutes' then
        update public.vault_b7f_historical_backfill_windows set state='uncertain',failure_reason='pg_net response unavailable; exact sync-run receipt absent' where id=w.id;
        return query select 'uncertain',j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,'exact receipt absent after response grace period'; return;
      else return query select 'waiting',j.id,w.id,w.created_from,w.created_before,w.pg_net_request_id,'awaiting exact sync-run receipt'; return;
      end if;
    end if;
  end if;
  if j.next_window_start>=j.through_boundary then update public.vault_b7f_historical_backfill_jobs set status='complete',completed_at=now() where id=j.id; return query select 'complete',j.id,null::uuid,null::timestamptz,null::timestamptz,null::bigint,'boundary reached'; return; end if;
  v_before:=least(j.next_window_start + make_interval(hours=>j.window_hours),j.through_boundary);
  insert into public.vault_b7f_historical_backfill_windows(job_id,created_from,created_before,state,attempt_count,failure_reason)
  values(j.id,j.next_window_start,v_before,'pending',1,null) on conflict(job_id,created_from,created_before) do nothing returning * into w;
  if w.id is null then select * into w from public.vault_b7f_historical_backfill_windows where job_id=j.id and created_from=j.next_window_start and created_before=v_before for update; end if;
  update public.vault_b7f_historical_backfill_jobs set active_window_id=w.id,status='running' where id=j.id;
  if public.b7f_backfill_complete_if_attested(w.id) then return query select 'adopted',j.id,w.id,w.created_from,w.created_before,null::bigint,'existing exact historical sync run adopted'; return; end if;
  select net.http_post(url:='https://mzrimaqjyrvtbpaeyooe.supabase.co/functions/v1/shopify-order-sync',headers:=jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),'apikey',(select decrypted_secret from vault.decrypted_secrets where name='vault_shopify_order_sync_service_role_jwt' order by created_at desc limit 1),'x-vault-sync-secret',(select decrypted_secret from vault.decrypted_secrets where name='vault_order_sync_secret' order by created_at desc limit 1),'Content-Type','application/json'),body:=jsonb_build_object('created_from',w.created_from,'created_before',w.created_before),timeout_milliseconds:=120000) into v_request;
  update public.vault_b7f_historical_backfill_windows set state='submitted',pg_net_request_id=v_request,submitted_at=now() where id=w.id;
  return query select 'submitted',j.id,w.id,w.created_from,w.created_before,v_request,'pending window durably recorded before pg_net submission';
end; $$;

create function public.retry_b7f_historical_backfill_window(target_window uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare w public.vault_b7f_historical_backfill_windows%rowtype;
begin
 select * into w from public.vault_b7f_historical_backfill_windows where id=target_window for update;
 if not found then raise exception 'B7F_BACKFILL_WINDOW_NOT_FOUND'; end if;
 if public.b7f_backfill_complete_if_attested(w.id) then return; end if;
 if w.state<>'uncertain' then raise exception 'B7F_BACKFILL_RETRY_REQUIRES_UNCERTAIN_WINDOW'; end if;
 update public.vault_b7f_historical_backfill_windows set state='pending',pg_net_request_id=null,submitted_at=null,attempt_count=attempt_count+1,failure_reason=null where id=w.id;
end; $$;

create view public.vault_b7f_historical_backfill_status with (security_barrier=true) as
select j.*,w.created_from as active_created_from,w.created_before as active_created_before,w.state as active_state,w.pg_net_request_id,w.attempt_count,w.failure_reason from public.vault_b7f_historical_backfill_jobs j left join public.vault_b7f_historical_backfill_windows w on w.id=j.active_window_id;
create view public.vault_b7f_historical_backfill_receipts with (security_barrier=true) as
select job_id,created_from,created_before,completed_sync_run_id,orders_synced,order_lines_synced,pg_net_request_id,completed_at
from public.vault_b7f_historical_backfill_windows where state='completed';
revoke all on public.vault_b7f_historical_backfill_jobs,public.vault_b7f_historical_backfill_windows,public.vault_b7f_historical_backfill_status,public.vault_b7f_historical_backfill_receipts from anon,authenticated;
revoke all on function public.initialize_b7f_historical_backfill_job(),public.advance_b7f_historical_backfill_job(),public.retry_b7f_historical_backfill_window(uuid),public.b7f_backfill_complete_if_attested(uuid) from public,anon,authenticated;
grant execute on function public.initialize_b7f_historical_backfill_job(),public.advance_b7f_historical_backfill_job(),public.retry_b7f_historical_backfill_window(uuid) to service_role;
notify pgrst,'reload schema';
