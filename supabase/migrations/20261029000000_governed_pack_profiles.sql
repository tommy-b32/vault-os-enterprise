begin;

-- Reusable purchasing/inventory pack structures.  These deliberately do not
-- participate in commercial-cost resolution or historical COGS snapshots.
create table public.vault_pack_profiles (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name text not null check (nullif(trim(display_name), '') is not null),
  units_per_pack integer check (units_per_pack is null or units_per_pack > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (display_name, units_per_pack)
);

-- These values are the existing product-setting identities.  Hoodie and
-- Custom never encoded a pack quantity, so preserve that absence rather than
-- inventing a purchasing quantity for already-assigned products.
insert into public.vault_pack_profiles (id, display_name, units_per_pack) values
  ('tee_5_piece', 'Tee', 5),
  ('polo_6_piece', 'Polo', 6),
  ('hoodie', 'Hoodie', null),
  ('custom', 'Custom', null);

alter table public.vault_product_settings
  add constraint vault_product_settings_pack_profile_fk
  foreign key (pack_profile) references public.vault_pack_profiles(id)
  on update restrict on delete restrict;

alter table public.vault_pack_profiles enable row level security;
revoke all on public.vault_pack_profiles from public, anon, authenticated;
grant select, insert, update on public.vault_pack_profiles to service_role;

notify pgrst, 'reload schema';
commit;
