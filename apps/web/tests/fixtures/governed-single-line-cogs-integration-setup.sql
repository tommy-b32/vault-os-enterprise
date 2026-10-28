create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;

create table public.vault_operators (id uuid primary key, role text not null check (role in ('owner','operator','viewer')), is_active boolean not null default true);
create table public.vault_shopify_orders (id uuid primary key, shopify_created_at timestamptz not null);
create table public.vault_shopify_order_lines (
  id uuid primary key, order_id uuid not null references public.vault_shopify_orders(id),
  cogs_quantity integer not null, cogs_status text not null, cogs_history_id uuid,
  cogs_snapshotted_at timestamptz, unit_cogs_gbp numeric, total_cogs_gbp numeric
);
create table public.vault_historical_delivery_cost_batches (
  id uuid primary key, receipt_status text not null, validation_status text not null,
  approval_status text not null, received_at timestamptz, landed_cost_gbp numeric not null,
  received_quantity integer not null check (received_quantity > 0)
);
create view public.vault_historical_policy_derived_cogs_line_attributions as
select null::uuid order_line_id, null::uuid order_id, null::text evidence_method,
       null::numeric total_policy_derived_cogs_gbp, null::uuid policy_version_id, null::uuid batch_evidence_id
where false;
create view public.vault_historical_vaultcare_service_treatment_line_attributions as
select null::uuid order_line_id, null::uuid order_id, null::text evidence_method,
       null::numeric total_direct_sale_time_cogs_gbp, null::uuid historical_service_treatment_evidence_id
where false;
create view public.vault_stage1_sold_line_cogs_resolutions as
select null::uuid order_line_id, null::uuid order_id, null::text evidence_method,
       null::text cogs_classification, null::numeric resolved_cogs_gbp, null::text provenance_id
where false;

insert into public.vault_operators(id,role) values
 ('00000000-0000-0000-0000-000000000001','operator'), ('00000000-0000-0000-0000-000000000002','owner');
insert into public.vault_shopify_orders(id,shopify_created_at) values
 ('10000000-0000-0000-0000-000000000001','2026-10-23 05:16:01+00');
insert into public.vault_shopify_order_lines(id,order_id,cogs_quantity,cogs_status) values
 ('93061d97-9d55-467b-ae9d-15c9590b899b','10000000-0000-0000-0000-000000000001',1,'invalid_cost'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',1,'invalid_cost'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',1,'trusted');
insert into public.vault_historical_delivery_cost_batches(id,receipt_status,validation_status,approval_status,received_at,landed_cost_gbp,received_quantity) values
 ('eabb625c-4da1-4a30-9f41-b8a1e6f8bec7','RECEIVED','VALID','APPROVED','2026-09-10 00:00:00+00',553.65,50),
 ('40000000-0000-0000-0000-000000000004','RECEIVED','REVIEW','APPROVED','2026-09-10 00:00:00+00',553.65,50),
 ('50000000-0000-0000-0000-000000000005','RECEIVED','VALID','APPROVED','2026-10-24 00:00:00+00',553.65,50);
