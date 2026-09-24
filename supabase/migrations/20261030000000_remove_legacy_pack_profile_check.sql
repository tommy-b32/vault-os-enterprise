begin;

-- Replaced by vault_pack_profiles and its foreign key. Keeping this legacy
-- allow-list blocks valid governed profiles such as jacket_5_piece.
alter table public.vault_product_settings
  drop constraint vault_product_settings_pack_profile_check;

commit;
