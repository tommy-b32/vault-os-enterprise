-- Immutable supplier lead-time expectation captured at the governed ordering boundary.
begin;

create table public.vault_purchase_order_expected_lead_time_evidence (
  purchase_order_id uuid primary key references public.vault_purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.vault_suppliers(id) on delete restrict,
  expected_lead_time_days integer not null check (expected_lead_time_days > 0),
  source_field text not null check (source_field = 'vault_suppliers.default_lead_time_days'),
  captured_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.vault_purchase_order_expected_lead_time_evidence enable row level security;
revoke all on public.vault_purchase_order_expected_lead_time_evidence from public, anon, authenticated, service_role;
grant select, insert on public.vault_purchase_order_expected_lead_time_evidence to service_role;

create function public.reject_purchase_order_lead_time_evidence_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'Purchase-order expected lead-time evidence is immutable';
end;
$function$;

create trigger purchase_order_lead_time_evidence_immutable
before update or delete on public.vault_purchase_order_expected_lead_time_evidence
for each row execute function public.reject_purchase_order_lead_time_evidence_mutation();

create function public.require_purchase_order_lead_time_evidence_before_ordered()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.status is distinct from 'ordered' and new.status = 'ordered'
    and not exists (
      select 1
      from public.vault_purchase_order_expected_lead_time_evidence evidence
      where evidence.purchase_order_id = new.id
        and evidence.supplier_id = new.supplier_id
        and evidence.expected_lead_time_days > 0
        and evidence.source_field = 'vault_suppliers.default_lead_time_days'
    ) then
    raise exception 'Ordered purchase orders require immutable supplier lead-time evidence';
  end if;
  return new;
end;
$function$;

create trigger purchase_order_ordered_requires_lead_time_evidence
before update of status on public.vault_purchase_orders
for each row execute function public.require_purchase_order_lead_time_evidence_before_ordered();

create function public.mark_vault_purchase_order_ordered(
  target_purchase_order_id uuid,
  target_operator_id uuid
)
returns table (
  purchase_order_id uuid,
  status text,
  ordered_by_operator_id uuid,
  ordered_at timestamptz,
  transitioned boolean
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  purchase_order public.vault_purchase_orders%rowtype;
  supplier public.vault_suppliers%rowtype;
  evidence public.vault_purchase_order_expected_lead_time_evidence%rowtype;
  transition_at timestamptz;
begin
  if target_purchase_order_id is null or target_operator_id is null then
    raise exception 'Purchase order and operator are required';
  end if;
  if not exists (select 1 from public.vault_operators operator where operator.id = target_operator_id and operator.is_active) then
    raise exception 'An active operator is required';
  end if;

  select * into purchase_order
  from public.vault_purchase_orders po
  where po.id = target_purchase_order_id
  for update;
  if not found then
    raise exception 'Purchase order was not found';
  end if;

  if purchase_order.status = 'ordered' then
    select * into evidence
    from public.vault_purchase_order_expected_lead_time_evidence evidence_row
    where evidence_row.purchase_order_id = purchase_order.id;
    if not found
      or evidence.supplier_id <> purchase_order.supplier_id
      or evidence.expected_lead_time_days <= 0
      or evidence.source_field <> 'vault_suppliers.default_lead_time_days'
      or purchase_order.ordered_by_operator_id is null
      or purchase_order.ordered_at is null then
      raise exception 'Ordered purchase order lacks valid immutable supplier lead-time evidence';
    end if;
    return query select purchase_order.id, purchase_order.status, purchase_order.ordered_by_operator_id, purchase_order.ordered_at, false;
    return;
  end if;

  if purchase_order.status <> 'approved' then
    raise exception 'Purchase order cannot be marked ordered from status %', purchase_order.status;
  end if;

  select * into supplier
  from public.vault_suppliers s
  where s.id = purchase_order.supplier_id
  for share;
  if not found or not supplier.is_active then
    raise exception 'An active supplier is required to mark a purchase order ordered';
  end if;
  if supplier.default_lead_time_days is null or supplier.default_lead_time_days <= 0 then
    raise exception 'A positive governed supplier lead time is required to mark a purchase order ordered';
  end if;

  transition_at := clock_timestamp();
  insert into public.vault_purchase_order_expected_lead_time_evidence (
    purchase_order_id,
    supplier_id,
    expected_lead_time_days,
    source_field,
    captured_at
  ) values (
    purchase_order.id,
    purchase_order.supplier_id,
    supplier.default_lead_time_days,
    'vault_suppliers.default_lead_time_days',
    transition_at
  );

  update public.vault_purchase_orders
  set status = 'ordered',
      ordered_by_operator_id = target_operator_id,
      ordered_at = transition_at
  where id = purchase_order.id;

  return query select purchase_order.id, 'ordered'::text, target_operator_id, transition_at, true;
end;
$function$;

revoke all on function public.mark_vault_purchase_order_ordered(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_vault_purchase_order_ordered(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
