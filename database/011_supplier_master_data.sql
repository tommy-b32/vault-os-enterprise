-- ============================================================
-- VAULT OS
-- Supplier Master Data
-- ============================================================

insert into public.vault_suppliers (
  supplier_name,
  supplier_reference,
  currency_code,
  default_lead_time_days,
  default_order_interval_days,
  is_active,
  notes
)
values
  (
    'Exclusive',
    'Enes',
    'EUR',
    10,
    10,
    true,
    'Primary stocked tee supplier. Minimum order is 20 packs across the supplier order.'
  ),
  (
    'Icon',
    'Yusef',
    'EUR',
    10,
    null,
    true,
    'Supplier for selected tees and hoodies. MOQ still to be confirmed.'
  ),
  (
    'Tony Footwear',
    'Tony',
    'EUR',
    7,
    null,
    true,
    'WhatsApp footwear supplier. Shoes are dropshipped and purchased only after a customer order.'
  )
on conflict do nothing;