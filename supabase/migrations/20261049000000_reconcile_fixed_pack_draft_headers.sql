-- Fixed-pack draft headers are durable summaries of their persisted lines.
-- Recompute after each fixed-pack line insert instead of incrementing a prior
-- header, so retries and stale prior values cannot create arithmetic drift.
begin;

create or replace function public.reconcile_fixed_pack_draft_header()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.source_recommendation_type <> 'fixed_pack_purchase_recommendation' then
    return new;
  end if;

  update public.vault_purchase_orders purchase_order
  set total_packs = totals.total_packs,
      estimated_total_gbp = totals.estimated_total_gbp
  from (
    select coalesce(sum(line.recommended_packs), 0)::integer as total_packs,
           coalesce(round(sum(line.line_cost_gbp), 2), 0)::numeric(12,2) as estimated_total_gbp
    from public.vault_purchase_order_lines line
    where line.purchase_order_id = new.purchase_order_id
  ) totals
  where purchase_order.id = new.purchase_order_id
    and purchase_order.status = 'draft';

  return new;
end;
$function$;

drop trigger if exists reconcile_fixed_pack_draft_header_after_insert on public.vault_purchase_order_lines;
create trigger reconcile_fixed_pack_draft_header_after_insert
after insert on public.vault_purchase_order_lines
for each row execute function public.reconcile_fixed_pack_draft_header();

-- Repair only reconcilable draft headers from their own durable line snapshots.
-- Non-draft purchase orders are deliberately excluded.
with reconciled_drafts as (
  select purchase_order.id,
         sum(line.recommended_packs)::integer as total_packs,
         round(sum(line.line_cost_gbp), 2)::numeric(12,2) as estimated_total_gbp
  from public.vault_purchase_orders purchase_order
  join public.vault_purchase_order_lines line on line.purchase_order_id = purchase_order.id
  where purchase_order.status = 'draft'
  group by purchase_order.id
  having count(*) filter (where line.recommended_packs is null or line.recommended_packs <= 0 or line.line_cost_gbp is null or line.line_cost_gbp < 0) = 0
)
update public.vault_purchase_orders purchase_order
set total_packs = reconciled_drafts.total_packs,
    estimated_total_gbp = reconciled_drafts.estimated_total_gbp
from reconciled_drafts
where purchase_order.id = reconciled_drafts.id
  and purchase_order.status = 'draft'
  and (
    purchase_order.total_packs is distinct from reconciled_drafts.total_packs
    or purchase_order.estimated_total_gbp is distinct from reconciled_drafts.estimated_total_gbp
  );

commit;
