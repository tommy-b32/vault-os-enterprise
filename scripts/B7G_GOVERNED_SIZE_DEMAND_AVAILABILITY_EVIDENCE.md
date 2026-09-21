# B7G factual bridge

`vault_governed_size_availability_member_location_daily` exposes resolved B7D evidence at its native Europe/London member/location/day grain. `observed_signed_available` remains signed; `positive`, `zero`, and `negative` describe that exact observed quantity only.

`vault_governed_size_demand_daily_availability_status` aggregates resolved B7F demand by Europe/London operational day and product/style/size before independently aggregated B7D evidence is joined. It preserves demand when no B7D row exists: `governance_status = availability_unknown` and availability facts are `NULL`, never fabricated zeroes.

`governed_comparable` means both resolved governed facts exist for the same identity/day. `availability_only` means B7D evidence exists without B7F demand. Observed locations are not complete eligible selling-location coverage, so B7G does not establish sellability, availability percentages, stockout duration, missed sales, or recommendations.

## Post-deployment read-only validation

```sql
select count(*) rows, count(distinct evidence_date) days, count(distinct variant_id) variants,
       count(distinct shopify_location_id) locations,
       count(*) filter (where observed_quantity_state = 'positive') positive_rows,
       count(*) filter (where observed_quantity_state = 'zero') zero_rows,
       count(*) filter (where observed_quantity_state = 'negative') negative_rows
from public.vault_governed_size_availability_member_location_daily;

select governance_status, count(*) rows, sum(net_retained_units) net_retained_units,
       count(*) filter (where governance_status = 'availability_unknown' and observed_signed_available_total is not null) unknown_with_quantity
from public.vault_governed_size_demand_daily_availability_status
group by governance_status;

select operational_date, canonical_product_id, canonical_style_id, normalized_size, count(*)
from public.vault_governed_size_demand_daily_availability_status
group by 1,2,3,4 having count(*) > 1;
```
