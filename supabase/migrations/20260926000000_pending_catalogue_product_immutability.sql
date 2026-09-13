-- B23A2.5: retain pending-catalogue purchasing evidence once any related PO leaves draft.
create or replace function public.prevent_approved_pending_catalogue_product_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.supplier_id is not distinct from old.supplier_id
    and new.supplier_reference is not distinct from old.supplier_reference
    and new.working_title is not distinct from old.working_title
    and new.brand is not distinct from old.brand
    and new.product_category is not distinct from old.product_category
    and new.colour_model is not distinct from old.colour_model
    and new.notes is not distinct from old.notes
    and new.created_at is not distinct from old.created_at
    and new.created_by_operator_id is not distinct from old.created_by_operator_id then
    return new;
  end if;

  if exists(
    select 1
    from public.vault_purchase_order_line_size_allocations allocation
    join public.vault_purchase_order_lines line on line.id=allocation.purchase_order_line_id
    join public.vault_purchase_orders purchase_order on purchase_order.id=line.purchase_order_id
    where allocation.pending_catalogue_product_id=old.id
      and purchase_order.status<>'draft'
  ) then
    raise exception 'Approved pending catalogue product evidence is immutable';
  end if;

  return new;
end $$;

create trigger vault_pending_catalogue_products_immutable
before update on public.vault_pending_catalogue_products
for each row execute function public.prevent_approved_pending_catalogue_product_mutation();

notify pgrst,'reload schema';
