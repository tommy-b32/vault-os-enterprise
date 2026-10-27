-- PostgreSQL identifiers are limited to 63 bytes. Migration 20261119000000
-- created these two guarded functions under silently truncated identifiers.
-- Rename the existing functions only: their bodies, owners, security-definer
-- settings, validation, and immutable evidence bindings remain unchanged.
begin;

alter function public.create_exclusive_tee_historical_cogs_simulation_review_from_pre(uuid, uuid)
  rename to create_historical_cogs_review_from_preview;

alter function public.approve_exclusive_tee_historical_cogs_simulation_review_from_pr(uuid, uuid, text, uuid)
  rename to approve_historical_cogs_review_from_preview;

revoke all on function public.create_historical_cogs_review_from_preview(uuid, uuid),
  public.approve_historical_cogs_review_from_preview(uuid, uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.create_historical_cogs_review_from_preview(uuid, uuid),
  public.approve_historical_cogs_review_from_preview(uuid, uuid, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
