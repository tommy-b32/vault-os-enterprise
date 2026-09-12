-- B22E: retain B22C exactly, except classify the original PO-line default
-- `advisor` as a supported historical aggregate-receiving source.
do $migration$
declare
  definition text;
  b22c_sources constant text := '''purchase_intelligence_required'',''purchase_intelligence_bring_forward'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase''';
  compatible_sources constant text := '''advisor'',''purchase_intelligence_required'',''purchase_intelligence_bring_forward'',''fixed_pack_purchase_recommendation'',''manual_fixed_pack_purchase''';
begin
  select pg_get_functiondef('public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb)'::regprocedure)
    into definition;
  if definition is null or position(b22c_sources in definition) = 0 then
    raise exception 'B22C receipt source classification was not found';
  end if;
  execute replace(definition, b22c_sources, compatible_sources);
end;
$migration$;

revoke all on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb)
from public, anon, authenticated;
grant execute on function public.record_vault_purchase_order_receipt(uuid,uuid,date,uuid,text,jsonb)
to service_role;
notify pgrst, 'reload schema';
