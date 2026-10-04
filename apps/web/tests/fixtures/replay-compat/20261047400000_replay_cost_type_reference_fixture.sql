-- REPLAY-ONLY compatibility fixture. Do not add to Supabase migration history.
-- Restores verified operational reference data needed by 20261047500000.
-- Recovered read-only from production; place after 20261047000000 and before 20261047500000.
begin;

do $$
begin
  if exists (
    select 1
    from public.vault_cost_types
    where id = 'tee'
      and (display_name is distinct from 'Tee' or active is distinct from true)
  ) then
    raise exception 'Replay tee cost-type fixture found conflicting reference data';
  end if;

  insert into public.vault_cost_types (id, display_name, active)
  values ('tee', 'Tee', true)
  on conflict (id) do nothing;
end;
$$;

commit;
