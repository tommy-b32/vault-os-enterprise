-- record_shopify_fulfillment_tracking_evidence is SECURITY INVOKER and locks
-- the immutable capture row with SELECT ... FOR UPDATE before deciding whether
-- an observation is an idempotent replay. PostgreSQL requires UPDATE privilege
-- for that row lock even though this function never updates the table.
-- The existing immutable trigger continues to reject any actual UPDATE.
grant update on table public.vault_shopify_fulfillment_tracking_capture_observations
  to service_role;
