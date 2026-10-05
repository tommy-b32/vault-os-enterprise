-- Supplementary carrier intelligence only. These fields never drive PO lifecycle state.
alter table public.vault_purchase_orders
  add column if not exists tracking_status text null,
  add column if not exists tracking_status_detail text null,
  add column if not exists tracking_location text null,
  add column if not exists tracking_updated_at timestamptz null,
  add column if not exists tracking_delivered_at timestamptz null,
  add column if not exists tracking_last_checked_at timestamptz null;

alter table public.vault_purchase_orders
  add constraint vault_purchase_orders_tracking_status_bounded
    check (tracking_status is null or length(trim(tracking_status)) between 1 and 200),
  add constraint vault_purchase_orders_tracking_status_detail_bounded
    check (tracking_status_detail is null or length(trim(tracking_status_detail)) between 1 and 500),
  add constraint vault_purchase_orders_tracking_location_bounded
    check (tracking_location is null or length(trim(tracking_location)) between 1 and 200),
  add constraint vault_purchase_orders_tracking_delivery_after_update
    check (tracking_delivered_at is null or tracking_updated_at is null or tracking_delivered_at >= tracking_updated_at);

comment on column public.vault_purchase_orders.tracking_status is
  'Latest supplementary carrier parcel status; never used for purchase-order lifecycle transitions.';
comment on column public.vault_purchase_orders.tracking_status_detail is
  'Optional carrier-provided clarification of the latest parcel status.';
comment on column public.vault_purchase_orders.tracking_location is
  'Optional latest carrier scan location.';
comment on column public.vault_purchase_orders.tracking_updated_at is
  'Timestamp attributed to the carrier status update.';
comment on column public.vault_purchase_orders.tracking_delivered_at is
  'Carrier-attributed delivery timestamp when present.';
comment on column public.vault_purchase_orders.tracking_last_checked_at is
  'Timestamp Vault OS last checked the carrier tracking source.';

notify pgrst, 'reload schema';
