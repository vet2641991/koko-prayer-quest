-- Koko backend, migration 11: subscriptions (Koko Premium, owner 2026-10-23: $35 a month).
--
-- 1. Which lessons need a subscription: units.premium, set by the owner in the dashboard. It is exported as
--    "premium": true on the unit in catalog.json, and only when true, so today's catalog stays byte-identical
--    (every unit is free until the owner says otherwise).
-- 2. Who is subscribed: entitlements, one row per subscription, written only by the Edge Functions that receive
--    the store webhooks (RevenueCat for the App Store and Google Play, Stripe for the website). A parent reads
--    only their own rows; nobody can write them from the app or the dashboard.
--
-- Parents are ordinary auth users (email + one-time code), created by the Edge Functions. Self-signup stays off
-- for the whole project, and a parent account is never an admin: every dashboard permission still goes through
-- public.admins.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Lessons for subscribers
-- ---------------------------------------------------------------------------------------------------------------
alter table public.units add column premium boolean not null default false;
comment on column public.units.premium is 'Koko Premium only. Owner decides (set_units_premium); exported as "premium": true when true.';

alter table public.units drop constraint units_extra_check;
alter table public.units add constraint units_extra_check check (jsonb_typeof(extra) = 'object'
  and not (extra ?| array['id', 'n', 'ar', 'en', 'file', 'go', 'premium']));

create or replace function public.unit_document(u public.units) returns jsonb
language sql stable
set search_path = ''
as $$
  select public.jsonb_strip_top_nulls(jsonb_build_object(
    'id', u.id, 'n', u.n, 'ar', u.ar, 'en', u.en, 'go', u.go_world_id,
    'premium', case when u.premium then true end)) || u.extra
$$;

-- What is free and what is paid is the owner's decision, like the catalog settings: editors and reviewers can
-- edit a unit but cannot change its premium flag.
create function public.guard_unit_premium() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_caller() or public.has_permission('manage_admins') then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.premium) or (tg_op = 'UPDATE' and new.premium is distinct from old.premium) then
    raise exception 'Only the owner decides which lessons are for subscribers' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;
create trigger units_guard_premium before insert or update of premium on public.units
  for each row execute function public.guard_unit_premium();

-- One call from the dashboard: set the flag on some units and republish the ones already live, so the change
-- reaches children with the next "Send to the site". Drafts stay drafts.
create function public.set_units_premium(unit_ids text[], premium boolean) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare u text; n integer := 0;
begin
  perform public.require_permission('manage_admins');
  if exists (select 1 from unnest(unit_ids) x(id) where not exists (select 1 from public.units where id = x.id)) then
    raise exception 'Unknown unit in %', unit_ids using errcode = 'no_data_found';
  end if;
  update public.units set premium = set_units_premium.premium
   where id = any (unit_ids) and units.premium is distinct from set_units_premium.premium;
  for u in select p.id from public.published_content p where p.kind = 'unit' and p.id = any (unit_ids) loop
    perform public.publish_unit(u, case when premium then 'for subscribers' else 'free' end);
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke all on function public.set_units_premium(text[], boolean) from public, anon;
grant execute on function public.set_units_premium(text[], boolean) to authenticated, service_role;
revoke all on function public.guard_unit_premium() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Entitlements
-- ---------------------------------------------------------------------------------------------------------------
create type public.billing_source as enum ('revenuecat', 'stripe', 'manual');

create table public.entitlements (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  source        public.billing_source not null,
  -- RevenueCat: the app user id (= user_id); Stripe: the subscription id (sub_…); manual: any label.
  external_id   text not null,
  store         text,                  -- app_store, play_store, stripe, promotional… (information only)
  product_id    text,
  active_until  timestamptz,           -- end of the paid period, grace period included; null = no end (manual)
  will_renew    boolean not null default false,
  status        text not null check (status in ('active', 'cancelled', 'billing_issue', 'expired', 'paused')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint entitlements_one_per_subscription unique (source, external_id)
);
create index entitlements_user_idx on public.entitlements (user_id);
comment on table public.entitlements is 'Koko Premium. Written only by the billing Edge Functions (service role) from store webhooks.';

create function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end
$$;
create trigger entitlements_touch before update on public.entitlements
  for each row execute function public.touch_updated_at();

-- Stripe customer of each parent (to open the billing portal and to match webhooks to a person).
create table public.billing_customers (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id  text not null unique check (stripe_customer_id ~ '^cus_'),
  created_at          timestamptz not null default now()
);

-- Webhooks can arrive twice: each event is handled once. Only ids and types are kept, never the payload.
create table public.billing_events (
  provider     text not null check (provider in ('revenuecat', 'stripe')),
  event_id     text not null,
  event_type   text not null,
  received_at  timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.entitlements      enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_events    enable row level security;

-- A parent reads their own subscriptions; nothing else is readable or writable through the API.
revoke all on public.entitlements, public.billing_customers, public.billing_events from public, anon, authenticated;
grant select on public.entitlements to authenticated;
create policy entitlements_read_own on public.entitlements for select to authenticated
  using (user_id = (select auth.uid()));
grant all on public.entitlements, public.billing_customers, public.billing_events to service_role;

-- Is the caller a subscriber right now? Used by the app and the website after a parent signs in.
create function public.my_access() returns jsonb
language sql stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'premium', coalesce(bool_or(e.active_until is null or e.active_until > now()), false),
    'until', max(e.active_until) filter (where e.active_until is null or e.active_until > now()),
    'will_renew', coalesce(bool_or(e.will_renew) filter (where e.active_until is null or e.active_until > now()), false),
    'sources', coalesce(jsonb_agg(distinct e.source) filter (where e.active_until is null or e.active_until > now()), '[]'::jsonb))
  from public.entitlements e
  where e.user_id = (select auth.uid())
$$;
revoke all on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated, service_role;

-- The parent account of an email address, for webhooks that only know the email (Stripe Checkout without a
-- signed-in parent). Service role only.
create function public.billing_user_by_email(addr text) returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(btrim(addr)) order by u.created_at limit 1
$$;
revoke all on function public.billing_user_by_email(text) from public, anon, authenticated;
grant execute on function public.billing_user_by_email(text) to service_role;

-- For the owner: how many subscribers, by source. Counts only, no names or emails.
create function public.billing_summary() returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  perform public.require_permission('manage_admins');
  return (select jsonb_build_object(
    'active', count(distinct e.user_id) filter (where e.active_until is null or e.active_until > now()),
    'renewing', count(distinct e.user_id) filter (where (e.active_until is null or e.active_until > now()) and e.will_renew),
    'by_source', coalesce((select jsonb_object_agg(s.source, s.n) from (
        select x.source, count(distinct x.user_id) as n from public.entitlements x
        where x.active_until is null or x.active_until > now() group by x.source) s), '{}'::jsonb))
    from public.entitlements e);
end
$$;
revoke all on function public.billing_summary() from public, anon;
grant execute on function public.billing_summary() to authenticated, service_role;
