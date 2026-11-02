-- Run only against the disposable CI PostgreSQL service, after schema and migration.
begin;
insert into public.vault_operators(id) values ('00000000-0000-0000-0000-000000000001');
insert into public.vault_sales_workbooks(id,singleton,current_version,content_hash,current_storage_path) values('00000000-0000-0000-0000-000000000002',true,7,repeat('a',64),'old.xlsx');
insert into public.vault_sales_workbook_versions(workbook_id,version,activation_status,predecessor_version,content_hash,storage_path) values('00000000-0000-0000-0000-000000000002',8,'pending',7,repeat('b',64),'pending.xlsx');
do $$
declare batch uuid; input jsonb; failed boolean;
begin
 input:=jsonb_build_object('operator_id','00000000-0000-0000-0000-000000000001','expected_version',7,'expected_checksum',repeat('a',64),'corrections',jsonb_build_array(
 jsonb_build_object('order_number','1251','correction_type','cogs','original_value',null,'corrected_value',34.82,'workbook_row_number',3,'reason','verified','readiness_before','REVIEW','readiness_after','READY'),
 jsonb_build_object('order_number','1252','correction_type','postage','original_value',2.95,'corrected_value',3.95,'workbook_row_number',4,'reason','verified','readiness_before','READY','readiness_after','READY')));
 -- Stale version must fail without creating a batch.
 failed:=false;
 begin perform public.create_sales_workbook_correction_batch(jsonb_set(input,'{expected_version}','6'::jsonb));exception when others then failed:=true;end;
 if not failed then raise exception 'FAIL stale proposal accepted';end if;
 if (select count(*) from public.vault_sales_workbook_correction_batches)<>0 then raise exception 'FAIL stale proposal wrote records';end if;
 -- Duplicate cell must fail atomically.
 failed:=false;
 begin perform public.create_sales_workbook_correction_batch(jsonb_set(input,'{corrections}',jsonb_build_array(input->'corrections'->0,input->'corrections'->0)));exception when others then failed:=true;end;
 if not failed then raise exception 'FAIL duplicate accepted';end if;
 if (select count(*) from public.vault_sales_workbook_correction_batches)<>0 then raise exception 'FAIL duplicate wrote records';end if;
 batch:=public.create_sales_workbook_correction_batch(input);
 if (select count(*) from public.vault_sales_workbook_order_corrections where batch_id=batch)<>2 then raise exception 'FAIL batch did not stage two corrections';end if;
 -- Hash mismatch must fail without activating.
 failed:=false;
 begin perform public.activate_sales_workbook_pending_correction_batch(jsonb_build_object('batch_id',batch,'version',8,'content_hash',repeat('c',64),'operator_id','00000000-0000-0000-0000-000000000001','expected_version',7,'expected_checksum',repeat('a',64)));exception when others then failed:=true;end;
 if not failed then raise exception 'FAIL wrong hash activated';end if;
 if (select current_version from public.vault_sales_workbooks where singleton)<>7 then raise exception 'FAIL wrong hash changed workbook';end if;
 perform public.activate_sales_workbook_pending_correction_batch(jsonb_build_object('batch_id',batch,'version',8,'content_hash',repeat('b',64),'operator_id','00000000-0000-0000-0000-000000000001','expected_version',7,'expected_checksum',repeat('a',64)));
 if (select current_version from public.vault_sales_workbooks where singleton)<>8 then raise exception 'FAIL activation did not advance workbook';end if;
 if (select count(*) from public.vault_sales_workbook_order_correction_applications)<>2 then raise exception 'FAIL per-cell application audit';end if;
 if (select count(*) from public.vault_sales_workbook_correction_batch_applications)<>1 then raise exception 'FAIL batch application audit';end if;
 failed:=false;
 begin perform public.activate_sales_workbook_pending_correction_batch(jsonb_build_object('batch_id',batch,'version',8,'content_hash',repeat('b',64),'operator_id','00000000-0000-0000-0000-000000000001','expected_version',7,'expected_checksum',repeat('a',64)));exception when others then failed:=true;end;
 if not failed then raise exception 'FAIL replay accepted';end if;
 raise notice 'PASS: stale proposal, duplicate atomicity, wrong hash, two-cell activation, audit, replay rejection';
end$$;
rollback;
