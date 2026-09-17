-- Automatic, authenticated capture of the completed governed decision state.
-- The route owns evaluation, projection, hashing, and recorder semantics.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $do$
declare
  scheduler_secret text;
  existing_job_id bigint;
begin
  select decrypted_secret
  into scheduler_secret
  from vault.decrypted_secrets
  where name = 'governed_decision_memory_scheduler_secret'
  order by created_at desc
  limit 1;

  if scheduler_secret is null or btrim(scheduler_secret) = '' then
    raise exception
      'Governed decision memory capture schedule requires its scheduler secret in Supabase Vault';
  end if;

  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'governed-decision-memory-capture'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'governed-decision-memory-capture',
    '*/15 * * * *',
    $cron$
      with scheduler_secret as (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'governed_decision_memory_scheduler_secret'
          and btrim(decrypted_secret) <> ''
        order by created_at desc
        limit 1
      )
      select net.http_post(
        url := 'https://vault-os-enterprise-5f4k.vercel.app/api/internal/governed-decision-memory/capture',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || decrypted_secret,
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 15000
      )
      from scheduler_secret;
    $cron$
  );
end
$do$;
