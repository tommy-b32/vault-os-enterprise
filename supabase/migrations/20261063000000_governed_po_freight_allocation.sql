begin;

create table public.vault_purchase_order_freight_allocation_runs (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  freight_evidence_id uuid not null references public.vault_purchase_order_freight_evidence(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  freight_currency text not null check (freight_currency='USD'),
  freight_amount_minor_units bigint not null check (freight_amount_minor_units>0),
  allocation_method text not null check (allocation_method='supplier_standard_series_weight_pro_rata_largest_remainder'),
  allocation_method_version text not null check (allocation_method_version='v1'),
  total_allocation_basis_weight_kg numeric(18,6) not null check (total_allocation_basis_weight_kg>0),
  total_allocation_basis_milligrams bigint not null check (total_allocation_basis_milligrams>0),
  line_count integer not null check (line_count>0),
  source_evidence_snapshot jsonb not null check (jsonb_typeof(source_evidence_snapshot)='object' and source_evidence_snapshot<>'{}'::jsonb),
  source_note text not null check (nullif(trim(source_note),'') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key),'') is not null),
  supersedes_allocation_run_id uuid references public.vault_purchase_order_freight_allocation_runs(id) on delete restrict,
  unique (purchase_order_id,freight_evidence_id,idempotency_key),
  unique (id,purchase_order_id,freight_evidence_id,freight_currency,allocation_method,allocation_method_version)
);

create table public.vault_purchase_order_freight_allocation_lines (
  id uuid primary key default gen_random_uuid(),
  allocation_run_id uuid not null,
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id) on delete restrict,
  freight_evidence_id uuid not null references public.vault_purchase_order_freight_evidence(id) on delete restrict,
  merchandise_evidence_id uuid not null references public.vault_purchase_order_line_merchandise_cost_evidence(id) on delete restrict,
  standard_series_weight_evidence_id uuid not null references public.vault_supplier_product_type_standard_series_weight_evidence(id) on delete restrict,
  cost_type_id text not null references public.vault_cost_types(id) on delete restrict,
  pack_profile_id text not null references public.vault_pack_profiles(id) on delete restrict,
  pack_count integer not null check (pack_count>0),
  units_per_pack integer not null check (units_per_pack>0),
  standard_series_weight_kg numeric(18,6) not null check (standard_series_weight_kg>0),
  allocation_basis_weight_kg numeric(18,6) not null check (allocation_basis_weight_kg>0),
  allocation_basis_milligrams bigint not null check (allocation_basis_milligrams>0),
  entitlement_numerator bigint not null check (entitlement_numerator>0),
  entitlement_denominator bigint not null check (entitlement_denominator>0),
  floor_amount_minor_units bigint not null check (floor_amount_minor_units>=0),
  remainder_numerator bigint not null check (remainder_numerator>=0 and remainder_numerator<entitlement_denominator),
  remainder_rank integer not null check (remainder_rank>0),
  allocated_amount_minor_units bigint not null check (allocated_amount_minor_units>=floor_amount_minor_units and allocated_amount_minor_units<=floor_amount_minor_units+1),
  currency text not null check (currency='USD'),
  allocation_method text not null check (allocation_method='supplier_standard_series_weight_pro_rata_largest_remainder'),
  allocation_method_version text not null check (allocation_method_version='v1'),
  created_at timestamptz not null default clock_timestamp(),
  unique (allocation_run_id,purchase_order_line_id),
  unique (allocation_run_id,remainder_rank),
  foreign key (allocation_run_id,purchase_order_id,freight_evidence_id,currency,allocation_method,allocation_method_version)
    references public.vault_purchase_order_freight_allocation_runs(id,purchase_order_id,freight_evidence_id,freight_currency,allocation_method,allocation_method_version)
    on delete restrict
);

create index vault_purchase_order_freight_allocation_runs_current_lookup_idx
  on public.vault_purchase_order_freight_allocation_runs(purchase_order_id,freight_evidence_id);
create index vault_purchase_order_freight_allocation_runs_supersedes_idx
  on public.vault_purchase_order_freight_allocation_runs(supersedes_allocation_run_id)
  where supersedes_allocation_run_id is not null;

create trigger purchase_order_freight_allocation_runs_immutable
before update or delete on public.vault_purchase_order_freight_allocation_runs
for each row execute function public.reject_purchase_cost_evidence_mutation();
create trigger purchase_order_freight_allocation_lines_immutable
before update or delete on public.vault_purchase_order_freight_allocation_lines
for each row execute function public.reject_purchase_cost_evidence_mutation();

create view public.vault_purchase_order_current_freight_allocation_runs with (security_invoker=true) as
select r.*
from public.vault_purchase_order_freight_allocation_runs r
where not exists (
  select 1 from public.vault_purchase_order_freight_allocation_runs correction
  where correction.supersedes_allocation_run_id=r.id
);

create function public.capture_purchase_order_freight_allocation(authoritative_payload jsonb)
returns table(allocation_run_id uuid,idempotent boolean)
language plpgsql security invoker set search_path='' as $$
declare
  v_po uuid; v_freight uuid; v_operator uuid; v_key text; v_snapshot jsonb; v_note text; v_supersedes uuid;
  v_supplier uuid; v_freight_currency text; v_freight_amount numeric; v_freight_cents bigint;
  v_line_count integer; v_total_packs bigint; v_total_units bigint; v_total_basis_mg bigint; v_total_basis_kg numeric;
  v_current_run_count integer; v_current_freight_count integer; v_residual_cents bigint; v_inserted_lines integer;
  v_allocated_cents bigint; v_child_basis_mg bigint; v_duplicate_lines integer; v_rank integer:=0;
  v_run_id uuid;
  existing public.vault_purchase_order_freight_allocation_runs%rowtype;
  superseded public.vault_purchase_order_freight_allocation_runs%rowtype;
  current_run public.vault_purchase_order_freight_allocation_runs%rowtype;
  v_line record;
  v_weight_mg bigint; v_basis_mg bigint; v_numerator bigint; v_floor bigint; v_remainder bigint;
begin
  if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' then raise exception 'PO_FREIGHT_ALLOCATION_PAYLOAD_INVALID'; end if;
  if exists (
    select 1 from jsonb_object_keys(authoritative_payload) k(key)
    where k.key not in ('purchase_order_id','freight_evidence_id','operator_id','idempotency_key','source_evidence_snapshot','source_note','supersedes_allocation_run_id')
  ) then raise exception 'PO_FREIGHT_ALLOCATION_PAYLOAD_INVALID'; end if;
  begin
    v_po:=nullif(authoritative_payload->>'purchase_order_id','')::uuid;
    v_freight:=nullif(authoritative_payload->>'freight_evidence_id','')::uuid;
    v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid;
    v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),'');
    v_snapshot:=authoritative_payload->'source_evidence_snapshot';
    v_note:=nullif(trim(authoritative_payload->>'source_note'),'');
    v_supersedes:=nullif(authoritative_payload->>'supersedes_allocation_run_id','')::uuid;
  exception when others then raise exception 'PO_FREIGHT_ALLOCATION_PAYLOAD_INVALID'; end;
  if v_po is null or v_freight is null or v_operator is null or v_key is null or v_snapshot is null or v_note is null
     or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb then raise exception 'PO_FREIGHT_ALLOCATION_PAYLOAD_INVALID'; end if;
  if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'PO_FREIGHT_ALLOCATION_OPERATOR_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_po::text||':'||v_freight::text,0));
  perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));

  select * into existing from public.vault_purchase_order_freight_allocation_runs r
  where r.purchase_order_id=v_po and r.freight_evidence_id=v_freight and r.idempotency_key=v_key for update;
  if found then
    if existing.captured_by_operator_id<>v_operator or existing.source_evidence_snapshot is distinct from v_snapshot
       or existing.source_note<>v_note or existing.supersedes_allocation_run_id is distinct from v_supersedes then
      raise exception 'PO_FREIGHT_ALLOCATION_IDEMPOTENCY_CONFLICT';
    end if;
    return query select existing.id,true; return;
  end if;

  select p.supplier_id into v_supplier from public.vault_purchase_orders p where p.id=v_po and p.status='draft' for share;
  if not found then raise exception 'PO_FREIGHT_ALLOCATION_PO_INVALID'; end if;
  select f.currency,f.freight_amount into v_freight_currency,v_freight_amount
  from public.vault_purchase_order_freight_evidence f where f.id=v_freight and f.purchase_order_id=v_po for share;
  if not found then raise exception 'PO_FREIGHT_ALLOCATION_FREIGHT_INVALID'; end if;
  if not exists(select 1 from public.vault_purchase_order_freight_evidence f where f.id=v_freight and f.supplier_id=v_supplier) then
    raise exception 'PO_FREIGHT_ALLOCATION_FREIGHT_INVALID';
  end if;
  select count(*) into v_current_freight_count from public.vault_purchase_order_freight_evidence f
  where f.purchase_order_id=v_po and not exists(select 1 from public.vault_purchase_order_freight_evidence correction where correction.supersedes_evidence_id=f.id);
  if v_current_freight_count<>1 or not exists(
    select 1 from public.vault_purchase_order_freight_evidence f where f.id=v_freight and f.purchase_order_id=v_po
      and not exists(select 1 from public.vault_purchase_order_freight_evidence correction where correction.supersedes_evidence_id=f.id)
  ) then raise exception 'PO_FREIGHT_ALLOCATION_CURRENT_FREIGHT_INVALID'; end if;
  if v_freight_currency<>'USD' or v_freight_amount<=0 or v_freight_amount*100<>trunc(v_freight_amount*100)
     or v_freight_amount*100>9223372036854775807 then raise exception 'PO_FREIGHT_ALLOCATION_FREIGHT_AMOUNT_INVALID'; end if;
  v_freight_cents:=(v_freight_amount*100)::bigint;

  select count(*)::integer,coalesce(sum(l.recommended_packs),0),coalesce(sum(l.recommended_units),0)
    into v_line_count,v_total_packs,v_total_units
  from public.vault_purchase_order_lines l where l.purchase_order_id=v_po;
  if v_line_count=0 or exists(
    select 1 from public.vault_purchase_order_lines l
    where l.purchase_order_id=v_po and (l.recommended_packs<=0 or l.units_per_pack is null or l.units_per_pack<=0
      or l.recommended_units is null or l.recommended_units<>l.recommended_packs*l.units_per_pack
      or (select count(*) from public.vault_purchase_order_line_merchandise_cost_evidence m where m.purchase_order_line_id=l.id)<>1
      or not exists(select 1 from public.vault_purchase_order_line_merchandise_cost_evidence m where m.purchase_order_line_id=l.id
        and m.purchase_order_id=v_po and m.supplier_id=v_supplier and m.pack_count=l.recommended_packs
        and m.units_per_pack=l.units_per_pack and m.pack_count>0 and m.units_per_pack>0)
      or (select count(*) from public.vault_supplier_product_type_current_standard_series_weight_evidence w
          join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
          where w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id
            and w.units_per_pack=m.units_per_pack and w.standard_series_weight_kg>0)<>1
    )
  ) then raise exception 'PO_FREIGHT_ALLOCATION_LINE_EVIDENCE_INVALID'; end if;
  -- vault_purchase_orders has no governed total-units column. Its total_packs
  -- is reconciled here; total units are authoritatively derived from governed
  -- line quantities after each line has reconciled packs x units_per_pack.
  if v_total_units<=0 or not exists(select 1 from public.vault_purchase_orders p where p.id=v_po and p.total_packs=v_total_packs) then
    raise exception 'PO_FREIGHT_ALLOCATION_PO_QUANTITY_INVALID';
  end if;

  -- Validate exact milligram representation before any bigint cast or basis
  -- arithmetic. The following row locks hold the exact current source rows
  -- until capture completes, preventing governed standard-weight supersession.
  if exists(
    select 1
    from public.vault_purchase_order_lines l
    join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
    join public.vault_supplier_product_type_standard_series_weight_evidence w
      on w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id and w.units_per_pack=m.units_per_pack
      and not exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=w.id)
    where l.purchase_order_id=v_po and (
      m.pack_count<=0 or w.standard_series_weight_kg<=0
      or w.standard_series_weight_kg*1000000<>trunc(w.standard_series_weight_kg*1000000)
      or w.standard_series_weight_kg*1000000>9223372036854775807
      or w.standard_series_weight_kg*1000000>9223372036854775807/m.pack_count
    )
  ) then raise exception 'PO_FREIGHT_ALLOCATION_WEIGHT_INVALID'; end if;
  perform 1
  from public.vault_purchase_order_lines l
  join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
  join public.vault_supplier_product_type_standard_series_weight_evidence w
    on w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id and w.units_per_pack=m.units_per_pack
    and not exists(select 1 from public.vault_supplier_product_type_standard_series_weight_evidence correction where correction.supersedes_evidence_id=w.id)
  where l.purchase_order_id=v_po
  for share of w;
  select coalesce(sum((w.standard_series_weight_kg*1000000)::bigint*m.pack_count),0) into v_total_basis_mg
  from public.vault_purchase_order_lines l
  join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
  join public.vault_supplier_product_type_current_standard_series_weight_evidence w
    on w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id and w.units_per_pack=m.units_per_pack
  where l.purchase_order_id=v_po;
  if v_total_basis_mg<=0 then raise exception 'PO_FREIGHT_ALLOCATION_WEIGHT_INVALID'; end if;
  if v_freight_cents>9223372036854775807/v_total_basis_mg then raise exception 'PO_FREIGHT_ALLOCATION_ARITHMETIC_OVERFLOW'; end if;
  v_total_basis_kg:=v_total_basis_mg::numeric/1000000;

  select count(*) into v_current_run_count from public.vault_purchase_order_freight_allocation_runs r
  where r.purchase_order_id=v_po and r.freight_evidence_id=v_freight
    and not exists(select 1 from public.vault_purchase_order_freight_allocation_runs correction where correction.supersedes_allocation_run_id=r.id);
  if v_supersedes is null and v_current_run_count<>0 then raise exception 'PO_FREIGHT_ALLOCATION_CURRENT_RUN_EXISTS'; end if;
  if v_supersedes is not null then
    select * into superseded from public.vault_purchase_order_freight_allocation_runs where id=v_supersedes for update;
    if not found or superseded.purchase_order_id<>v_po or superseded.freight_evidence_id<>v_freight
       or exists(select 1 from public.vault_purchase_order_freight_allocation_runs correction where correction.supersedes_allocation_run_id=v_supersedes)
       or v_current_run_count<>1 then raise exception 'PO_FREIGHT_ALLOCATION_SUPERSESSION_INVALID'; end if;
    select * into current_run from public.vault_purchase_order_freight_allocation_runs r
    where r.purchase_order_id=v_po and r.freight_evidence_id=v_freight
      and not exists(select 1 from public.vault_purchase_order_freight_allocation_runs correction where correction.supersedes_allocation_run_id=r.id)
    for update;
    if not found or current_run.id<>v_supersedes then raise exception 'PO_FREIGHT_ALLOCATION_SUPERSESSION_INVALID'; end if;
  end if;

  insert into public.vault_purchase_order_freight_allocation_runs(
    purchase_order_id,freight_evidence_id,supplier_id,freight_currency,freight_amount_minor_units,allocation_method,allocation_method_version,
    total_allocation_basis_weight_kg,total_allocation_basis_milligrams,line_count,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key,supersedes_allocation_run_id
  ) values (
    v_po,v_freight,v_supplier,'USD',v_freight_cents,'supplier_standard_series_weight_pro_rata_largest_remainder','v1',
    v_total_basis_kg,v_total_basis_mg,v_line_count,v_snapshot,v_note,v_operator,v_key,v_supersedes
  ) returning id into v_run_id;

  select v_freight_cents-coalesce(sum((v_freight_cents*((w.standard_series_weight_kg*1000000)::bigint*m.pack_count))/v_total_basis_mg),0)
    into v_residual_cents
  from public.vault_purchase_order_lines l
  join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
  join public.vault_supplier_product_type_current_standard_series_weight_evidence w on w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id and w.units_per_pack=m.units_per_pack
  where l.purchase_order_id=v_po;
  if v_residual_cents<0 or v_residual_cents>v_line_count then raise exception 'PO_FREIGHT_ALLOCATION_CONSERVATION_INVALID'; end if;

  for v_line in
    select l.id as line_id,m.id as merchandise_id,m.cost_type_id,m.pack_profile_id,m.pack_count,m.units_per_pack,w.id as weight_id,w.standard_series_weight_kg,
      (w.standard_series_weight_kg*1000000)::bigint*m.pack_count as basis_mg
    from public.vault_purchase_order_lines l
    join public.vault_purchase_order_line_merchandise_cost_evidence m on m.purchase_order_line_id=l.id
    join public.vault_supplier_product_type_current_standard_series_weight_evidence w on w.supplier_id=v_supplier and w.cost_type_id=m.cost_type_id and w.pack_profile_id=m.pack_profile_id and w.units_per_pack=m.units_per_pack
    where l.purchase_order_id=v_po
    order by ((v_freight_cents*((w.standard_series_weight_kg*1000000)::bigint*m.pack_count))%v_total_basis_mg) desc,l.id asc
  loop
    v_rank:=v_rank+1; v_basis_mg:=v_line.basis_mg; v_numerator:=v_freight_cents*v_basis_mg;
    v_floor:=v_numerator/v_total_basis_mg; v_remainder:=v_numerator%v_total_basis_mg;
    insert into public.vault_purchase_order_freight_allocation_lines(
      allocation_run_id,purchase_order_id,purchase_order_line_id,freight_evidence_id,merchandise_evidence_id,standard_series_weight_evidence_id,
      cost_type_id,pack_profile_id,pack_count,units_per_pack,standard_series_weight_kg,allocation_basis_weight_kg,allocation_basis_milligrams,
      entitlement_numerator,entitlement_denominator,floor_amount_minor_units,remainder_numerator,remainder_rank,allocated_amount_minor_units,
      currency,allocation_method,allocation_method_version
    ) values (
      v_run_id,v_po,v_line.line_id,v_freight,v_line.merchandise_id,v_line.weight_id,v_line.cost_type_id,v_line.pack_profile_id,
      v_line.pack_count,v_line.units_per_pack,v_line.standard_series_weight_kg,v_basis_mg::numeric/1000000,v_basis_mg,v_numerator,v_total_basis_mg,
      v_floor,v_remainder,v_rank,v_floor+case when v_rank<=v_residual_cents then 1 else 0 end,
      'USD','supplier_standard_series_weight_pro_rata_largest_remainder','v1'
    );
  end loop;

  select count(*),coalesce(sum(allocated_amount_minor_units),0),coalesce(sum(allocation_basis_milligrams),0),count(*)-count(distinct purchase_order_line_id)
    into v_inserted_lines,v_allocated_cents,v_child_basis_mg,v_duplicate_lines
  from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_run_id;
  if v_inserted_lines<>v_line_count or v_duplicate_lines<>0 or v_child_basis_mg<>v_total_basis_mg or v_allocated_cents<>v_freight_cents
     or exists(select 1 from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_run_id and (a.currency<>'USD' or a.freight_evidence_id<>v_freight or a.purchase_order_id<>v_po))
     or (select count(*) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and not exists(select 1 from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_run_id and a.purchase_order_line_id=l.id))<>0 then
    raise exception 'PO_FREIGHT_ALLOCATION_CONSERVATION_INVALID';
  end if;
  return query select v_run_id,false;
end $$;

alter table public.vault_purchase_order_freight_allocation_runs enable row level security;
alter table public.vault_purchase_order_freight_allocation_lines enable row level security;
revoke all on public.vault_purchase_order_freight_allocation_runs,public.vault_purchase_order_freight_allocation_lines from public,anon,authenticated;
grant select,insert on public.vault_purchase_order_freight_allocation_runs,public.vault_purchase_order_freight_allocation_lines to service_role;
revoke all on public.vault_purchase_order_current_freight_allocation_runs from public,anon,authenticated;
grant select on public.vault_purchase_order_current_freight_allocation_runs to service_role;
revoke all on function public.capture_purchase_order_freight_allocation(jsonb) from public,anon,authenticated;
grant execute on function public.capture_purchase_order_freight_allocation(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
