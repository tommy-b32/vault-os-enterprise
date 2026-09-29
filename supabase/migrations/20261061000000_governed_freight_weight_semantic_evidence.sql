begin;

-- The legacy freight row remains immutable. This companion records what a
-- weight means; it never reinterprets the legacy shipment_weight column.
create table public.vault_purchase_order_freight_weight_evidence (
  id uuid primary key default gen_random_uuid(),
  freight_evidence_id uuid not null references public.vault_purchase_order_freight_evidence(id) on delete restrict,
  weight_basis_type text not null check (weight_basis_type in ('supplier_chargeable_weight','measured_shipment_weight')),
  weight_kg numeric(12,3) not null check (weight_kg > 0),
  actual_measured_shipment_weight_status text not null check (actual_measured_shipment_weight_status in ('unknown','recorded')),
  source_evidence_snapshot jsonb not null check (jsonb_typeof(source_evidence_snapshot)='object' and source_evidence_snapshot<>'{}'::jsonb),
  source_note text not null check (nullif(trim(source_note),'') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key),'') is not null),
  supersedes_evidence_id uuid references public.vault_purchase_order_freight_weight_evidence(id) on delete restrict,
  unique (freight_evidence_id,idempotency_key),
  -- A chargeable-weight assertion cannot claim it is a physical measurement;
  -- a physical measurement has its own evidence row and is necessarily recorded.
  check ((weight_basis_type='supplier_chargeable_weight' and actual_measured_shipment_weight_status='unknown') or (weight_basis_type='measured_shipment_weight' and actual_measured_shipment_weight_status='recorded'))
);

create trigger purchase_order_freight_weight_evidence_immutable
before update or delete on public.vault_purchase_order_freight_weight_evidence
for each row execute function public.reject_purchase_cost_evidence_mutation();

create function public.record_purchase_order_freight_weight_evidence(authoritative_payload jsonb)
returns table(freight_weight_evidence_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_freight uuid; v_po uuid; v_operator uuid; v_key text; v_basis text; v_weight numeric; v_status text;
  v_snapshot jsonb; v_note text; v_supersedes uuid; existing public.vault_purchase_order_freight_weight_evidence%rowtype;
  superseded public.vault_purchase_order_freight_weight_evidence%rowtype; v_current_count integer;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' then raise exception 'PO_FREIGHT_WEIGHT_PAYLOAD_INVALID'; end if;
  begin
    v_freight:=nullif(authoritative_payload->>'freight_evidence_id','')::uuid; v_po:=nullif(authoritative_payload->>'purchase_order_id','')::uuid;
    v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid; v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),'');
    v_basis:=nullif(trim(authoritative_payload->>'weight_basis_type'),''); v_weight:=nullif(authoritative_payload->>'weight_kg','')::numeric;
    v_status:=nullif(trim(authoritative_payload->>'actual_measured_shipment_weight_status'),''); v_snapshot:=authoritative_payload->'source_evidence_snapshot';
    v_note:=nullif(trim(authoritative_payload->>'source_note'),''); v_supersedes:=nullif(authoritative_payload->>'supersedes_evidence_id','')::uuid;
  exception when others then raise exception 'PO_FREIGHT_WEIGHT_PAYLOAD_INVALID'; end;
  if v_freight is null or v_po is null or v_operator is null or v_key is null or v_basis is null or v_weight is null or v_status is null or v_snapshot is null or v_note is null then raise exception 'PO_FREIGHT_WEIGHT_PAYLOAD_INVALID'; end if;
  if v_basis not in ('supplier_chargeable_weight','measured_shipment_weight') or v_weight<=0 or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb or (v_basis='supplier_chargeable_weight' and v_status<>'unknown') or (v_basis='measured_shipment_weight' and v_status<>'recorded') then raise exception 'PO_FREIGHT_WEIGHT_SEMANTICS_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_freight::text,0)); perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  if not exists(select 1 from public.vault_purchase_order_freight_evidence f where f.id=v_freight and f.purchase_order_id=v_po) then raise exception 'PO_FREIGHT_WEIGHT_FREIGHT_INVALID'; end if;
  select * into existing from public.vault_purchase_order_freight_weight_evidence e where e.freight_evidence_id=v_freight and e.idempotency_key=v_key for update;
  if found then
    if existing.captured_by_operator_id<>v_operator or existing.weight_basis_type<>v_basis or existing.weight_kg<>v_weight or existing.actual_measured_shipment_weight_status<>v_status or existing.source_evidence_snapshot is distinct from v_snapshot or existing.source_note<>v_note or existing.supersedes_evidence_id is distinct from v_supersedes then raise exception 'PO_FREIGHT_WEIGHT_IDEMPOTENCY_CONFLICT'; end if;
    return query select existing.id,true; return;
  end if;
  select count(*) into v_current_count from public.vault_purchase_order_freight_weight_evidence e where e.freight_evidence_id=v_freight and e.weight_basis_type=v_basis and not exists(select 1 from public.vault_purchase_order_freight_weight_evidence c where c.supersedes_evidence_id=e.id);
  if v_supersedes is null and v_current_count<>0 then raise exception 'PO_FREIGHT_WEIGHT_CURRENT_EVIDENCE_EXISTS'; end if;
  if v_supersedes is not null then
    select * into superseded from public.vault_purchase_order_freight_weight_evidence where id=v_supersedes for update;
    if not found or superseded.freight_evidence_id<>v_freight or superseded.weight_basis_type<>v_basis or exists(select 1 from public.vault_purchase_order_freight_weight_evidence c where c.supersedes_evidence_id=v_supersedes) or v_current_count<>1 then raise exception 'PO_FREIGHT_WEIGHT_SUPERSESSION_INVALID'; end if;
  end if;
  insert into public.vault_purchase_order_freight_weight_evidence(freight_evidence_id,weight_basis_type,weight_kg,actual_measured_shipment_weight_status,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key,supersedes_evidence_id)
  values(v_freight,v_basis,v_weight,v_status,v_snapshot,v_note,v_operator,v_key,v_supersedes) returning id into freight_weight_evidence_id;
  return query select freight_weight_evidence_id,false;
end $$;

create view public.vault_purchase_order_freight_weight_semantics with (security_invoker=true) as
with current_weight as (
  select e.* from public.vault_purchase_order_freight_weight_evidence e
  where not exists(select 1 from public.vault_purchase_order_freight_weight_evidence correction where correction.supersedes_evidence_id=e.id)
), summarized as (
  select freight_evidence_id,
    max(weight_kg) filter (where weight_basis_type='supplier_chargeable_weight') as supplier_chargeable_weight_kg,
    max(weight_kg) filter (where weight_basis_type='measured_shipment_weight') as actual_measured_shipment_weight_kg,
    case when count(*) filter (where weight_basis_type='measured_shipment_weight')=1 then 'recorded'
         when count(*) filter (where weight_basis_type='supplier_chargeable_weight')=1 then 'unknown' end as actual_measured_shipment_weight_status,
    count(*) filter (where weight_basis_type='supplier_chargeable_weight') as supplier_chargeable_count,
    count(*) filter (where weight_basis_type='measured_shipment_weight') as measured_count
  from current_weight group by freight_evidence_id
)
select f.id as freight_evidence_id,
  case when s.freight_evidence_id is null then 'legacy_weight_semantics_unclassified'
       when s.supplier_chargeable_count>1 or s.measured_count>1 then 'conflicting'
       else 'classified' end as semantic_state,
  s.supplier_chargeable_weight_kg,s.actual_measured_shipment_weight_kg,s.actual_measured_shipment_weight_status
from public.vault_purchase_order_freight_evidence f left join summarized s on s.freight_evidence_id=f.id;

-- Successor capture path: creates a new freight fact and its unambiguous
-- supplier-chargeable-weight companion in one transaction. Legacy RPC remains.
create function public.record_purchase_order_freight_evidence_with_chargeable_weight(authoritative_payload jsonb)
returns table(freight_evidence_id uuid,freight_weight_evidence_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare v_freight uuid; v_weight uuid; v_existing public.vault_purchase_order_freight_evidence%rowtype; v_key text; v_po uuid; v_supplier uuid; v_operator uuid; v_currency text; v_amount numeric; v_chargeable numeric; v_ref text; v_note text; v_snapshot jsonb; v_current_freight_count integer;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' then raise exception 'PO_FREIGHT_CHARGEABLE_PAYLOAD_INVALID'; end if;
  begin v_po:=nullif(authoritative_payload->>'purchase_order_id','')::uuid; v_supplier:=nullif(authoritative_payload->>'supplier_id','')::uuid; v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid; v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),''); v_currency:=upper(nullif(trim(authoritative_payload->>'currency'),'')); v_amount:=nullif(authoritative_payload->>'freight_amount','')::numeric; v_chargeable:=nullif(authoritative_payload->>'supplier_chargeable_weight_kg','')::numeric; v_ref:=nullif(trim(authoritative_payload->>'shipment_reference'),''); v_note:=nullif(trim(authoritative_payload->>'source_note'),''); v_snapshot:=authoritative_payload->'source_evidence_snapshot'; exception when others then raise exception 'PO_FREIGHT_CHARGEABLE_PAYLOAD_INVALID'; end;
  if v_po is null or v_supplier is null or v_operator is null or v_key is null or v_currency not in ('GBP','EUR','USD','TRY') or v_amount is null or v_amount<=0 or v_chargeable is null or v_chargeable<=0 or v_ref is null or v_note is null or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb then raise exception 'PO_FREIGHT_CHARGEABLE_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) or not exists(select 1 from public.vault_purchase_orders p where p.id=v_po and p.supplier_id=v_supplier and p.status='draft') then raise exception 'PO_FREIGHT_CHARGEABLE_PO_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_po::text,0)); perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  select * into v_existing from public.vault_purchase_order_freight_evidence f where f.purchase_order_id=v_po and f.idempotency_key=v_key for update;
  if found then
    if v_existing.supplier_id<>v_supplier or v_existing.currency<>v_currency or v_existing.freight_amount<>v_amount or v_existing.shipment_reference<>v_ref or v_existing.source_note<>v_note or v_existing.shipment_weight is not null then raise exception 'PO_FREIGHT_CHARGEABLE_IDEMPOTENCY_CONFLICT'; end if;
    select e.id into v_weight from public.vault_purchase_order_freight_weight_evidence e where e.freight_evidence_id=v_existing.id and e.idempotency_key=v_key and e.weight_basis_type='supplier_chargeable_weight' and e.weight_kg=v_chargeable and e.actual_measured_shipment_weight_status='unknown' and e.source_evidence_snapshot=v_snapshot and e.source_note=v_note and e.captured_by_operator_id=v_operator;
    if v_weight is null then raise exception 'PO_FREIGHT_CHARGEABLE_IDEMPOTENCY_CONFLICT'; end if;
    return query select v_existing.id,v_weight,true; return;
  end if;
  -- Existing freight evidence is append-only; this successor does not perform
  -- freight supersession and must never create a second current freight fact.
  select count(*) into v_current_freight_count
  from public.vault_purchase_order_freight_evidence f
  where f.purchase_order_id=v_po
    and not exists(select 1 from public.vault_purchase_order_freight_evidence correction where correction.supersedes_evidence_id=f.id);
  if v_current_freight_count<>0 then raise exception 'PO_FREIGHT_CHARGEABLE_CURRENT_FREIGHT_EXISTS'; end if;
  insert into public.vault_purchase_order_freight_evidence(purchase_order_id,supplier_id,shipment_reference,currency,freight_amount,shipment_weight,weight_unit,evidence_classification,source_note,captured_by_operator_id,idempotency_key)
  values(v_po,v_supplier,v_ref,v_currency,v_amount,null,null,'supplier_shipment_freight',v_note,v_operator,v_key) returning id into v_freight;
  insert into public.vault_purchase_order_freight_weight_evidence(freight_evidence_id,weight_basis_type,weight_kg,actual_measured_shipment_weight_status,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key)
  values(v_freight,'supplier_chargeable_weight',v_chargeable,'unknown',v_snapshot,v_note,v_operator,v_key) returning id into v_weight;
  return query select v_freight,v_weight,false;
end $$;

alter table public.vault_purchase_order_freight_weight_evidence enable row level security;
revoke all on public.vault_purchase_order_freight_weight_evidence from public,anon,authenticated;
grant select,insert on public.vault_purchase_order_freight_weight_evidence to service_role;
revoke all on function public.record_purchase_order_freight_weight_evidence(jsonb),public.record_purchase_order_freight_evidence_with_chargeable_weight(jsonb) from public,anon,authenticated;
grant execute on function public.record_purchase_order_freight_weight_evidence(jsonb),public.record_purchase_order_freight_evidence_with_chargeable_weight(jsonb) to service_role;
revoke all on public.vault_purchase_order_freight_weight_semantics from public,anon,authenticated;
grant select on public.vault_purchase_order_freight_weight_semantics to service_role;
notify pgrst,'reload schema';
commit;
