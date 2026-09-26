-- Governed historical COGS evidence only. This migration neither changes direct
-- product COGS nor participates in Stage 1 eligibility or profitability views.
begin;

create table public.vault_historical_merchandise_classes (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name text not null check (length(trim(display_name)) > 0),
  description text not null check (length(trim(description)) > 0),
  created_at timestamptz not null default clock_timestamp()
);

create table public.vault_historical_supplier_batch_evidence (
  id uuid primary key default gen_random_uuid(),
  merchandise_class_id text not null references public.vault_historical_merchandise_classes(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  batch_label text not null check (length(trim(batch_label)) > 0),
  supplier_order_date date not null,
  received_date date not null,
  quantity integer not null check (quantity > 0),
  goods_cost_gbp numeric(14,2) not null check (goods_cost_gbp >= 0),
  shipping_cost_gbp numeric(14,2) not null check (shipping_cost_gbp >= 0),
  landed_total_gbp numeric(14,2) not null check (landed_total_gbp >= 0),
  landed_cost_per_unit_gbp numeric(18,10) generated always as (landed_total_gbp / quantity) stored,
  currency text not null default 'GBP' check (currency = 'GBP'),
  evidence_status text not null check (evidence_status = 'valid_received'),
  documentary_provenance text not null check (length(trim(documentary_provenance)) > 0),
  captured_at timestamptz not null default clock_timestamp(),
  check (landed_total_gbp = goods_cost_gbp + shipping_cost_gbp),
  unique (merchandise_class_id, supplier_id, supplier_order_date, received_date, quantity, landed_total_gbp)
);

create table public.vault_historical_merchandise_class_memberships (
  id uuid primary key default gen_random_uuid(),
  merchandise_class_id text not null references public.vault_historical_merchandise_classes(id) on delete restrict,
  product_id uuid not null references public.vault_products(id) on delete restrict,
  effective_from date not null,
  effective_through date not null check (effective_through >= effective_from),
  membership_basis text not null check (membership_basis = 'owner_attested_historical_classification'),
  provenance text not null check (length(trim(provenance)) > 0),
  captured_at timestamptz not null default clock_timestamp(),
  unique (merchandise_class_id, product_id, effective_from, effective_through)
);

create table public.vault_historical_cogs_policies (
  id uuid primary key default gen_random_uuid(),
  merchandise_class_id text not null references public.vault_historical_merchandise_classes(id) on delete restrict,
  policy_name text not null check (length(trim(policy_name)) > 0),
  status text not null check (status = 'governed_simulation_foundation'),
  created_at timestamptz not null default clock_timestamp(),
  unique (merchandise_class_id, policy_name)
);

create table public.vault_historical_cogs_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.vault_historical_cogs_policies(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  methodology text not null check (methodology = 'latest_received_documented_batch_average'),
  evidence_method text not null check (evidence_method = 'POLICY_DERIVED_BATCH_AVERAGE'),
  sale_period_from date not null,
  sale_period_through date not null check (sale_period_through >= sale_period_from),
  membership_provenance text not null check (length(trim(membership_provenance)) > 0),
  status text not null check (status = 'governed_simulation_foundation'),
  created_at timestamptz not null default clock_timestamp(),
  unique (policy_id, version_number)
);

create table public.vault_historical_cogs_policy_batch_evidence (
  policy_version_id uuid not null references public.vault_historical_cogs_policy_versions(id) on delete restrict,
  batch_evidence_id uuid not null references public.vault_historical_supplier_batch_evidence(id) on delete restrict,
  linked_at timestamptz not null default clock_timestamp(),
  primary key (policy_version_id, batch_evidence_id)
);

create function public.reject_historical_cogs_evidence_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception 'Governed historical COGS evidence is immutable'; end; $$;

create trigger historical_class_immutable before update or delete on public.vault_historical_merchandise_classes for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_batch_evidence_immutable before update or delete on public.vault_historical_supplier_batch_evidence for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_membership_immutable before update or delete on public.vault_historical_merchandise_class_memberships for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_policy_immutable before update or delete on public.vault_historical_cogs_policies for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_policy_version_immutable before update or delete on public.vault_historical_cogs_policy_versions for each row execute function public.reject_historical_cogs_evidence_mutation();
create trigger historical_policy_batch_link_immutable before update or delete on public.vault_historical_cogs_policy_batch_evidence for each row execute function public.reject_historical_cogs_evidence_mutation();

alter table public.vault_historical_merchandise_classes enable row level security;
alter table public.vault_historical_supplier_batch_evidence enable row level security;
alter table public.vault_historical_merchandise_class_memberships enable row level security;
alter table public.vault_historical_cogs_policies enable row level security;
alter table public.vault_historical_cogs_policy_versions enable row level security;
alter table public.vault_historical_cogs_policy_batch_evidence enable row level security;
revoke all on public.vault_historical_merchandise_classes, public.vault_historical_supplier_batch_evidence, public.vault_historical_merchandise_class_memberships, public.vault_historical_cogs_policies, public.vault_historical_cogs_policy_versions, public.vault_historical_cogs_policy_batch_evidence from public, anon, authenticated, service_role;
grant select on public.vault_historical_merchandise_classes, public.vault_historical_supplier_batch_evidence, public.vault_historical_merchandise_class_memberships, public.vault_historical_cogs_policies, public.vault_historical_cogs_policy_versions, public.vault_historical_cogs_policy_batch_evidence to service_role;
revoke all on function public.reject_historical_cogs_evidence_mutation() from public, anon, authenticated, service_role;

insert into public.vault_historical_merchandise_classes(id, display_name, description)
values ('exclusive_tee', 'Exclusive Tee', 'Owner-attested historical class: T-shirts purchased from supplier Exclusive.') ;

do $$
declare exclusive_supplier uuid; policy_id uuid := '7f4b504b-9d85-4a61-8afc-1fb069f29a10'; policy_version_id uuid := '92c4bb10-6635-4b5e-a131-d451c11a5af5';
begin
  select id into exclusive_supplier from public.vault_suppliers where supplier_name = 'Exclusive';
  if exclusive_supplier is null then raise exception 'Historical COGS foundation requires supplier Exclusive'; end if;
  if (select count(*) from public.vault_products where id in ('5c9318eb-d273-44dc-b732-aeddaaa59d0b','c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c','23d19fdb-5e74-4609-9009-6b36cdc0b7d5','7d8fe898-fa72-43b4-9ab9-c7067e7287c6','224f4683-8147-4e93-a5ec-5a381ff8a1aa','746d5f16-614e-490e-b509-a0e61b0c2393','f75e4ab7-8431-4076-8aa2-c92fa5dad9f6','274e89ef-1532-410b-bdcd-866e9b4f32d4','87b460bb-b8b2-4dd9-b347-d39245ec69ca','dfd40a5b-38f4-4ebe-b76e-8daf5a260694','4b5652fa-3e28-4c9b-8b7c-97319ed895ad','9c2f40f9-aed9-42ab-8008-4b3421d7ba11','4e3dcdf3-13be-4f9c-8df6-2ec325f92dd6','a85a5c1a-291a-4c2f-81aa-f2b287d63432','5e39ef85-f024-44cb-b159-8bd57fe20692','55d7735f-4bb3-4d18-a0bc-e34793c53a1c','d508fd80-e4e8-4813-be92-eb24814b8f5c','92aada38-cd9d-4f9c-9786-9597afa26ca3')) <> 18 then raise exception 'Historical COGS foundation requires exactly 18 attested Exclusive Tee products'; end if;
  insert into public.vault_historical_supplier_batch_evidence(merchandise_class_id,supplier_id,batch_label,supplier_order_date,received_date,quantity,goods_cost_gbp,shipping_cost_gbp,landed_total_gbp,evidence_status,documentary_provenance) values
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-04-27','2026-05-01',145,1152.76,454.45,1607.21,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch.'),
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-05-25','2026-06-04',125,888.75,296.25,1185.00,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch.'),
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-06-12','2026-06-23',95,834.10,331.17,1165.27,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch.'),
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-06-30','2026-07-06',100,915.63,372.37,1288.00,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch.'),
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-08-06','2026-08-13',55,490.48,222.94,713.42,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch. Owner confirmed the landed total was corrected from a manual transcription error before admission.'),
  ('exclusive_tee',exclusive_supplier,'Tee''s EX','2026-08-20','2026-08-27',100,559.50,339.50,899.00,'valid_received','Owner-supplied historical Exclusive Tee shipment record; valid received batch.');
  insert into public.vault_historical_merchandise_class_memberships(merchandise_class_id,product_id,effective_from,effective_through,membership_basis,provenance)
  select 'exclusive_tee', id, '2026-05-04', '2026-09-05', 'owner_attested_historical_classification', 'Tom, business owner and purchaser, explicitly attested these 18 canonical products as Exclusive Tee historical merchandise for this period.' from public.vault_products where id in ('5c9318eb-d273-44dc-b732-aeddaaa59d0b','c8b33e7e-f3d2-4a2b-84c9-51c1942e3e5c','23d19fdb-5e74-4609-9009-6b36cdc0b7d5','7d8fe898-fa72-43b4-9ab9-c7067e7287c6','224f4683-8147-4e93-a5ec-5a381ff8a1aa','746d5f16-614e-490e-b509-a0e61b0c2393','f75e4ab7-8431-4076-8aa2-c92fa5dad9f6','274e89ef-1532-410b-bdcd-866e9b4f32d4','87b460bb-b8b2-4dd9-b347-d39245ec69ca','dfd40a5b-38f4-4ebe-b76e-8daf5a260694','4b5652fa-3e28-4c9b-8b7c-97319ed895ad','9c2f40f9-aed9-42ab-8008-4b3421d7ba11','4e3dcdf3-13be-4f9c-8df6-2ec325f92dd6','a85a5c1a-291a-4c2f-81aa-f2b287d63432','5e39ef85-f024-44cb-b159-8bd57fe20692','55d7735f-4bb3-4d18-a0bc-e34793c53a1c','d508fd80-e4e8-4813-be92-eb24814b8f5c','92aada38-cd9d-4f9c-9786-9597afa26ca3');
  insert into public.vault_historical_cogs_policies(id,merchandise_class_id,policy_name,status) values(policy_id,'exclusive_tee','Exclusive Tee historical batch-average recovery','governed_simulation_foundation');
  insert into public.vault_historical_cogs_policy_versions(id,policy_id,version_number,methodology,evidence_method,sale_period_from,sale_period_through,membership_provenance,status) values(policy_version_id,policy_id,1,'latest_received_documented_batch_average','POLICY_DERIVED_BATCH_AVERAGE','2026-05-04','2026-09-05','Owner attestation recorded in immutable class memberships; no individual supplier-batch/product attribution is claimed.','governed_simulation_foundation');
  insert into public.vault_historical_cogs_policy_batch_evidence(policy_version_id,batch_evidence_id) select policy_version_id,id from public.vault_historical_supplier_batch_evidence where merchandise_class_id='exclusive_tee';
end $$;

create view public.vault_historical_policy_derived_cogs_line_attributions
with (security_barrier = true, security_invoker = true) as
select line.id as order_line_id, orders.id as order_id, orders.shopify_order_id, orders.shopify_created_at as sale_timestamp,
  product.id as product_id, product.title as product_name, membership.id as membership_id,
  version.id as policy_version_id, policy.id as policy_id, version.methodology, version.evidence_method,
  batch.id as batch_evidence_id, batch.received_date as selected_batch_received_date,
  batch.landed_cost_per_unit_gbp as unit_policy_derived_cogs_gbp, line.cogs_quantity as quantity,
  line.cogs_quantity * batch.landed_cost_per_unit_gbp as total_policy_derived_cogs_gbp,
  line.net_line_revenue as canonical_net_line_revenue_gbp,
  membership.provenance as membership_provenance, batch.documentary_provenance as batch_provenance,
  'POLICY SIMULATION — NOT VERIFIED STAGE 1 COGS'::text as classification
from public.vault_historical_cogs_policy_versions version
join public.vault_historical_cogs_policies policy on policy.id=version.policy_id and policy.status='governed_simulation_foundation'
join public.vault_shopify_orders orders on orders.shopify_created_at >= (version.sale_period_from::timestamp at time zone 'Europe/London') and orders.shopify_created_at < ((version.sale_period_through + 1)::timestamp at time zone 'Europe/London') and orders.cancelled_at is null and orders.metadata->>'test'='false'
join public.vault_shopify_order_lines line on line.order_id=orders.id and line.cogs_quantity>0
join public.vault_variants variant on variant.source='shopify' and variant.source_variant_id=line.shopify_variant_id
join public.vault_products product on product.id=variant.product_id and product.source='shopify' and (line.shopify_product_id is null or product.source_product_id=line.shopify_product_id)
join public.vault_historical_merchandise_class_memberships membership on membership.product_id=product.id and membership.merchandise_class_id=policy.merchandise_class_id and (orders.shopify_created_at at time zone 'Europe/London')::date between membership.effective_from and membership.effective_through
join lateral (select evidence.* from public.vault_historical_cogs_policy_batch_evidence link join public.vault_historical_supplier_batch_evidence evidence on evidence.id=link.batch_evidence_id where link.policy_version_id=version.id and evidence.evidence_status='valid_received' and (evidence.received_date::timestamp at time zone 'Europe/London')<=orders.shopify_created_at order by evidence.received_date desc,evidence.id desc limit 1) batch on true
where version.status='governed_simulation_foundation';

revoke all on public.vault_historical_policy_derived_cogs_line_attributions from public, anon, authenticated;
grant select on public.vault_historical_policy_derived_cogs_line_attributions to service_role;
comment on view public.vault_historical_policy_derived_cogs_line_attributions is 'Policy-derived historical COGS evidence only. It is not direct product COGS and does not alter Stage 1 eligibility or verified product profitability.';
notify pgrst, 'reload schema';
commit;
