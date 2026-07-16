-- ============================================================
-- VAULT OS
-- Migration 006: Synchronise Vault Event Schema
-- ============================================================

alter table public.vault_events
add column if not exists variant_title text,
add column if not exists selected_colour text,
add column if not exists selected_size text,
add column if not exists qualifies_for_bundle boolean not null default false,
add column if not exists customer_item_count integer not null default 0,
add column if not exists qualifying_item_count integer not null default 0,
add column if not exists qualifying_pair_count integer not null default 0,
add column if not exists secured_saving numeric(10, 2) not null default 0,
add column if not exists vaultcare_active boolean not null default false,
add column if not exists operator_intent text,
add column if not exists operator_mission text,
add column if not exists operator_message_id text,
add column if not exists confidence_score integer,
add column if not exists analytics_allowed boolean not null default false;

notify pgrst, 'reload schema';