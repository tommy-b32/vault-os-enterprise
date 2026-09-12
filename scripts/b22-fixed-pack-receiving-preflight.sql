-- B22D production preflight. Run with a read-only database role after the B22B
-- and B22C migrations. This script performs SELECTs only and never repairs data.
begin read only;

with fixed_lines as (
  select l.id,l.purchase_order_id,l.recommended_units,l.recommended_packs,l.units_per_pack
  from public.vault_purchase_order_lines l
  where l.source_recommendation_type in ('fixed_pack_purchase_recommendation','manual_fixed_pack_purchase')
), issues as (
  select 'FIXED_LINE_MISSING_SIZE_ALLOCATIONS'::text issue_code, f.purchase_order_id, f.id purchase_order_line_id, null::uuid size_allocation_id, null::uuid receipt_allocation_id
  from fixed_lines f where not exists (select 1 from public.vault_purchase_order_line_size_allocations s where s.purchase_order_line_id=f.id)
  union all
  select 'RECEIVABLE_LEGACY_SOURCE_UNSUPPORTED_BY_B22C',l.purchase_order_id,l.id,null,null
  from public.vault_purchase_order_lines l join public.vault_purchase_orders po on po.id=l.purchase_order_id
  where po.status in ('ordered','part_paid','paid','shipped')
    and l.source_recommendation_type not in ('advisor','purchase_intelligence_required','purchase_intelligence_bring_forward','fixed_pack_purchase_recommendation','manual_fixed_pack_purchase')
  union all
  select 'FIXED_LINE_ALLOCATION_TOTAL_MISMATCH',f.purchase_order_id,f.id,null,null
  from fixed_lines f where coalesce((select sum(s.ordered_units) from public.vault_purchase_order_line_size_allocations s where s.purchase_order_line_id=f.id),0) <> coalesce(f.recommended_units,f.recommended_packs*f.units_per_pack)
  union all
  select 'FIXED_SIZE_ALLOCATION_DUPLICATE_IDENTITY',f.purchase_order_id,f.id,null,null
  from fixed_lines f join public.vault_purchase_order_line_size_allocations s on s.purchase_order_line_id=f.id
  group by f.purchase_order_id,f.id,s.normalized_size having count(*) > 1
  union all
  select 'FIXED_RECEIPT_LINK_MISSING',f.purchase_order_id,f.id,null,a.id
  from fixed_lines f join public.vault_purchase_order_receipt_lines rl on rl.purchase_order_line_id=f.id
  join public.vault_purchase_order_receipt_allocations a on a.receipt_line_id=rl.id
  where a.purchase_order_line_size_allocation_id is null
  union all
  select 'LEGACY_RECEIPT_UNEXPECTED_LINK',l.purchase_order_id,l.id,a.purchase_order_line_size_allocation_id,a.id
  from public.vault_purchase_order_lines l join public.vault_purchase_order_receipt_lines rl on rl.purchase_order_line_id=l.id
  join public.vault_purchase_order_receipt_allocations a on a.receipt_line_id=rl.id
  where l.source_recommendation_type in ('advisor','purchase_intelligence_required','purchase_intelligence_bring_forward') and a.purchase_order_line_size_allocation_id is not null
  union all
  select 'RECEIPT_LINK_WRONG_LINE',f.purchase_order_id,f.id,a.purchase_order_line_size_allocation_id,a.id
  from fixed_lines f join public.vault_purchase_order_receipt_lines rl on rl.purchase_order_line_id=f.id
  join public.vault_purchase_order_receipt_allocations a on a.receipt_line_id=rl.id
  join public.vault_purchase_order_line_size_allocations s on s.id=a.purchase_order_line_size_allocation_id
  where s.purchase_order_line_id <> f.id
  union all
  select 'FIXED_SIZE_PHYSICAL_OVER_RECEIVED',f.purchase_order_id,f.id,s.id,null
  from fixed_lines f join public.vault_purchase_order_line_size_allocations s on s.purchase_order_line_id=f.id
  where coalesce((select sum(a.quantity_received+a.non_sellable_quantity) from public.vault_purchase_order_receipt_allocations a where a.purchase_order_line_size_allocation_id=s.id),0)>s.ordered_units
  union all
  select 'FIXED_SIZE_CURRENT_IDENTITY_MISMATCH',f.purchase_order_id,f.id,s.id,null
  from fixed_lines f join public.vault_purchase_order_line_size_allocations s on s.purchase_order_line_id=f.id
  left join public.vault_variants v on v.id=s.variant_id and v.source='shopify' and v.source_active and v.identity_resolution_status='resolved' and v.product_id=s.parent_product_id and v.model_design=s.model_design and v.normalized_size=s.normalized_size and v.source_variant_id=s.shopify_variant_id_snapshot and v.source_inventory_item_id=s.shopify_inventory_item_id_snapshot
  where v.id is null
  union all
  select 'RECEIVED_FIXED_PO_INCOMPLETE',f.purchase_order_id,f.id,s.id,null
  from fixed_lines f join public.vault_purchase_orders po on po.id=f.purchase_order_id and po.status='received'
  join public.vault_purchase_order_line_size_allocations s on s.purchase_order_line_id=f.id
  where coalesce((select sum(a.quantity_received+a.non_sellable_quantity) from public.vault_purchase_order_receipt_allocations a where a.purchase_order_line_size_allocation_id=s.id),0)<>s.ordered_units
  union all
  select 'IMPOSSIBLE_RECEIPT_PHYSICAL_QUANTITY',r.purchase_order_id,rl.purchase_order_line_id,a.purchase_order_line_size_allocation_id,a.id
  from public.vault_purchase_order_receipts r join public.vault_purchase_order_receipt_lines rl on rl.receipt_id=r.id
  join public.vault_purchase_order_receipt_allocations a on a.receipt_line_id=rl.id
  where a.quantity_received < 0 or a.non_sellable_quantity < 0 or a.quantity_received+a.non_sellable_quantity <= 0
)
select case when exists(select 1 from issues) then 'FAIL' else 'PASS' end preflight_status,
       issue_code,purchase_order_id,purchase_order_line_id,size_allocation_id,receipt_allocation_id
from issues
union all select 'PASS',null,null,null,null,null where not exists(select 1 from issues)
order by preflight_status,issue_code nulls first;

rollback;
