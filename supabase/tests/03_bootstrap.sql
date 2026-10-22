-- Migration 10: the first owner can be created once, only from a trusted connection; the uploads bucket is private;
-- units can be reordered in one step and the new order published.
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

select pg_temp.check((select not public from storage.buckets where id = 'uploads'), 'the uploads bucket exists and is private');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'First.Owner@example.org');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
select pg_temp.expect_error($$select public.bootstrap_first_owner('first.owner@example.org', 'Owner')$$, '42501',
  'a signed-in user cannot make themselves owner');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error($$select public.bootstrap_first_owner('nobody@example.org', 'Owner')$$, 'P0002',
  'bootstrap needs an existing auth user');
select public.bootstrap_first_owner('first.owner@example.org', 'Dr. Owner');
select pg_temp.check((select role = 'owner' and email = 'first.owner@example.org' from public.admins), 'the first owner is created (email lower-cased)');
select pg_temp.expect_error($$select public.bootstrap_first_owner('first.owner@example.org', 'Owner')$$, '23514',
  'bootstrap works only once, while there are no admins');

-- reorder_units / publish_unit_order
insert into public.worlds (id, en, ar, tint, ink, sort) values ('isl1', 'Islamic Studies', 'إسلامية', '#E6F4F3', '#085a5a', 10);
insert into public.units (id, world_id, n, ar, en, sort) values
  ('isl1-l01', 'isl1', '1', 'أ', 'One', 10), ('isl1-l02', 'isl1', '2', 'ب', 'Two', 20), ('isl1-l03', 'isl1', '3', 'ج', 'Three', 30);
select public.publish_world('isl1');
select public.publish_unit(id) from public.units;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
select public.reorder_units('isl1', array['isl1-l03', 'isl1-l01', 'isl1-l02']);
select pg_temp.check((select string_agg(id, ',' order by sort) from public.units) = 'isl1-l03,isl1-l01,isl1-l02',
  'an admin with edit rights reorders units in one step');
select pg_temp.expect_error($$select public.reorder_units('isl1', array['isl1-l03', 'isl1-l01'])$$, '22023',
  'a reorder must name every unit of the world');
select pg_temp.check((select string_agg(id, ',' order by sort) from public.published_content where kind = 'unit') = 'isl1-l01,isl1-l02,isl1-l03',
  'a reorder is not public until it is published');
select public.publish_unit_order('isl1');
select pg_temp.check((select string_agg(id, ',' order by sort) from public.published_content where kind = 'unit') = 'isl1-l03,isl1-l01,isl1-l02',
  'publish_unit_order makes the new order public');
reset role;

rollback;
\o
\echo 'bootstrap: all checks passed'
