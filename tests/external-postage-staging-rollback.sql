-- Run ONLY on isolated staging after applying the external postage migration.
-- This file intentionally does not write to production.
begin;
do $$
declare
  sample_order uuid;
  sample_shopify_id text;
  owner_operator uuid := gen_random_uuid();
  active_operator uuid := gen_random_uuid();
  inactive_operator uuid := gen_random_uuid();
  viewer_operator uuid := gen_random_uuid();
  first_result jsonb;
  second_result jsonb;
  recorded_count integer;
  audit_count integer;
begin
  if has_table_privilege('authenticated', 'public.vault_external_order_postage', 'INSERT')
    or has_table_privilege('authenticated', 'public.vault_external_order_postage_audit', 'INSERT') then
    raise exception 'Authenticated role must not write external postage tables directly';
  end if;
  if not has_function_privilege('authenticated', 'public.record_external_order_postage(uuid,bigint)', 'EXECUTE') then
    raise exception 'Authenticated role must execute external postage RPC';
  end if;

  select o.id, o.shopify_order_id into sample_order, sample_shopify_id
  from public.vault_shopify_orders o
  where o.source = 'shopify' and o.shopify_order_id is not null
    and not exists (select 1 from public.vault_external_order_postage e where e.order_id = o.id)
  order by o.id limit 1;
  if sample_order is null then raise exception 'No staging Shopify fixture available'; end if;

  insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (owner_operator, 'authenticated', 'authenticated', 'external-postage-owner@example.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
    (active_operator, 'authenticated', 'authenticated', 'external-postage-operator@example.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
    (inactive_operator, 'authenticated', 'authenticated', 'external-postage-inactive@example.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp()),
    (viewer_operator, 'authenticated', 'authenticated', 'external-postage-viewer@example.invalid', '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb, clock_timestamp(), clock_timestamp());
  insert into public.vault_operators (id, email, role, is_active)
  values
    (owner_operator, 'external-postage-owner@example.invalid', 'owner', true),
    (active_operator, 'external-postage-operator@example.invalid', 'operator', true),
    (inactive_operator, 'external-postage-inactive@example.invalid', 'operator', false),
    (viewer_operator, 'external-postage-viewer@example.invalid', 'viewer', true);

  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.record_external_order_postage(sample_order, 375);
    raise exception 'Expected unauthenticated rejection';
  exception when others then
    if sqlerrm = 'Expected unauthenticated rejection' then raise; end if;
    if sqlerrm <> 'EXTERNAL_ORDER_POSTAGE_AUTHENTICATED_OPERATOR_REQUIRED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', inactive_operator::text, true);
  begin
    perform public.record_external_order_postage(sample_order, 375);
    raise exception 'Expected inactive operator rejection';
  exception when others then
    if sqlerrm = 'Expected inactive operator rejection' then raise; end if;
    if sqlerrm <> 'EXTERNAL_ORDER_POSTAGE_ACTIVE_OPERATOR_REQUIRED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', viewer_operator::text, true);
  begin
    perform public.record_external_order_postage(sample_order, 375);
    raise exception 'Expected insufficient-role rejection';
  exception when others then
    if sqlerrm = 'Expected insufficient-role rejection' then raise; end if;
    if sqlerrm <> 'EXTERNAL_ORDER_POSTAGE_ACTIVE_OPERATOR_REQUIRED' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', owner_operator::text, true);
  first_result := public.record_external_order_postage(sample_order, 375);
  second_result := public.record_external_order_postage(sample_order, 375);
  perform set_config('request.jwt.claim.sub', active_operator::text, true);
  if (public.record_external_order_postage(sample_order, 375) ->> 'amount_pence') <> '375' then
    raise exception 'Expected active operator acceptance';
  end if;
  perform set_config('request.jwt.claim.sub', owner_operator::text, true);
  if first_result ->> 'amount_pence' <> '375'
    or second_result ->> 'amount_pence' <> '375' then
    raise exception 'Idempotent write did not return expected amount';
  end if;
  select count(*) into recorded_count from public.vault_external_order_postage where order_id = sample_order;
  select count(*) into audit_count from public.vault_external_order_postage_audit where order_id = sample_order;
  if recorded_count <> 1 or audit_count <> 1 then
    raise exception 'Duplicate record or audit event: %, %', recorded_count, audit_count;
  end if;
  if (select estimated_operational_contribution_gbp
      from public.vault_shopify_verified_order_operational_contributions
      where order_id = sample_order) <> 85.25 then
    raise exception 'Expected £85.25 contribution after £3.75 external postage';
  end if;

  begin
    perform public.record_external_order_postage(sample_order, 295);
    raise exception 'Expected conflicting amount rejection';
  exception when others then
    if sqlerrm = 'Expected conflicting amount rejection' then raise; end if;
  end;

  begin
    update public.vault_external_order_postage set amount_pence = 295 where order_id = sample_order;
    raise exception 'Expected immutable evidence rejection';
  exception when others then
    if sqlerrm = 'Expected immutable evidence rejection' then raise; end if;
  end;

  update public.vault_shopify_order_operational_contribution_diagnostics
  set shipping_source_state = 'covered', observed_purchased_label_cost_gbp = 2.95
  where order_id = sample_order;
  if exists (
    select 1 from public.vault_shopify_verified_order_operational_contributions where order_id = sample_order
  ) or not exists (
    select 1 from public.vault_order_external_postage_effective
    where order_id = sample_order
      and effective_shipping_cost_gbp is null
      and 'shipping_source_conflict' = any(effective_exclusion_reason_codes)
  ) then
    raise exception 'Expected Shopify shipping conflict to block contribution';
  end if;

  raise notice 'PASS: authorization, idempotency, immutable audit, £85.25 contribution, Shopify conflict gate';
end;
$$;
rollback;
