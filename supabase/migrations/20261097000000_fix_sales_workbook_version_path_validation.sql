-- Forward-only correction: migration 20261094000000 stored doubled backslashes
-- in PostgreSQL regex literals, so valid immutable .xlsx paths fail validation.
-- Reuse the live function definition so atomicity, audit validation, and grants
-- remain byte-for-byte governed by the already-applied function body.
do $$
declare
  function_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef(
    'public.record_sales_workbook_version(jsonb)'::regprocedure
  ) into function_definition;

  if position(E'\\\\.xlsx' in function_definition) = 0 then
    raise exception 'Expected doubled XLSX regex escape was not found';
  end if;

  corrected_definition := replace(
    function_definition,
    E'\\\\.xlsx',
    E'\\.xlsx'
  );

  execute corrected_definition;
end;
$$;

revoke all on function public.record_sales_workbook_version(jsonb) from public, anon, authenticated;
grant execute on function public.record_sales_workbook_version(jsonb) to service_role;

notify pgrst, 'reload schema';
