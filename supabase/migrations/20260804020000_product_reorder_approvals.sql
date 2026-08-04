-- Vault OS canonical, explicit reorder approval contract.
-- No existing products are approved or backfilled by this migration.

create table if not exists public.vault_product_reorder_approvals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.vault_products(id) on delete cascade,
  approval_state text not null check (approval_state in ('approved', 'revoked')),
  approved_by uuid not null references public.vault_operators(id),
  approved_at timestamptz not null,
  revoked_by uuid null references public.vault_operators(id),
  revoked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vault_product_reorder_approvals_product_unique unique (product_id),
  constraint vault_product_reorder_approvals_state_consistent check (
    (approval_state = 'approved' and revoked_by is null and revoked_at is null)
    or
    (approval_state = 'revoked' and revoked_by is not null and revoked_at is not null)
  ),
  constraint vault_product_reorder_approvals_time_ordered check (
    revoked_at is null or revoked_at >= approved_at
  )
);

create index if not exists vault_product_reorder_approvals_state_idx
on public.vault_product_reorder_approvals (approval_state, product_id);

alter table public.vault_product_reorder_approvals enable row level security;
revoke all on table public.vault_product_reorder_approvals from anon, authenticated;

create or replace function public.set_vault_product_reorder_approval_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function public.set_vault_product_reorder_approval_updated_at()
from public, anon, authenticated;

drop trigger if exists vault_product_reorder_approvals_updated_at
on public.vault_product_reorder_approvals;

create trigger vault_product_reorder_approvals_updated_at
before update on public.vault_product_reorder_approvals
for each row execute function public.set_vault_product_reorder_approval_updated_at();

-- Preserve the existing configuration contract, adding only explicit approval
-- to the final trusted_for_reorder expression.
create or replace view public.vault_configuration_intelligence as
with product_configuration as (
  select
    pm.product_id,
    pm.product_name,
    pm.handle,
    pm.vendor,
    pm.product_type,
    pm.status as shopify_status,
    pm.supplier_id,
    pm.supplier_company,
    coalesce(pm.inventory_strategy, 'stocked') as inventory_strategy,
    coalesce(pm.restock_enabled, true) as restock_enabled,
    pm.pack_profile,
    pm.supplier_moq_packs,
    pm.target_stock_days,
    pm.decision_reason,
    pm.notes,
    pm.settings_updated_at,
    case
      when coalesce(pm.inventory_strategy, 'stocked')
        in ('do_not_restock', 'discontinued', 'service') then true
      else pm.supplier_id is not null
    end as supplier_complete,
    case
      when coalesce(pm.inventory_strategy, '') in (
        'stocked', 'do_not_restock', 'discontinued', 'dropship', 'service'
      ) then true
      else false
    end as strategy_complete,
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true
      else pm.pack_profile is not null
    end as pack_profile_complete,
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true
      when coalesce(pm.restock_enabled, true) = false then true
      else pm.supplier_moq_packs is not null and pm.supplier_moq_packs >= 0
    end as moq_complete,
    case
      when coalesce(pm.inventory_strategy, 'stocked') <> 'stocked' then true
      when coalesce(pm.restock_enabled, true) = false then true
      else pm.target_stock_days is not null and pm.target_stock_days > 0
    end as target_days_complete
  from public.vault_product_master pm
),
scored_configuration as (
  select
    *,
    (
      case when supplier_complete then 20 else 0 end +
      case when strategy_complete then 20 else 0 end +
      case when pack_profile_complete then 20 else 0 end +
      case when moq_complete then 20 else 0 end +
      case when target_days_complete then 20 else 0 end
    )::integer as configuration_score,
    array_remove(array[
      case when not supplier_complete then 'supplier' end,
      case when not strategy_complete then 'inventory_strategy' end,
      case when not pack_profile_complete then 'pack_profile' end,
      case when not moq_complete then 'supplier_moq' end,
      case when not target_days_complete then 'target_stock_days' end
    ], null) as missing_requirements
  from product_configuration
)
select
  configuration.product_id,
  configuration.product_name,
  configuration.handle,
  configuration.vendor,
  configuration.product_type,
  configuration.shopify_status,
  configuration.supplier_id,
  configuration.supplier_company,
  configuration.inventory_strategy,
  configuration.restock_enabled,
  configuration.pack_profile,
  configuration.supplier_moq_packs,
  configuration.target_stock_days,
  configuration.decision_reason,
  configuration.notes,
  configuration.settings_updated_at,
  configuration.supplier_complete,
  configuration.strategy_complete,
  configuration.pack_profile_complete,
  configuration.moq_complete,
  configuration.target_days_complete,
  configuration.configuration_score,
  configuration.missing_requirements,
  cardinality(configuration.missing_requirements) as missing_requirement_count,
  case
    when configuration.inventory_strategy = 'dropship'
      and configuration.configuration_score = 100 then 'dropship_ready'
    when configuration.inventory_strategy = 'do_not_restock' then 'do_not_restock'
    when configuration.inventory_strategy = 'discontinued' then 'discontinued'
    when configuration.inventory_strategy = 'service' then 'service'
    when configuration.configuration_score = 100 then 'ready'
    when configuration.configuration_score = 80 then 'almost_ready'
    else 'needs_configuration'
  end as configuration_state,
  configuration.configuration_score = 100 as configuration_trusted,
  (
    configuration.configuration_score = 100
    and configuration.inventory_strategy = 'stocked'
    and configuration.restock_enabled = true
    and approval.approval_state = 'approved'
  ) as trusted_for_reorder,
  case
    when configuration.configuration_score = 100 then 'high'
    when configuration.configuration_score = 80 then 'limited'
    else 'untrusted'
  end as brain_confidence
from scored_configuration configuration
left join public.vault_product_reorder_approvals approval
  on approval.product_id = configuration.product_id;

-- Defence in depth: even service-role writes cannot approve incomplete products.
create or replace function public.validate_vault_product_reorder_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  configuration record;
begin
  if new.approval_state <> 'approved' then
    return new;
  end if;

  select
    product.configuration_trusted,
    product.inventory_strategy,
    product.restock_enabled
  into configuration
  from public.vault_configuration_intelligence product
  where product.product_id = new.product_id;

  if not found then
    raise exception 'Product does not exist';
  end if;

  if configuration.configuration_trusted is not true
    or configuration.inventory_strategy <> 'stocked'
    or configuration.restock_enabled is not true then
    raise exception 'Product is not eligible for reorder approval';
  end if;

  return new;
end;
$function$;

revoke all on function public.validate_vault_product_reorder_approval()
from public, anon, authenticated;

drop trigger if exists vault_product_reorder_approvals_validate
on public.vault_product_reorder_approvals;

create trigger vault_product_reorder_approvals_validate
before insert or update on public.vault_product_reorder_approvals
for each row execute function public.validate_vault_product_reorder_approval();

notify pgrst, 'reload schema';
