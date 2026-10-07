create or replace function public.record_sales_workbook_version(payload jsonb)
returns public.vault_sales_workbooks language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.vault_sales_workbooks; v int; e text; p text; h text; f text; op uuid; expected_v int; expected_h text; prior int;
begin
 if jsonb_typeof(payload)<>'object' then raise exception 'invalid workbook payload'; end if;
 p:=payload->>'storage_path';h:=payload->>'content_hash';f:=payload->>'filename';op:=(payload->>'operator_id')::uuid; expected_v:=nullif(payload->>'expected_version','')::int;expected_h:=nullif(payload->>'expected_checksum','');
 if p !~ '^sales-workbook/versions/[0-9a-f-]{36}/[1-9][0-9]*-[0-9a-f]{64}\.xlsx$' or h !~ '^[0-9a-f]{64}$' or nullif(btrim(f),'') is null or length(f)>255 or op is null or nullif(payload->>'workbook_id','') is null then raise exception 'invalid workbook payload'; end if;
 select * into w from public.vault_sales_workbooks where singleton=true for update;
 if not found then
  if expected_v is not null or expected_h is not null then raise exception 'workbook conflict'; end if;
  if (payload->>'workbook_id') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' or p !~ ('^sales-workbook/versions/'||(payload->>'workbook_id')||'/1-'||h||'\.xlsx$') then raise exception 'invalid initial workbook identity'; end if;
  insert into public.vault_sales_workbooks(id,filename,storage_bucket,current_storage_path,current_version,content_hash,last_sync_status,uploaded_by_operator_id,singleton) values((payload->>'workbook_id')::uuid,f,'vault-documents',p,1,h,'never',op,true) returning * into w; v:=1;prior:=null;e:='upload';
 else
  if expected_v is distinct from w.current_version or expected_h is distinct from w.content_hash then raise exception 'workbook conflict'; end if;
  v:=w.current_version+1;prior:=w.current_version;e:='replace'; if payload->>'workbook_id'<>w.id::text or p !~ ('^sales-workbook/versions/'||w.id::text||'/'||v::text||'-'||h||'\.xlsx$') then raise exception 'invalid replacement workbook identity'; end if; update public.vault_sales_workbooks set filename=f,current_storage_path=p,current_version=v,content_hash=h,last_modified_at=now(),uploaded_by_operator_id=op where id=w.id returning * into w;
 end if;
 insert into public.vault_sales_workbook_versions(workbook_id,version,storage_path,content_hash,filename,uploaded_by_operator_id,predecessor_version) values(w.id,v,p,h,f,op,prior);
 insert into public.vault_sales_workbook_audit_events(workbook_id,version,event_type,operator_id,metadata) values(w.id,v,e,op,jsonb_build_object('filename',f,'storage_path',p,'content_hash',h,'version',v,'predecessor_version',prior));
 return w;
end $$;
revoke all on function public.record_sales_workbook_version(jsonb) from public,anon,authenticated; grant execute on function public.record_sales_workbook_version(jsonb) to service_role;
