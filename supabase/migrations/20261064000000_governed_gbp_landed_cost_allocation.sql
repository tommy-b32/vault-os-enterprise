begin;

alter table public.vault_purchase_order_line_merchandise_cost_evidence
  add constraint vault_po_line_merchandise_evidence_source_identity_unique
  unique(id,purchase_order_id,purchase_order_line_id);
alter table public.vault_purchase_order_freight_allocation_lines
  add constraint vault_po_freight_allocation_line_source_identity_unique
  unique(id,allocation_run_id,purchase_order_id,purchase_order_line_id);

create table public.vault_purchase_order_gbp_landed_cost_allocation_runs (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  fx_commitment_evidence_id uuid not null references public.vault_purchase_order_fx_commitment_evidence(id) on delete restrict,
  freight_allocation_run_id uuid not null references public.vault_purchase_order_freight_allocation_runs(id) on delete restrict,
  source_currency text not null check (source_currency='USD'),
  target_currency text not null check (target_currency='GBP'),
  source_usd_liability_minor_units bigint not null check (source_usd_liability_minor_units>0),
  target_gbp_minor_units bigint not null check (target_gbp_minor_units>0),
  allocation_method text not null check (allocation_method='governed_usd_landed_cents_pro_rata_largest_remainder'),
  allocation_method_version text not null check (allocation_method_version='v1'),
  line_count integer not null check (line_count>0),
  source_evidence_snapshot jsonb not null check (jsonb_typeof(source_evidence_snapshot)='object' and source_evidence_snapshot<>'{}'::jsonb),
  source_note text not null check (nullif(trim(source_note),'') is not null),
  captured_by_operator_id uuid not null references public.vault_operators(id) on delete restrict,
  captured_at timestamptz not null default clock_timestamp(), created_at timestamptz not null default clock_timestamp(),
  idempotency_key text not null check (nullif(trim(idempotency_key),'') is not null),
  supersedes_allocation_run_id uuid references public.vault_purchase_order_gbp_landed_cost_allocation_runs(id) on delete restrict,
  unique(purchase_order_id,idempotency_key),
  unique(id,purchase_order_id,freight_allocation_run_id,source_currency,target_currency,allocation_method,allocation_method_version)
);

create table public.vault_purchase_order_gbp_landed_cost_allocation_lines (
  id uuid primary key default gen_random_uuid(), allocation_run_id uuid not null,
  purchase_order_id uuid not null references public.vault_purchase_orders(id) on delete restrict,
  purchase_order_line_id uuid not null references public.vault_purchase_order_lines(id) on delete restrict,
  merchandise_evidence_id uuid not null references public.vault_purchase_order_line_merchandise_cost_evidence(id) on delete restrict,
  freight_allocation_run_id uuid not null,
  freight_allocation_line_id uuid not null,
  source_merchandise_usd_minor_units bigint not null check(source_merchandise_usd_minor_units>0),
  source_freight_usd_minor_units bigint not null check(source_freight_usd_minor_units>=0),
  source_landed_usd_minor_units bigint not null check(source_landed_usd_minor_units>0),
  entitlement_numerator bigint not null check(entitlement_numerator>0), entitlement_denominator bigint not null check(entitlement_denominator>0),
  floor_gbp_minor_units bigint not null check(floor_gbp_minor_units>=0),
  remainder_numerator bigint not null check(remainder_numerator>=0 and remainder_numerator<entitlement_denominator),
  remainder_rank integer not null check(remainder_rank>0),
  allocated_gbp_minor_units bigint not null check(allocated_gbp_minor_units>=floor_gbp_minor_units and allocated_gbp_minor_units<=floor_gbp_minor_units+1),
  source_currency text not null check(source_currency='USD'), target_currency text not null check(target_currency='GBP'),
  allocation_method text not null check(allocation_method='governed_usd_landed_cents_pro_rata_largest_remainder'), allocation_method_version text not null check(allocation_method_version='v1'),
  created_at timestamptz not null default clock_timestamp(),
  unique(allocation_run_id,purchase_order_line_id), unique(allocation_run_id,remainder_rank),
  foreign key(allocation_run_id,purchase_order_id,freight_allocation_run_id,source_currency,target_currency,allocation_method,allocation_method_version)
    references public.vault_purchase_order_gbp_landed_cost_allocation_runs(id,purchase_order_id,freight_allocation_run_id,source_currency,target_currency,allocation_method,allocation_method_version) on delete restrict,
  foreign key(merchandise_evidence_id,purchase_order_id,purchase_order_line_id)
    references public.vault_purchase_order_line_merchandise_cost_evidence(id,purchase_order_id,purchase_order_line_id) on delete restrict,
  foreign key(freight_allocation_line_id,freight_allocation_run_id,purchase_order_id,purchase_order_line_id)
    references public.vault_purchase_order_freight_allocation_lines(id,allocation_run_id,purchase_order_id,purchase_order_line_id) on delete restrict
);
create index vault_purchase_order_gbp_landed_cost_allocation_runs_current_idx on public.vault_purchase_order_gbp_landed_cost_allocation_runs(purchase_order_id);
create trigger purchase_order_gbp_landed_cost_allocation_runs_immutable before update or delete on public.vault_purchase_order_gbp_landed_cost_allocation_runs for each row execute function public.reject_purchase_cost_evidence_mutation();
create trigger purchase_order_gbp_landed_cost_allocation_lines_immutable before update or delete on public.vault_purchase_order_gbp_landed_cost_allocation_lines for each row execute function public.reject_purchase_cost_evidence_mutation();

create view public.vault_purchase_order_current_gbp_landed_cost_allocation_runs with (security_invoker=true) as
select r.* from public.vault_purchase_order_gbp_landed_cost_allocation_runs r
where not exists(select 1 from public.vault_purchase_order_gbp_landed_cost_allocation_runs c where c.supersedes_allocation_run_id=r.id);

create function public.capture_purchase_order_gbp_landed_cost_allocation(authoritative_payload jsonb)
returns table(allocation_run_id uuid,idempotent boolean) language plpgsql security invoker set search_path='' as $$
declare
 v_po uuid; v_fx uuid; v_freight_run uuid; v_operator uuid; v_key text; v_snapshot jsonb; v_note text; v_supersedes uuid; v_supplier uuid;
 v_fx_row public.vault_purchase_order_fx_commitment_evidence%rowtype; v_freight public.vault_purchase_order_freight_allocation_runs%rowtype; v_existing public.vault_purchase_order_gbp_landed_cost_allocation_runs%rowtype; v_current public.vault_purchase_order_gbp_landed_cost_allocation_runs%rowtype;
 v_line_count integer; v_usd_total bigint; v_merch_total bigint; v_freight_total bigint; v_target bigint; v_floor_total bigint; v_residual bigint; v_rank integer:=0; v_run uuid; r record; v_num bigint; v_floor bigint; v_remainder bigint;
 v_freight_child_count integer; v_freight_child_distinct_lines integer; v_freight_child_distinct_ranks integer; v_freight_child_basis bigint; v_freight_child_total bigint;
 v_persisted_count integer; v_persisted_distinct_lines integer; v_persisted_distinct_ranks integer; v_persisted_merch_total bigint; v_persisted_freight_total bigint; v_persisted_usd_total bigint; v_persisted_gbp_total bigint;
begin
 if authoritative_payload is null or jsonb_typeof(authoritative_payload)<>'object' or exists(select 1 from jsonb_object_keys(authoritative_payload) k(key) where k.key not in ('purchase_order_id','fx_commitment_evidence_id','freight_allocation_run_id','operator_id','idempotency_key','source_evidence_snapshot','source_note','supersedes_allocation_run_id')) then raise exception 'PO_GBP_LANDED_ALLOCATION_PAYLOAD_INVALID'; end if;
 begin v_po:=nullif(authoritative_payload->>'purchase_order_id','')::uuid; v_fx:=nullif(authoritative_payload->>'fx_commitment_evidence_id','')::uuid; v_freight_run:=nullif(authoritative_payload->>'freight_allocation_run_id','')::uuid; v_operator:=nullif(authoritative_payload->>'operator_id','')::uuid; v_key:=nullif(trim(authoritative_payload->>'idempotency_key'),''); v_snapshot:=authoritative_payload->'source_evidence_snapshot'; v_note:=nullif(trim(authoritative_payload->>'source_note'),''); v_supersedes:=nullif(authoritative_payload->>'supersedes_allocation_run_id','')::uuid; exception when others then raise exception 'PO_GBP_LANDED_ALLOCATION_PAYLOAD_INVALID'; end;
 if v_po is null or v_fx is null or v_freight_run is null or v_operator is null or v_key is null or v_snapshot is null or v_note is null or jsonb_typeof(v_snapshot)<>'object' or v_snapshot='{}'::jsonb then raise exception 'PO_GBP_LANDED_ALLOCATION_PAYLOAD_INVALID'; end if;
 if not exists(select 1 from public.vault_operators o where o.id=v_operator and o.is_active) then raise exception 'PO_GBP_LANDED_ALLOCATION_OPERATOR_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('gbp-landed:'||v_po::text,0)); perform pg_advisory_xact_lock(hashtextextended(v_operator::text||':'||v_key,0));
 select * into v_existing from public.vault_purchase_order_gbp_landed_cost_allocation_runs x where x.purchase_order_id=v_po and x.idempotency_key=v_key for update;
 if found then if v_existing.captured_by_operator_id<>v_operator or v_existing.fx_commitment_evidence_id<>v_fx or v_existing.freight_allocation_run_id<>v_freight_run or v_existing.source_evidence_snapshot is distinct from v_snapshot or v_existing.source_note<>v_note or v_existing.supersedes_allocation_run_id is distinct from v_supersedes then raise exception 'PO_GBP_LANDED_ALLOCATION_IDEMPOTENCY_CONFLICT'; end if; return query select v_existing.id,true; return; end if;
 select supplier_id into v_supplier from public.vault_purchase_orders where id=v_po and status='draft' for share; if not found then raise exception 'PO_GBP_LANDED_ALLOCATION_PO_INVALID'; end if;
 select * into v_fx_row from public.vault_purchase_order_fx_commitment_evidence where id=v_fx and purchase_order_id=v_po and supplier_id=v_supplier for share;
 if not found or exists(select 1 from public.vault_purchase_order_fx_commitment_evidence c where c.supersedes_evidence_id=v_fx) or (select count(*) from public.vault_purchase_order_fx_commitment_evidence x where x.purchase_order_id=v_po and not exists(select 1 from public.vault_purchase_order_fx_commitment_evidence c where c.supersedes_evidence_id=x.id))<>1 then raise exception 'PO_GBP_LANDED_ALLOCATION_FX_INVALID'; end if;
 select * into v_freight from public.vault_purchase_order_freight_allocation_runs where id=v_freight_run and purchase_order_id=v_po and supplier_id=v_supplier for share;
 if not found or exists(select 1 from public.vault_purchase_order_freight_allocation_runs c where c.supersedes_allocation_run_id=v_freight_run) or (select count(*) from public.vault_purchase_order_current_freight_allocation_runs x where x.purchase_order_id=v_po)<>1 then raise exception 'PO_GBP_LANDED_ALLOCATION_FREIGHT_INVALID'; end if;
 if v_freight.freight_currency<>'USD' or v_freight.allocation_method<>'supplier_standard_series_weight_pro_rata_largest_remainder' or v_freight.allocation_method_version<>'v1' then raise exception 'PO_GBP_LANDED_ALLOCATION_FREIGHT_INVALID'; end if;
 if v_fx_row.source_currency<>'USD' or v_fx_row.gbp_commitment_amount<=0 or v_fx_row.gbp_commitment_amount*100<>trunc(v_fx_row.gbp_commitment_amount*100) or v_fx_row.gbp_commitment_amount*100>9223372036854775807 or v_fx_row.supplier_liability_amount<=0 or v_fx_row.supplier_liability_amount*100<>trunc(v_fx_row.supplier_liability_amount*100) or v_fx_row.supplier_liability_amount*100>9223372036854775807 then raise exception 'PO_GBP_LANDED_ALLOCATION_AMOUNT_INVALID'; end if;
 v_target:=(v_fx_row.gbp_commitment_amount*100)::bigint;
 perform 1 from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_freight_run for share;
 select count(*)::integer,count(distinct a.purchase_order_line_id)::integer,count(distinct a.remainder_rank)::integer,coalesce(sum(a.allocation_basis_milligrams),0),coalesce(sum(a.allocated_amount_minor_units),0) into v_freight_child_count,v_freight_child_distinct_lines,v_freight_child_distinct_ranks,v_freight_child_basis,v_freight_child_total from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_freight_run;
 if v_freight_child_count<>v_freight.line_count or v_freight_child_distinct_lines<>v_freight.line_count or v_freight_child_distinct_ranks<>v_freight.line_count or v_freight_child_basis<>v_freight.total_allocation_basis_milligrams or v_freight_child_total<>v_freight.freight_amount_minor_units then raise exception 'PO_GBP_LANDED_ALLOCATION_FREIGHT_INVALID'; end if;
 if (select count(*) from public.vault_purchase_order_lines l where l.purchase_order_id=v_po)<>v_freight_child_count or exists(select 1 from public.vault_purchase_order_lines l where l.purchase_order_id=v_po and (l.recommended_packs<=0 or l.units_per_pack<=0 or l.recommended_units<>l.recommended_packs*l.units_per_pack or (select count(*) from public.vault_purchase_order_line_merchandise_cost_evidence m where m.purchase_order_line_id=l.id)<>1 or not exists(select 1 from public.vault_purchase_order_line_merchandise_cost_evidence m where m.purchase_order_line_id=l.id and m.purchase_order_id=v_po and m.supplier_id=v_supplier and m.supplier_currency='USD' and m.pack_count=l.recommended_packs and m.units_per_pack=l.units_per_pack and m.merchandise_line_total>0 and m.merchandise_line_total*100=trunc(m.merchandise_line_total*100)) or (select count(*) from public.vault_purchase_order_freight_allocation_lines a where a.allocation_run_id=v_freight_run and a.purchase_order_line_id=l.id and a.purchase_order_id=v_po and a.currency='USD' and a.allocated_amount_minor_units>=0 and a.pack_count=l.recommended_packs and a.units_per_pack=l.units_per_pack and a.pack_count*a.units_per_pack=l.recommended_units)<>1)) then raise exception 'PO_GBP_LANDED_ALLOCATION_LINE_INVALID'; end if;
 select count(*)::integer,sum((m.merchandise_line_total*100)::bigint),sum(a.allocated_amount_minor_units),sum((m.merchandise_line_total*100)::bigint+a.allocated_amount_minor_units) into v_line_count,v_merch_total,v_freight_total,v_usd_total from public.vault_purchase_order_line_merchandise_cost_evidence m join public.vault_purchase_order_freight_allocation_lines a on a.purchase_order_line_id=m.purchase_order_line_id and a.allocation_run_id=v_freight_run where m.purchase_order_id=v_po;
 if v_line_count=0 or v_freight_total<>v_freight.freight_amount_minor_units or v_usd_total<>(v_fx_row.supplier_liability_amount*100)::bigint or v_target>9223372036854775807/v_usd_total then raise exception 'PO_GBP_LANDED_ALLOCATION_RECONCILIATION_INVALID'; end if;
 if v_supersedes is null and (select count(*) from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs where purchase_order_id=v_po)<>0 then raise exception 'PO_GBP_LANDED_ALLOCATION_CURRENT_RUN_EXISTS'; end if;
 if v_supersedes is not null then select * into v_current from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs where purchase_order_id=v_po for update; if not found or v_current.id<>v_supersedes or (select count(*) from public.vault_purchase_order_current_gbp_landed_cost_allocation_runs where purchase_order_id=v_po)<>1 then raise exception 'PO_GBP_LANDED_ALLOCATION_SUPERSESSION_INVALID'; end if; end if;
 insert into public.vault_purchase_order_gbp_landed_cost_allocation_runs(purchase_order_id,supplier_id,fx_commitment_evidence_id,freight_allocation_run_id,source_currency,target_currency,source_usd_liability_minor_units,target_gbp_minor_units,allocation_method,allocation_method_version,line_count,source_evidence_snapshot,source_note,captured_by_operator_id,idempotency_key,supersedes_allocation_run_id) values(v_po,v_supplier,v_fx,v_freight_run,'USD','GBP',v_usd_total,v_target,'governed_usd_landed_cents_pro_rata_largest_remainder','v1',v_line_count,v_snapshot,v_note,v_operator,v_key,v_supersedes) returning id into v_run;
 select v_target-sum((v_target*((m.merchandise_line_total*100)::bigint+a.allocated_amount_minor_units))/v_usd_total) into v_residual from public.vault_purchase_order_line_merchandise_cost_evidence m join public.vault_purchase_order_freight_allocation_lines a on a.purchase_order_line_id=m.purchase_order_line_id and a.allocation_run_id=v_freight_run where m.purchase_order_id=v_po;
 for r in select m.id merch_id,a.id freight_line_id,m.purchase_order_line_id,(m.merchandise_line_total*100)::bigint merch,a.allocated_amount_minor_units freight,((m.merchandise_line_total*100)::bigint+a.allocated_amount_minor_units) landed from public.vault_purchase_order_line_merchandise_cost_evidence m join public.vault_purchase_order_freight_allocation_lines a on a.purchase_order_line_id=m.purchase_order_line_id and a.allocation_run_id=v_freight_run where m.purchase_order_id=v_po order by ((v_target*((m.merchandise_line_total*100)::bigint+a.allocated_amount_minor_units))%v_usd_total) desc,m.purchase_order_line_id asc loop v_rank:=v_rank+1; v_num:=v_target*r.landed; v_floor:=v_num/v_usd_total; v_remainder:=v_num%v_usd_total; insert into public.vault_purchase_order_gbp_landed_cost_allocation_lines(allocation_run_id,purchase_order_id,purchase_order_line_id,merchandise_evidence_id,freight_allocation_run_id,freight_allocation_line_id,source_merchandise_usd_minor_units,source_freight_usd_minor_units,source_landed_usd_minor_units,entitlement_numerator,entitlement_denominator,floor_gbp_minor_units,remainder_numerator,remainder_rank,allocated_gbp_minor_units,source_currency,target_currency,allocation_method,allocation_method_version) values(v_run,v_po,r.purchase_order_line_id,r.merch_id,v_freight_run,r.freight_line_id,r.merch,r.freight,r.landed,v_num,v_usd_total,v_floor,v_remainder,v_rank,v_floor+case when v_rank<=v_residual then 1 else 0 end,'USD','GBP','governed_usd_landed_cents_pro_rata_largest_remainder','v1'); end loop;
 select count(*)::integer,count(distinct purchase_order_line_id)::integer,count(distinct remainder_rank)::integer,coalesce(sum(source_merchandise_usd_minor_units),0),coalesce(sum(source_freight_usd_minor_units),0),coalesce(sum(source_landed_usd_minor_units),0),coalesce(sum(allocated_gbp_minor_units),0) into v_persisted_count,v_persisted_distinct_lines,v_persisted_distinct_ranks,v_persisted_merch_total,v_persisted_freight_total,v_persisted_usd_total,v_persisted_gbp_total from public.vault_purchase_order_gbp_landed_cost_allocation_lines where allocation_run_id=v_run;
 if v_persisted_count<>v_line_count or v_persisted_distinct_lines<>v_line_count or v_persisted_distinct_ranks<>v_line_count or v_persisted_merch_total<>v_merch_total or v_persisted_freight_total<>v_freight.freight_amount_minor_units or v_persisted_usd_total<>(v_fx_row.supplier_liability_amount*100)::bigint or v_persisted_gbp_total<>v_target or v_persisted_merch_total+v_persisted_freight_total<>v_persisted_usd_total then raise exception 'PO_GBP_LANDED_ALLOCATION_CONSERVATION_INVALID'; end if;
 return query select v_run,false;
end $$;

alter table public.vault_purchase_order_gbp_landed_cost_allocation_runs enable row level security;
alter table public.vault_purchase_order_gbp_landed_cost_allocation_lines enable row level security;
revoke all on public.vault_purchase_order_gbp_landed_cost_allocation_runs,public.vault_purchase_order_gbp_landed_cost_allocation_lines from public,anon,authenticated;
grant select,insert on public.vault_purchase_order_gbp_landed_cost_allocation_runs,public.vault_purchase_order_gbp_landed_cost_allocation_lines to service_role;
revoke all on public.vault_purchase_order_current_gbp_landed_cost_allocation_runs from public,anon,authenticated;
grant select on public.vault_purchase_order_current_gbp_landed_cost_allocation_runs to service_role;
revoke all on function public.capture_purchase_order_gbp_landed_cost_allocation(jsonb) from public,anon,authenticated;
grant execute on function public.capture_purchase_order_gbp_landed_cost_allocation(jsonb) to service_role;
notify pgrst,'reload schema';
commit;
