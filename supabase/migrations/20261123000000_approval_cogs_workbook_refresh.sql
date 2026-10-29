-- Owner approval changes governed financial eligibility but never writes a
-- workbook from SQL.  Persist one order-scoped request in the same transaction
-- and let the existing authenticated worker consume it with its normal gates.
begin;

create table public.vault_sales_workbook_order_ready_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.vault_shopify_orders(id) on delete restrict,
  order_number text not null check (order_number ~ '^[1-9][0-9]{0,8}$'),
  source_proposal_id uuid not null unique references public.vault_governed_historical_line_cogs_proposals(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Z0-9_]{1,80}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'processing') = (lease_token is not null and lease_expires_at is not null)),
  check ((status = 'completed') = (completed_at is not null))
);

create index vault_sales_workbook_order_ready_requests_due_idx
  on public.vault_sales_workbook_order_ready_requests (next_attempt_at, created_at)
  where status in ('pending', 'processing');

alter table public.vault_sales_workbook_order_ready_requests enable row level security;
revoke all on public.vault_sales_workbook_order_ready_requests from public, anon, authenticated;
grant select, insert, update on public.vault_sales_workbook_order_ready_requests to service_role;

create function public.claim_sales_workbook_order_ready_requests(p_limit integer default 25)
returns table (id uuid, order_number text, lease_token uuid, attempt_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'SALES_WORKBOOK_ORDER_READY_REQUEST_LIMIT_INVALID';
  end if;

  return query
  with due as (
    select request.id
    from public.vault_sales_workbook_order_ready_requests request
    where (request.status = 'pending' and request.next_attempt_at <= clock_timestamp())
       or (request.status = 'processing' and request.lease_expires_at <= clock_timestamp())
    order by request.next_attempt_at, request.created_at
    for update skip locked
    limit p_limit
  )
  update public.vault_sales_workbook_order_ready_requests request
  set status = 'processing',
      attempt_count = request.attempt_count + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = clock_timestamp() + interval '2 minutes',
      updated_at = clock_timestamp()
  from due
  where request.id = due.id
  returning request.id, request.order_number, request.lease_token, request.attempt_count;
end;
$$;

create function public.complete_sales_workbook_order_ready_request(
  p_request_id uuid,
  p_lease_token uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.vault_sales_workbook_order_ready_requests
  set status = 'completed',
      completed_at = clock_timestamp(),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = null,
      updated_at = clock_timestamp()
  where id = p_request_id
    and status = 'processing'
    and lease_token = p_lease_token;
  if not found then
    raise exception 'SALES_WORKBOOK_ORDER_READY_REQUEST_LEASE_LOST';
  end if;
end;
$$;

create function public.retry_sales_workbook_order_ready_request(
  p_request_id uuid,
  p_lease_token uuid,
  p_error_code text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delay_seconds integer;
begin
  if p_error_code is null or p_error_code !~ '^[A-Z0-9_]{1,80}$' then
    raise exception 'SALES_WORKBOOK_ORDER_READY_REQUEST_ERROR_INVALID';
  end if;

  update public.vault_sales_workbook_order_ready_requests
  set status = 'pending',
      next_attempt_at = clock_timestamp() + make_interval(
        secs => least(3600, 30 * (2 ^ least(attempt_count - 1, 7))::integer)
      ),
      lease_token = null,
      lease_expires_at = null,
      last_error_code = p_error_code,
      updated_at = clock_timestamp()
  where id = p_request_id
    and status = 'processing'
    and lease_token = p_lease_token;
  if not found then
    raise exception 'SALES_WORKBOOK_ORDER_READY_REQUEST_LEASE_LOST';
  end if;
end;
$$;

create or replace function public.decide_governed_historical_line_cogs_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_approval_note text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_status text;
  v_actor_id uuid := auth.uid();
  v_order_id uuid;
  v_order_number text;
begin
  if p_decision not in ('APPROVED','REJECTED') or nullif(trim(p_approval_note),'') is null then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_INVALID_DECISION';
  end if;
  if v_actor_id is null then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_AUTHENTICATED_OWNER_REQUIRED';
  end if;
  if not exists (select 1 from public.vault_operators operator where operator.id = v_actor_id and operator.is_active and operator.role = 'owner') then
    raise exception 'GOVERNED_HISTORICAL_LINE_COGS_OWNER_APPROVAL_REQUIRED';
  end if;
  select p.approval_status, l.order_id, o.order_number
    into v_status, v_order_id, v_order_number
  from public.vault_governed_historical_line_cogs_proposals p
  join public.vault_shopify_order_lines l on l.id = p.order_line_id
  join public.vault_shopify_orders o on o.id = l.order_id
  where p.id = p_proposal_id
  for update of p;
  if not found then raise exception 'GOVERNED_HISTORICAL_LINE_COGS_PROPOSAL_NOT_FOUND'; end if;
  if v_status <> 'PENDING' then raise exception 'GOVERNED_HISTORICAL_LINE_COGS_PROPOSAL_ALREADY_DECIDED'; end if;

  update public.vault_governed_historical_line_cogs_proposals
  set approval_status = p_decision, approved_by_operator_id = v_actor_id, approved_at = clock_timestamp()
  where id = p_proposal_id;
  insert into public.vault_governed_historical_line_cogs_proposal_audit(proposal_id,event_type,actor_operator_id,note)
  values (p_proposal_id,p_decision,v_actor_id,trim(p_approval_note));

  if p_decision = 'APPROVED' then
    -- Match the established refresh/invalidation advisory lock so an approval
    -- committed during a refresh leaves the global governed projection stale.
    perform pg_advisory_xact_lock(hashtextextended('vault_shopify_verified_product_profitability_read_model_refresh', 0));
    update public.vault_shopify_verified_product_profitability_read_model_state
    set state = 'stale', updated_at = clock_timestamp()
    where singleton;
    if not found then raise exception 'PRODUCT_PROFITABILITY_READ_MODEL_STATE_MISSING'; end if;

    insert into public.vault_sales_workbook_order_ready_requests(
      order_id, order_number, source_proposal_id
    ) values (v_order_id, v_order_number, p_proposal_id)
    on conflict (order_id) do nothing;
  end if;
end $$;

revoke all on function public.claim_sales_workbook_order_ready_requests(integer) from public, anon, authenticated;
revoke all on function public.complete_sales_workbook_order_ready_request(uuid,uuid) from public, anon, authenticated;
revoke all on function public.retry_sales_workbook_order_ready_request(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_sales_workbook_order_ready_requests(integer) to service_role;
grant execute on function public.complete_sales_workbook_order_ready_request(uuid,uuid) to service_role;
grant execute on function public.retry_sales_workbook_order_ready_request(uuid,uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
