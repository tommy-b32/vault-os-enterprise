-- REPLAY-ONLY COMPATIBILITY SHIM. Do not add to Supabase migration history.
--
-- Historical production happened to assign job ID 9 to this analytics job;
-- the isolated clean replay assigns a sequence-derived ID instead. Two later
-- historical migrations hard-code 9. This shim makes only that replay bridge.
-- It must run immediately after 20260904120000 and before 20260908130000.

do $$
declare
  expected_name constant text := 'vault-shopify-analytics-refresh';
  original_jobid bigint;
  original_schedule text;
  original_command text;
  actual_name text;
  actual_schedule text;
  actual_command text;
  job_count integer;
  run_count integer;
  max_jobid bigint;
  sequence_last_value bigint;
  sequence_is_called boolean;
  sequence_floor bigint;
begin
  if current_setting('cron.launch_active_jobs', true) is distinct from 'off' then
    raise exception 'Replay compatibility shim requires cron.launch_active_jobs = off';
  end if;

  select count(*) into job_count
  from cron.job
  where jobname = expected_name;
  if job_count <> 1 then
    raise exception 'Expected exactly one cron job named %, found %', expected_name, job_count;
  end if;

  select jobid, schedule, command
  into original_jobid, original_schedule, original_command
  from cron.job
  where jobname = expected_name;
  if original_jobid = 9 then
    raise exception 'Replay compatibility shim refuses an already-remapped job ID 9';
  end if;

  if exists (select 1 from cron.job where jobid = 9) then
    raise exception 'Replay compatibility shim requires vacant cron job ID 9';
  end if;

  select count(*) into run_count
  from cron.job_run_details
  where jobid = original_jobid;
  if run_count <> 0 then
    raise exception 'Replay compatibility shim requires zero run details for job %, found %', original_jobid, run_count;
  end if;

  update cron.job
  set jobid = 9
  where jobid = original_jobid
    and jobname = expected_name;
  if not found then
    raise exception 'Replay compatibility shim failed to remap analytics cron job';
  end if;

  select max(jobid) into max_jobid from cron.job;
  select last_value, is_called into sequence_last_value, sequence_is_called from cron.jobid_seq;
  sequence_floor := greatest(
    coalesce(max_jobid, 0),
    case when sequence_is_called then sequence_last_value else sequence_last_value - 1 end
  );
  perform setval('cron.jobid_seq'::regclass, sequence_floor, true);

  select jobname, schedule, command
  into actual_name, actual_schedule, actual_command
  from cron.job
  where jobid = 9;
  if actual_name is distinct from expected_name
     or actual_schedule is distinct from original_schedule
     or actual_command is distinct from original_command then
    raise exception 'Replay compatibility shim changed cron attributes other than job ID';
  end if;

  if (select nextval('cron.jobid_seq'::regclass)) <= (select max(jobid) from cron.job) then
    raise exception 'Replay compatibility shim left cron.jobid_seq unsafe';
  end if;
end;
$$;
