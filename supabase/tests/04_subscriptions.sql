-- Migration 11 tests: which lessons are for subscribers (owner only), and who can see or change subscriptions.
-- A parent reads only their own entitlements; nobody writes them through the API; a parent is never an admin.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
begin;

create function pg_temp.expect_error(stmt text, want_state text, label text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> want_state then
      raise exception 'FAIL %: expected SQLSTATE %, got % (%)', label, want_state, sqlstate, sqlerrm;
    end if;
    raise notice 'ok   %', label;
    return;
  end;
  raise exception 'FAIL %: statement succeeded but should have been rejected', label;
end $$;
create function pg_temp.check(ok boolean, label text) returns void
language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL %', label; end if;
  raise notice 'ok   %', label;
end $$;
create function pg_temp.rows(stmt text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
create function pg_temp.login(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role": "anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_job() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- fixtures ------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.org'),
  ('00000000-0000-0000-0000-0000000000a2', 'reviewer@example.org'),
  ('00000000-0000-0000-0000-0000000000a3', 'editor@example.org'),
  ('00000000-0000-0000-0000-0000000000b1', 'parent.one@example.org'),
  ('00000000-0000-0000-0000-0000000000b2', 'Parent.Two@Example.org');
insert into public.admins (user_id, email, display_name, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.org', 'Dr. Owner', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'reviewer@example.org', 'Reviewer', 'reviewer'),
  ('00000000-0000-0000-0000-0000000000a3', 'editor@example.org', 'Editor', 'editor');
insert into public.worlds (id, en, ar, tint, ink, sort) values ('ar1', 'Arabic Adventures · Book 1', 'كتاب ١', '#FFF4CC', '#7a5200', 10);
insert into public.units (id, world_id, n, ar, en, sort) values
  ('ar1-u01', 'ar1', '1', 'أ', 'One', 10), ('ar1-u02', 'ar1', '2', 'ب', 'Two', 20), ('ar1-u03', 'ar1', '3', 'ج', 'Three', 30);
select public.publish_world('ar1');
select public.publish_unit('ar1-u01');
select public.publish_unit('ar1-u02');   -- ar1-u03 stays a draft

-- 1. premium flag -------------------------------------------------------------------------------------------
select pg_temp.check((select not premium from public.units where id = 'ar1-u01'), 'units are free by default');
select pg_temp.check((select not (public.unit_document(u) ? 'premium') from public.units u where id = 'ar1-u01'),
  'a free unit has no "premium" key, so today''s catalog.json is unchanged');
select pg_temp.expect_error($$update public.units set extra = '{"premium": true}' where id = 'ar1-u01'$$, '23514',
  '"premium" cannot sneak in through extra');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select pg_temp.expect_error($$update public.units set premium = true where id = 'ar1-u01'$$, '42501',
  'an editor cannot make a lesson premium');
select pg_temp.expect_error($$select public.set_units_premium(array['ar1-u01'], true)$$, '42501',
  'an editor cannot call set_units_premium');
select pg_temp.check(pg_temp.rows($$update public.units set en = 'One!' where id = 'ar1-u01'$$) = 1,
  'an editor can still edit the unit itself');
select pg_temp.login('00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect_error($$update public.units set premium = true where id = 'ar1-u02'$$, '42501',
  'a reviewer cannot make a lesson premium');
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($$select public.set_units_premium(array['ar1-u01'], true)$$, '42501',
  'a parent cannot call set_units_premium');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.set_units_premium(array['ar1-u01', 'nope-x'], true)$$, 'P0002',
  'set_units_premium refuses an unknown unit and changes nothing');
select pg_temp.check((select public.set_units_premium(array['ar1-u02', 'ar1-u03'], true)) = 1,
  'the owner marks two units premium; only the published one is republished');
select pg_temp.check((select premium from public.units where id = 'ar1-u03'), 'the draft unit is premium too');
select pg_temp.check((select document -> 'premium' = 'true'::jsonb from public.published_content where kind = 'unit' and id = 'ar1-u02'),
  'the published unit now says "premium": true');
select pg_temp.check((select not (document ? 'premium') from public.published_content where kind = 'unit' and id = 'ar1-u01'),
  'a free published unit is unchanged');
select pg_temp.check((select public.set_units_premium(array['ar1-u02'], false)) = 1, 'the owner makes a unit free again');
select pg_temp.check((select not (document ? 'premium') from public.published_content where kind = 'unit' and id = 'ar1-u02'),
  'free again: the key is gone from the published unit');
select pg_temp.check(pg_temp.rows($$update public.units set premium = true where id = 'ar1-u01'$$) = 1,
  'the owner can also set the flag directly (a draft change, live after publishing)');
select pg_temp.check((select count(*) from public.audit_log where table_name = 'units' and row_id = 'ar1-u03'
  and 'premium' = any (changed)) >= 1, 'premium changes are in the audit log');

-- 2. entitlements ------------------------------------------------------------------------------------------
select pg_temp.as_job();
insert into public.entitlements (user_id, source, external_id, store, product_id, active_until, will_renew, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'revenuecat', '00000000-0000-0000-0000-0000000000b1', 'app_store', 'koko_premium_monthly', now() + interval '20 days', true, 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'stripe', 'sub_expired', 'stripe', 'price_x', now() - interval '1 day', false, 'expired');

select pg_temp.as_anon();
select pg_temp.expect_error($$select * from public.entitlements$$, '42501', 'anon cannot read entitlements');
select pg_temp.expect_error($$select public.my_access()$$, '42501', 'anon cannot call my_access');

select pg_temp.login('00000000-0000-0000-0000-0000000000b1');
select pg_temp.check((select count(*) from public.entitlements) = 1, 'a parent sees only their own subscription');
select pg_temp.check((select (public.my_access() ->> 'premium')::boolean), 'my_access: an active subscription is premium');
select pg_temp.check((select public.my_access() -> 'sources' = '["revenuecat"]'::jsonb), 'my_access names the source');
select pg_temp.expect_error($$insert into public.entitlements (user_id, source, external_id, status) values (auth.uid(), 'manual', 'free!', 'active')$$,
  '42501', 'a parent cannot give themselves a subscription');
select pg_temp.expect_error($$update public.entitlements set active_until = now() + interval '10 years'$$, '42501',
  'a parent cannot extend their subscription');
select pg_temp.expect_error($$delete from public.entitlements$$, '42501', 'a parent cannot delete subscription rows');
select pg_temp.expect_error($$select * from public.billing_customers$$, '42501', 'a parent cannot read billing customers');
select pg_temp.expect_error($$select * from public.billing_events$$, '42501', 'a parent cannot read billing events');
select pg_temp.expect_error($$select public.billing_user_by_email('parent.one@example.org')$$, '42501',
  'a parent cannot look up accounts by email');
select pg_temp.expect_error($$select public.billing_summary()$$, '42501', 'a parent cannot see the subscriber count');
select pg_temp.check((select public.current_admin_role() is null and not public.has_permission('edit_content')),
  'a parent account is not an admin');

select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select not (public.my_access() ->> 'premium')::boolean), 'my_access: an expired subscription is not premium');

select pg_temp.login('00000000-0000-0000-0000-0000000000a3');
select pg_temp.check((select count(*) from public.entitlements) = 0, 'an editor cannot see parents'' subscriptions');
select pg_temp.expect_error($$select public.billing_summary()$$, '42501', 'an editor cannot see the subscriber count');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
select pg_temp.check((select public.billing_summary() = '{"active": 1, "renewing": 1, "by_source": {"revenuecat": 1}}'::jsonb),
  'the owner sees counts only: 1 active, 1 renewing, by source');

select pg_temp.as_job();
select pg_temp.check((select public.billing_user_by_email(' PARENT.two@example.ORG ') = '00000000-0000-0000-0000-0000000000b2'),
  'the service role finds a parent by email, ignoring case and spaces');
insert into public.entitlements (user_id, source, external_id, status) values
  ('00000000-0000-0000-0000-0000000000b2', 'manual', 'gift-2026', 'active');
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
select pg_temp.check((select (public.my_access() ->> 'premium')::boolean and public.my_access() -> 'until' = 'null'::jsonb),
  'a manual entitlement without an end date is premium');
select pg_temp.as_job();
select pg_temp.expect_error($$insert into public.entitlements (user_id, source, external_id, status) values
  ('00000000-0000-0000-0000-0000000000b2', 'manual', 'gift-2026', 'active')$$, '23505', 'one row per subscription');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.check((select count(*) from public.entitlements where user_id = '00000000-0000-0000-0000-0000000000b2') = 0,
  'deleting a parent account deletes their subscription rows');

rollback;
\o
\echo 'subscriptions: all checks passed'
