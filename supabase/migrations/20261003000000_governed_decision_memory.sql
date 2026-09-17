-- Immutable, deployment-forward record of completed governed decision state.
create table public.vault_governed_decision_memory (
  id uuid primary key default gen_random_uuid(),
  store_scope text not null check (store_scope = btrim(store_scope) and length(store_scope) > 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  capture_kind text not null check (capture_kind in ('change', 'daily_baseline')),
  local_observed_date date not null,
  memory_schema_version integer not null check (memory_schema_version > 0),
  evaluator_version text not null,
  summary_semantics_version text not null,
  classifier_policy_version text not null,
  semantic_hash text not null check (semantic_hash ~ '^[0-9a-f]{64}$'),
  executive_outcome text not null,
  outcome_signals jsonb not null check (jsonb_typeof(outcome_signals) = 'object'),
  summary_counts jsonb not null check (jsonb_typeof(summary_counts) = 'object'),
  style_states jsonb not null check (jsonb_typeof(style_states) = 'array'),
  supplier_qualifications jsonb not null check (jsonb_typeof(supplier_qualifications) = 'array'),
  wallet_state jsonb not null check (jsonb_typeof(wallet_state) = 'object'),
  source_provenance jsonb not null check (jsonb_typeof(source_provenance) = 'object')
);

create index vault_governed_decision_memory_scope_observed_idx
  on public.vault_governed_decision_memory (store_scope, observed_at desc);
create unique index vault_governed_decision_memory_daily_baseline_unique
  on public.vault_governed_decision_memory (store_scope, local_observed_date)
  where capture_kind = 'daily_baseline';

create or replace function public.prevent_governed_decision_memory_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'vault_governed_decision_memory is append-only'; end;
$$;
create trigger vault_governed_decision_memory_append_only
before update or delete on public.vault_governed_decision_memory
for each row execute function public.prevent_governed_decision_memory_mutation();

-- The recorder serializes decisions per store so retries cannot produce duplicate changes.
create or replace function public.record_governed_decision_memory(input jsonb)
returns table(inserted boolean, recorded_capture_kind text)
language plpgsql security definer set search_path = '' as $$
declare previous_hash text; baseline_exists boolean; kind text;
declare observed timestamptz; observed_local_date date; latest_observed timestamptz;
begin
  if jsonb_typeof(input) <> 'object' then raise exception 'Governed decision memory input must be an object'; end if;
  if coalesce(input->>'store_scope', '') = '' or input->>'store_scope' <> btrim(input->>'store_scope') then raise exception 'Governed decision memory store_scope is required and must be trimmed'; end if;
  if coalesce(input->>'observed_at', '') = '' then raise exception 'Governed decision memory observed_at is required'; end if;
  begin observed := (input->>'observed_at')::timestamptz; exception when others then raise exception 'Governed decision memory observed_at is invalid'; end;
  observed_local_date := (observed at time zone 'Europe/London')::date;
  if coalesce(input->>'memory_schema_version', '') !~ '^[1-9][0-9]*$' then raise exception 'Governed decision memory schema version is invalid'; end if;
  if coalesce(btrim(input->>'evaluator_version'), '') = '' or coalesce(btrim(input->>'summary_semantics_version'), '') = '' or coalesce(btrim(input->>'classifier_policy_version'), '') = '' then raise exception 'Governed decision memory versions are required'; end if;
  if coalesce(input->>'semantic_hash', '') !~ '^[0-9a-f]{64}$' then raise exception 'Governed decision memory semantic hash is invalid'; end if;
  if input->>'executive_outcome' not in ('NO_ACTION_REQUIRED', 'GATHERING_EVIDENCE', 'BLOCKED', 'ACTION_AVAILABLE', 'MIXED', 'UNKNOWN') then raise exception 'Governed decision memory executive outcome is invalid'; end if;
  if jsonb_typeof(input->'outcome_signals') <> 'object' or jsonb_typeof(input->'summary_counts') <> 'object' or jsonb_typeof(input->'wallet_state') <> 'object' or jsonb_typeof(input->'source_provenance') <> 'object' or jsonb_typeof(input->'style_states') <> 'array' or jsonb_typeof(input->'supplier_qualifications') <> 'array' then raise exception 'Governed decision memory payload has invalid JSON shapes'; end if;
  perform pg_advisory_xact_lock(hashtextextended(input->>'store_scope', 61003));
  select observed_at into latest_observed from public.vault_governed_decision_memory
    where store_scope = input->>'store_scope' order by observed_at desc, recorded_at desc, id desc limit 1;
  if latest_observed is not null and observed < latest_observed then raise exception 'Governed decision memory is forward-only'; end if;
  select semantic_hash into previous_hash from public.vault_governed_decision_memory
    where store_scope = input->>'store_scope' order by observed_at desc, recorded_at desc, id desc limit 1;
  select exists(select 1 from public.vault_governed_decision_memory where store_scope = input->>'store_scope'
    and local_observed_date = observed_local_date and capture_kind = 'daily_baseline') into baseline_exists;
  if previous_hash is not distinct from input->>'semantic_hash' and baseline_exists then return query select false, null::text; return; end if;
  kind := case when not baseline_exists then 'daily_baseline' else 'change' end;
  insert into public.vault_governed_decision_memory (
    store_scope, observed_at, capture_kind, local_observed_date, memory_schema_version, evaluator_version,
    summary_semantics_version, classifier_policy_version, semantic_hash, executive_outcome, outcome_signals,
    summary_counts, style_states, supplier_qualifications, wallet_state, source_provenance
  ) values (
    input->>'store_scope', observed, kind, observed_local_date,
    (input->>'memory_schema_version')::integer, input->>'evaluator_version', input->>'summary_semantics_version',
    input->>'classifier_policy_version', input->>'semantic_hash', input->>'executive_outcome', input->'outcome_signals',
    input->'summary_counts', input->'style_states', input->'supplier_qualifications', input->'wallet_state', input->'source_provenance'
  );
  return query select true, kind;
end;
$$;

alter table public.vault_governed_decision_memory enable row level security;
revoke all on public.vault_governed_decision_memory from anon, authenticated;
revoke all on function public.record_governed_decision_memory(jsonb) from public, anon, authenticated;
grant execute on function public.record_governed_decision_memory(jsonb) to service_role;
comment on table public.vault_governed_decision_memory is 'Append-only governed decision evidence. Starts at deployment; legacy operational snapshots are excluded.';
notify pgrst, 'reload schema';
