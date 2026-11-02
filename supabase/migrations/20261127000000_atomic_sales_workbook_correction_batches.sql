create table public.vault_sales_workbook_correction_batches (
  id uuid primary key default gen_random_uuid(), workbook_id uuid not null references public.vault_sales_workbooks(id),
  workbook_hash_before text not null check (workbook_hash_before ~ '^[0-9a-f]{64}$'), expected_version integer not null check (expected_version > 0),
  created_by_operator_id uuid not null references public.vault_operators(id), created_at timestamptz not null default now()
);
alter table public.vault_sales_workbook_correction_batches enable row level security;
revoke all on public.vault_sales_workbook_correction_batches from public, anon, authenticated;
grant select, insert on public.vault_sales_workbook_correction_batches to service_role;
create trigger vault_sales_workbook_correction_batches_immutable before update or delete on public.vault_sales_workbook_correction_batches for each row execute function public.reject_sales_workbook_order_correction_mutation();
alter table public.vault_sales_workbook_order_corrections add column batch_id uuid references public.vault_sales_workbook_correction_batches(id);
create index vault_sales_workbook_order_corrections_batch_idx on public.vault_sales_workbook_order_corrections(batch_id);
create unique index vault_sales_workbook_order_corrections_batch_cell_unique_idx
  on public.vault_sales_workbook_order_corrections(batch_id,order_number,correction_type)
  where batch_id is not null;
create table public.vault_sales_workbook_correction_batch_applications (
  batch_id uuid primary key references public.vault_sales_workbook_correction_batches(id), workbook_id uuid not null references public.vault_sales_workbooks(id),
  workbook_version integer not null, content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'), applied_by_operator_id uuid not null references public.vault_operators(id), applied_at timestamptz not null default now()
);
alter table public.vault_sales_workbook_correction_batch_applications enable row level security;
revoke all on public.vault_sales_workbook_correction_batch_applications from public, anon, authenticated;
grant select, insert on public.vault_sales_workbook_correction_batch_applications to service_role;
create trigger vault_sales_workbook_correction_batch_applications_immutable before update or delete on public.vault_sales_workbook_correction_batch_applications for each row execute function public.reject_sales_workbook_order_correction_mutation();
create or replace function public.create_sales_workbook_correction_batch(payload jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.vault_sales_workbooks; b uuid; item jsonb; op uuid:=nullif(payload->>'operator_id','')::uuid; expected_v integer:=nullif(payload->>'expected_version','')::integer; expected_h text:=payload->>'expected_checksum'; seen text[]:=array[]::text[]; cell_key text;
begin
 if jsonb_typeof(payload)<>'object' or op is null or expected_v is null or expected_h !~ '^[0-9a-f]{64}$' or jsonb_typeof(payload->'corrections')<>'array' or jsonb_array_length(payload->'corrections') not between 1 and 500 then raise exception 'invalid correction batch proposal payload'; end if;
 select * into w from public.vault_sales_workbooks where singleton=true for update;
 if not found or expected_v is distinct from w.current_version or expected_h is distinct from w.content_hash then raise exception 'workbook conflict'; end if;
 insert into public.vault_sales_workbook_correction_batches(workbook_id,workbook_hash_before,expected_version,created_by_operator_id) values(w.id,w.content_hash,w.current_version,op) returning id into b;
 for item in select value from jsonb_array_elements(payload->'corrections') loop
  if jsonb_typeof(item)<>'object' or not(item ?& array['order_number','correction_type','original_value','corrected_value','workbook_row_number','reason','readiness_before','readiness_after']) or coalesce(item->>'order_number','') !~ '^[0-9]+$' or item->>'correction_type' not in ('sale_price','postage','card_fee','cogs') or jsonb_typeof(item->'corrected_value')<>'number' or (item->>'corrected_value')::numeric<0 or coalesce(nullif(btrim(item->>'reason'),''),'')='' or coalesce(item->>'readiness_after','') not in ('READY','REVIEW') or coalesce(item->>'readiness_before','') not in ('READY','REVIEW') or coalesce(nullif(item->>'workbook_row_number',''),'0')::integer<=0 then raise exception 'invalid correction batch member'; end if;
  cell_key:=(item->>'order_number')||':'||(item->>'correction_type'); if cell_key=any(seen) then raise exception 'duplicate correction batch cell'; end if; seen:=array_append(seen,cell_key);
  insert into public.vault_sales_workbook_order_corrections(workbook_id,order_number,correction_type,original_value,corrected_value,workbook_hash_before,workbook_row_number,reason,readiness_before,readiness_after,created_by_operator_id,batch_id) values(w.id,item->>'order_number',item->>'correction_type',item->'original_value',item->'corrected_value',w.content_hash,(item->>'workbook_row_number')::integer,item->>'reason',item->>'readiness_before',item->>'readiness_after',op,b);
 end loop;
 return b;
end; $$;
revoke all on function public.create_sales_workbook_correction_batch(jsonb) from public,anon,authenticated;
grant execute on function public.create_sales_workbook_correction_batch(jsonb) to service_role;
create or replace function public.activate_sales_workbook_pending_correction_batch(payload jsonb) returns public.vault_sales_workbooks language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.vault_sales_workbooks; candidate public.vault_sales_workbook_versions; b public.vault_sales_workbook_correction_batches; batch_id uuid:=nullif(payload->>'batch_id','')::uuid; target_version integer:=nullif(payload->>'version','')::integer; expected_v integer:=nullif(payload->>'expected_version','')::integer; expected_h text:=payload->>'expected_checksum'; h text:=payload->>'content_hash'; op uuid:=nullif(payload->>'operator_id','')::uuid;
begin
 if jsonb_typeof(payload)<>'object' or batch_id is null or target_version is null or op is null or h !~ '^[0-9a-f]{64}$' then raise exception 'invalid correction batch activation payload'; end if;
 select * into w from public.vault_sales_workbooks where singleton=true for update; if not found or expected_v is distinct from w.current_version or expected_h is distinct from w.content_hash then raise exception 'workbook conflict'; end if;
 select * into b from public.vault_sales_workbook_correction_batches where id=batch_id for update; if not found or b.workbook_id<>w.id or b.workbook_hash_before<>w.content_hash or b.expected_version<>w.current_version or b.created_by_operator_id<>op then raise exception 'correction batch conflict'; end if;
 if exists(select 1 from public.vault_sales_workbook_correction_batch_applications application where application.batch_id=b.id) then raise exception 'correction batch already applied'; end if;
 if not exists(select 1 from public.vault_sales_workbook_order_corrections correction where correction.batch_id=b.id) or exists(select 1 from public.vault_sales_workbook_order_corrections c join public.vault_sales_workbook_order_correction_applications a on a.correction_id=c.id where c.batch_id=b.id) then raise exception 'correction batch application conflict'; end if;
 select * into candidate from public.vault_sales_workbook_versions where workbook_id=w.id and version=target_version for update; if not found or candidate.activation_status<>'pending' or candidate.version<>w.current_version+1 or candidate.predecessor_version<>w.current_version or candidate.content_hash<>h then raise exception 'workbook activation conflict'; end if;
 update public.vault_sales_workbooks set current_storage_path=candidate.storage_path,current_version=candidate.version,content_hash=candidate.content_hash,last_modified_at=now(),uploaded_by_operator_id=op where id=w.id returning * into w;
 update public.vault_sales_workbook_versions set activation_status='active' where id=candidate.id;
 insert into public.vault_sales_workbook_correction_batch_applications(batch_id,workbook_id,workbook_version,content_hash,applied_by_operator_id) values(b.id,w.id,candidate.version,h,op);
 insert into public.vault_sales_workbook_order_correction_applications(correction_id,workbook_id,workbook_version,content_hash,applied_by_operator_id) select correction.id,w.id,candidate.version,h,op from public.vault_sales_workbook_order_corrections correction where correction.batch_id=b.id;
 insert into public.vault_sales_workbook_audit_events(workbook_id,version,event_type,operator_id,metadata) values(w.id,candidate.version,'activate_ready_sales_workbook_version',op,jsonb_build_object('content_hash',h,'predecessor_version',candidate.predecessor_version,'correction_batch_id',b.id)); return w;
end; $$;
revoke all on function public.activate_sales_workbook_pending_correction_batch(jsonb) from public,anon,authenticated;
grant execute on function public.activate_sales_workbook_pending_correction_batch(jsonb) to service_role;
notify pgrst,'reload schema';
