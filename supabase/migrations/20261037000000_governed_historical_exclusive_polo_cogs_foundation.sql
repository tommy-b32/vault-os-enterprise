-- Additive historical evidence only. It does not alter direct COGS, Stage 1, or profitability.
begin;

insert into public.vault_historical_merchandise_classes(id, display_name, description)
values ('exclusive_polo', 'Exclusive Polo', 'Owner-attested historical class: polos purchased from supplier Exclusive.');

do $$
declare
  exclusive_supplier uuid;
  policy_id uuid := 'd479618e-1c39-4d57-903a-e31ca35b7765';
  policy_version_id uuid := '7c06b096-1f88-47fb-bba7-22d3fc46410a';
begin
  select id into exclusive_supplier from public.vault_suppliers where supplier_name = 'Exclusive';
  if exclusive_supplier is null then raise exception 'Historical Exclusive Polo foundation requires supplier Exclusive'; end if;
  if (select count(*) from public.vault_products where id in ('374eca12-5ca5-466e-aa0d-194ffbc86aa4','093fbada-eba4-4594-a47d-6aea4abea85d')) <> 2 then
    raise exception 'Historical Exclusive Polo foundation requires exactly the two owner-attested canonical products';
  end if;
  insert into public.vault_historical_supplier_batch_evidence(
    merchandise_class_id,supplier_id,batch_label,supplier_order_date,received_date,quantity,
    goods_cost_gbp,shipping_cost_gbp,landed_total_gbp,evidence_status,documentary_provenance
  ) values (
    'exclusive_polo',exclusive_supplier,'Polo''s EX','2026-06-12','2026-06-24',51,
    437.58,197.31,634.89,'valid_received',
    'Owner-supplied historical Exclusive Polo shipment record. Owner attests Monc Polo''s and Fred P Polo''s were purchased from Exclusive and supplied from this documented Exclusive Polo stock/batch.'
  );
  insert into public.vault_historical_merchandise_class_memberships(
    merchandise_class_id,product_id,effective_from,effective_through,membership_basis,provenance
  ) select 'exclusive_polo', id, '2026-06-24', '2026-09-05', 'owner_attested_historical_classification',
    'Tom, business owner and purchaser, explicitly attested this canonical product as Exclusive Polo historical merchandise supplied from the documented Exclusive Polo batch.'
  from public.vault_products where id in ('374eca12-5ca5-466e-aa0d-194ffbc86aa4','093fbada-eba4-4594-a47d-6aea4abea85d');
  insert into public.vault_historical_cogs_policies(id,merchandise_class_id,policy_name,status)
  values(policy_id,'exclusive_polo','Exclusive Polo historical batch-average recovery','governed_simulation_foundation');
  insert into public.vault_historical_cogs_policy_versions(
    id,policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status
  ) values(
    policy_version_id,policy_id,1,'latest_received_documented_batch_average','POLICY_DERIVED_BATCH_AVERAGE',
    '2026-06-24','2026-09-05',
    'Owner attestation recorded in immutable class memberships; Monc Polo''s and Fred P Polo''s are explicitly attested as supplied from the documented Exclusive Polo batch.','governed_simulation_foundation'
  );
  insert into public.vault_historical_cogs_policy_batch_evidence(policy_version_id,batch_evidence_id)
  select policy_version_id,id from public.vault_historical_supplier_batch_evidence where merchandise_class_id='exclusive_polo';
end $$;

create view public.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions
with (security_barrier = true, security_invoker = true) as
select line.id as order_line_id, orders.id as order_id, orders.shopify_order_id, orders.shopify_created_at as sale_timestamp,
  product.id as product_id, product.title as product_name, membership.id as membership_id,
  version.id as policy_version_id, policy.id as policy_id, version.methodology, version.evidence_method,
  batch.id as batch_evidence_id, batch.received_date as selected_batch_received_date,
  (batch.landed_total_gbp / batch.quantity) as unit_policy_derived_cogs_gbp, line.cogs_quantity as quantity,
  line.cogs_quantity * (batch.landed_total_gbp / batch.quantity) as total_policy_derived_cogs_gbp,
  line.net_line_revenue as canonical_net_line_revenue_gbp,
  membership.provenance as membership_provenance, batch.documentary_provenance as batch_provenance,
  'POLICY SIMULATION — NOT VERIFIED STAGE 1 COGS'::text as classification
from public.vault_historical_cogs_policy_versions version
join public.vault_historical_cogs_policies policy on policy.id=version.policy_id and policy.status='governed_simulation_foundation'
join public.vault_shopify_orders orders on orders.shopify_created_at >= (version.sale_period_from::timestamp at time zone 'Europe/London')
  and orders.shopify_created_at < ((version.sale_period_through + 1)::timestamp at time zone 'Europe/London')
  and orders.cancelled_at is null and orders.metadata->>'test'='false'
join public.vault_shopify_order_lines line on line.order_id=orders.id and line.cogs_quantity>0
join public.vault_variants variant on variant.source='shopify' and variant.source_variant_id=line.shopify_variant_id
join public.vault_products product on product.id=variant.product_id and product.source='shopify'
  and (line.shopify_product_id is null or product.source_product_id=line.shopify_product_id)
join public.vault_historical_merchandise_class_memberships membership on membership.product_id=product.id
  and membership.merchandise_class_id=policy.merchandise_class_id
  and (orders.shopify_created_at at time zone 'Europe/London')::date between membership.effective_from and membership.effective_through
join lateral (
  select evidence.* from public.vault_historical_cogs_policy_batch_evidence link
  join public.vault_historical_supplier_batch_evidence evidence on evidence.id=link.batch_evidence_id
  where link.policy_version_id=version.id and evidence.evidence_status='valid_received'
    and (evidence.received_date::timestamp at time zone 'Europe/London')<=orders.shopify_created_at
  order by evidence.received_date desc,evidence.id desc limit 1
) batch on true
where version.status='governed_simulation_foundation';

revoke all on public.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions from public, anon, authenticated;
grant select on public.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions to service_role;
comment on view public.vault_historical_exclusive_polo_policy_derived_cogs_line_attributions is
  'Policy-derived historical Exclusive Polo COGS evidence only. It is not direct product COGS and does not alter Stage 1 eligibility or verified product profitability.';
notify pgrst, 'reload schema';
commit;
