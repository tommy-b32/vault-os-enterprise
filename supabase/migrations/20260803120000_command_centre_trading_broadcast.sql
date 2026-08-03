-- ============================================================
-- VAULT OS
-- Payload-free Command Centre trading refresh broadcasts
-- ============================================================

create or replace function public.notify_vault_trading_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    '{}'::jsonb,
    'trading-changed',
    'vault-os:trading',
    false
  );

  return null;
end;
$$;

revoke all on function public.notify_vault_trading_changed()
from public, anon, authenticated;

drop trigger if exists
  vault_shopify_orders_broadcast_trading_changed
on public.vault_shopify_orders;

create trigger vault_shopify_orders_broadcast_trading_changed
after insert or update or delete
on public.vault_shopify_orders
for each row
execute function public.notify_vault_trading_changed();

drop trigger if exists
  vault_shopify_order_lines_broadcast_trading_changed
on public.vault_shopify_order_lines;

create trigger vault_shopify_order_lines_broadcast_trading_changed
after insert or update or delete
on public.vault_shopify_order_lines
for each row
execute function public.notify_vault_trading_changed();

comment on function public.notify_vault_trading_changed() is
  'Emits only an empty public Broadcast refresh signal. Replace with authenticated private Broadcast when Vault OS gains user authentication.';
