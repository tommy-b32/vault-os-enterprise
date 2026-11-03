-- Run ONLY on isolated staging after applying the external postage migration.
-- This file intentionally does not write to production.
begin;
do $$
declare
  sample_order uuid;
  sample_shopify_id text;
  sample_operator uuid := gen_random_uuid();
  first_result jsonb;
  second_result jsonb;
  recorded_count integer;
  audit_count integer;
begin
  select o.id, o.shopify_order_id into sample_order, sample_shopify_id
  from public.vault_shopify_orders o
  where o.source = 'shopify' and o.shopify_order_id is not null
    and not exists (select 1 from public.vault_external_order_postage e where e.order_id = o.id)
  order by o.id limit 1;
  if sample_order is null then raise exception 'No staging Shopify fixture available'; end if;

  first_result := public.record_external_order_postage(sample_order, 375, sample_operator);
  second_result := public.record_external_order_postage(sample_order, 375, sample_operator);
  if first_result ->> 'amount_pence' <> '375'
    or second_result ->> 'amount_pence' <> '375' then
    raise exception 'Idempotent write did not return expected amount';
  end if;
  select count(*) into recorded_count from public.vault_external_order_postage where order_id = sample_order;
  select count(*) into audit_count from public.vault_external_order_postage_audit where order_id = sample_order;
  if recorded_count <> 1 or audit_count <> 1 then
    raise exception 'Duplicate record or audit event: %, %', recorded_count, audit_count;
  end if;

  begin
    perform public.record_external_order_postage(sample_order, 295, sample_operator);
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

  raise notice 'PASS: idempotent write, unique audit, conflict rejection, immutable evidence';
end;
$$;
rollback;
