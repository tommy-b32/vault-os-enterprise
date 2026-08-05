-- Atomically update the two existing canonical supplier minimum dimensions.
-- No supplier configuration table or pack-minimum column is introduced here;
-- minimum_order_packs already belongs to vault_supplier_purchasing_rules.

create or replace function public.update_supplier_minimum_policy(
  target_supplier_id uuid,
  target_minimum_order_value numeric,
  target_minimum_order_packs integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if target_minimum_order_value is not null and target_minimum_order_value < 0 then
    raise exception 'minimum_order_value cannot be negative';
  end if;

  if target_minimum_order_packs is not null and target_minimum_order_packs < 0 then
    raise exception 'minimum_order_packs cannot be negative';
  end if;

  update public.vault_suppliers
  set
    minimum_order_value = target_minimum_order_value,
    updated_at = now()
  where id = target_supplier_id
    and is_active = true;

  if not found then
    raise exception 'active canonical supplier not found';
  end if;

  insert into public.vault_supplier_purchasing_rules (
    supplier_id,
    minimum_order_packs
  )
  values (
    target_supplier_id,
    target_minimum_order_packs
  )
  on conflict (supplier_id) do update
  set minimum_order_packs = excluded.minimum_order_packs;
end
$function$;

revoke all on function public.update_supplier_minimum_policy(uuid, numeric, integer)
from public, anon, authenticated;
grant execute on function public.update_supplier_minimum_policy(uuid, numeric, integer)
to service_role;

