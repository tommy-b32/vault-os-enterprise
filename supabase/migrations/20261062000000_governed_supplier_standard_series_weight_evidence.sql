begin;

-- Supplier-standard series/pack evidence only. It is deliberately separate
-- from freight chargeable weight, measured shipment weight, and all costs.
create table public.vault_supplier_product_type_standard_series_weight_evidence (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  pack_profile_id text not null references public.vault_pack_profiles(id) on delete restrict,
  units_per_pack integer not null check (units_per_pack > 0),
  standard_series_weight_kg numeric(12,3) not null check (standard_series_weight_kg > 0),
  evidence_classification text not null check (evidence_classification='supplier_standard_series_weight'),
  source_evidence_snapshot jsonb not null check (jsonb_typeof(source_evidence_snapshot)='object' and source_evidence_snapshot<>'{}'::jsonb),
  source_note text not null check (nullif(trim(source_note),'') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key),'') is not null),
  supersedes_evidence_id uuid references public.vault_supplier_product_type_standard_series_weight_evidence(id) on delete restrict,
  unique (supplier_id,cost_type_id,pack_profile_id,idempotency_key)
);

create trigger supplier_product_type_standard_series_weight_evidence_immutable
before update or delete on public.vault_supplier_product_type_standard_series_weight_evidence
for each row execute function public.reject_purchase_cost_evidence_mutation();

create function public.record_supplier_product_type_standard_series_weight_evidence(authoritative_payload jsonb)
returns table(standard_series_weight_evidence_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_supplier uuid; v_cost_type text; v_pack_profile text; v_units integer; v_weight numeric; v_operator uuid; v_key text;
  v_snapshot jsonb; v_note text; v_supersedes uuid; v_canonical_units integer; v_current_count integer;
  existing public.vault_supplier_product_type_standard_series_weight_evidence%rowtype;
  superseded public.vault_supplier_product_type_standard_series_weight_evidence%rowtype;
  current_row public.vault_supplier_product_type_standard_series_weight_evidence%rowtype;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_PAYLOAD_INVALID'; end if;
  begin
    v_supplier:=nullif(authoritative_payload->>'supplier_id','')::uuid; v_cost_type:=nullif(trim(authoritative_payload->>'cost_type_id'),'');
    v_pack_profile:=nullif(trim(authoritative_payload->>'pack_profile_id'),''); v_units:=nullif(authoritative_payload->>'units_per_pack','')::integer;
    v_weight:=nullif(authoritative_payload->>'standard_series_weight_kg','')::numeric; v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid;
    v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),''); v_snapshot:=authoritative_payload->'source_evidence_snapshot';
    v_note:=nullif(trim(authoritative_payload->>'source_note'),''); v_supersedes:=nullif(authoritative_payload->>'supersedes_evidence_id','')::uuid;
  exception when others then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_PAYLOAD_INVALID'; end;
  if v_supplier is null or v_cost_type is null or v_pack_profile is null or v_units is null or v_weight is null or v_operator is null or v_key is null or v_snapshot is null or v_note is null then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_PAYLOAD_INVALID'; end if;
  if v_units<=0 or v_weight<=0 or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_SEMANTICS_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'An active operator is required'; end if;
  if not exists(select 1 from public.vault_suppliers s where s.id=v_supplier and s.is_active) then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_SUPPLIER_INVALID'; end if;
  select p.units_per_pack into v_canonical_units
  from public.vault_cost_types t
  join public.vault_cost_type_pack_profile_compatibilities c on c.cost_type_id=t.id and c.pack_profile_id=v_pack_profile and c.active
  join public.vault_pack_profiles p on p.id=c.pack_profile_id and p.active
  where t.id=v_cost_type and t.active;
  if v_canonical_units is null or v_canonical_units<>v_units then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_PROFILE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_supplier::text||':'||v_cost_type||':'||v_pack_profile,0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
  select * into existing from public.vault_supplier_product_type_standard_series_weight_evidence e
  where e.supplier_id=v_supplier and e.cost_type_id=v_cost_type and e.pack_profile_id=v_pack_profile and e.idempotency_key=v_key for update;
  if found then
    if existing.captured_by_operator_id<>v_operator or existing.units_per_pack<>v_units or existing.standard_series_weight_kg<>v_weight or existing.evidence_classification<>'supplier_standard_series_weight' or existing.source_evidence_snapshot is distinct from v_snapshot or existing.source_note<>v_note or existing.supersedes_evidence_id is distinct from v_supersedes then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_IDEMPOTENCY_CONFLICT'; end if;
    return query select existing.id,true; return;
  end if;
  select count(*) into v_current_count from public.vault_supplier_product_type_standard_series_weight_evidence e
  where e.supplier_id=v_supplier and e.cost_type_id=v_cost_type and e.pack_profile_id=v_pack_profile
    and not exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=e.id);
  if v_supersedes is null and v_current_count<>0 then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_CURRENT_EVIDENCE_EXISTS'; end if;
  if v_supersedes is not null then
    select * into superseded from public.vault_supplier_product_type_standard_series_weight_evidence where id=v_supersedes for update;
    if not found or superseded.supplier_id<>v_supplier or superseded.cost_type_id<>v_cost_type or superseded.pack_profile_id<>v_pack_profile or exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=v_supersedes) or v_current_count<>1 then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_SUPERSESSION_INVALID'; end if;
    select * into current_row from public.vault_supplier_product_type_standard_series_weight_evidence e
    where e.supplier_id=v_supplier and e.cost_type_id=v_cost_type and e.pack_profile_id=v_pack_profile
      and not exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=e.id)
    for update;
    if not found or current_row.id<>v_supersedes then raise exception 'SUPPLIER_STANDARD_SERIES_WEIGHT_SUPERSESSION_INVALID'; end if;
  end if;
  insert into public.vault_supplier_product_type_standard_series_weight_evidence(supplier_id,cost_type_id,pack_profile_id,units_per_pack,standard_series_weight_kg,evidence_classification,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key,supersedes_evidence_id)
  values(v_supplier,v_cost_type,v_pack_profile,v_units,v_weight,'supplier_standard_series_weight',v_snapshot,v_note,v_operator,v_key,v_supersedes)
  returning id into standard_series_weight_evidence_id;
  return query select standard_series_weight_evidence_id,false;
end $$;

create view public.vault_supplier_product_type_current_standard_series_weight_evidence with (security_invoker=true) as
select e.*
from public.vault_supplier_product_type_standard_series_weight_evidence e
where not exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=e.id);

alter table public.vault_supplier_product_type_standard_series_weight_evidence enable row level security;
revoke all on public.vault_supplier_product_type_standard_series_weight_evidence from public,anon,authenticated;
grant select,insert on public.vault_supplier_product_type_standard_series_weight_evidence to service_role;
revoke all on function public.record_supplier_product_type_standard_series_weight_evidence(jsonb) from public,anon,authenticated;
grant execute on function public.record_supplier_product_type_standard_series_weight_evidence(jsonb) to service_role;
revoke all on public.vault_supplier_product_type_current_standard_series_weight_evidence from public,anon,authenticated;
grant select on public.vault_supplier_product_type_current_standard_series_weight_evidence to service_role;
notify pgrst,'reload schema';
commit;
