-- REPLAY-ONLY BOOTSTRAP SHIM. Do not add to Supabase migration history.
--
-- The following historical migration requires a named Vault secret before it
-- can create its pg_cron job. Production has that secret provisioned outside
-- of migration history; an isolated replay does not. This inert value exists
-- solely to satisfy that precondition while cron.launch_active_jobs is off.
-- It must run after 20261003000000 and before 20261004000000.

create extension if not exists supabase_vault with schema vault;

do $$
declare
  existing_secret_id uuid;
  existing_secret text;
begin
  if current_setting('cron.launch_active_jobs', true) is distinct from 'off' then
    raise exception 'Replay decision-memory scheduler-secret shim requires cron.launch_active_jobs = off';
  end if;

  select id, decrypted_secret
  into existing_secret_id, existing_secret
  from vault.decrypted_secrets
  where name = 'governed_decision_memory_scheduler_secret'
  order by created_at desc
  limit 1;

  if existing_secret_id is null then
    perform vault.create_secret(
      'replay-only-inert-governed-decision-memory-scheduler-secret',
      'governed_decision_memory_scheduler_secret',
      'Inert isolated-replay bootstrap value; replace with a production secret outside migration history'
    );
  elsif btrim(existing_secret) = '' then
    perform vault.update_secret(
      existing_secret_id,
      'replay-only-inert-governed-decision-memory-scheduler-secret'
    );
  end if;
end;
$$;
