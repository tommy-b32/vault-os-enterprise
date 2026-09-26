-- Name the applied Exclusive Polo attribution view within PostgreSQL's identifier limit.
begin;

alter view public.vault_historical_exclusive_polo_policy_derived_cogs_line_attrib
  rename to vault_historical_exclusive_polo_cogs_attributions;

notify pgrst, 'reload schema';
commit;
