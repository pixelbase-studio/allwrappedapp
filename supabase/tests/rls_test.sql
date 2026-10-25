-- Row-level security checks. Runs as each kind of user inside one transaction, then rolls back.
-- Run in the Supabase SQL editor (or via the MCP execute_sql tool); it raises an exception on the first failure.
begin;

insert into auth.users (id, email, is_anonymous) values
  ('00000000-0000-0000-0000-00000000000a', 'lead@test.local', false),
  ('00000000-0000-0000-0000-00000000000b', 'adult@test.local', false),
  ('00000000-0000-0000-0000-00000000000c', null, true),  -- a child's device (anonymous session)
  ('00000000-0000-0000-0000-00000000000f', null, true),  -- the same child's second device
  ('00000000-0000-0000-0000-00000000000d', 'nobody@test.local', false),
  ('00000000-0000-0000-0000-00000000000e', 'stranger@test.local', false);
insert into public.family_codes values ('RLSTESTCODE');

-- Act as a signed-in user, the way PostgREST does.
create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
    'is_anonymous', (select is_anonymous from auth.users where id = uid))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'RLS TEST FAILED: %', what; end if; end $$;

do $$
declare
  lead uuid := '00000000-0000-0000-0000-00000000000a';
  adult uuid := '00000000-0000-0000-0000-00000000000b';
  kid uuid := '00000000-0000-0000-0000-00000000000c';
  kid2 uuid := '00000000-0000-0000-0000-00000000000f';
  nobody uuid := '00000000-0000-0000-0000-00000000000d';
  stranger uuid := '00000000-0000-0000-0000-00000000000e';
  season uuid; new_season uuid; kid_p uuid; gran_p uuid; join_c text; kids_c text; old_kids_c text; n int;
begin
  -- Starting a family needs the creation code and an email account.
  perform pg_temp.act(nobody);
  perform pg_temp.check(pg_temp.fails($q$select public.create_household('wrong', 'X')$q$), 'bad creation code refused');
  perform pg_temp.act(kid);
  perform pg_temp.check(pg_temp.fails($q$select public.create_household('RLSTESTCODE', 'X')$q$), 'anonymous session cannot start a family');
  perform pg_temp.act(lead);
  perform public.create_household(' rlstestcode ', 'Test House');
  perform pg_temp.check((select jsonb_array_length(groups) from public.households) = 5, 'starting groups');
  select join_code, kids_code into join_c, kids_c from public.household_codes;
  perform pg_temp.check(join_c ~ '^[A-Z2-9]{6}$' and kids_c ~ '^[A-Z2-9]{6}$' and join_c <> kids_c, 'lead sees two different 6-character codes');
  select id into season from public.seasons;

  insert into public.people (name, kind) values ('Kid', 'child') returning id into kid_p;
  insert into public.people (name) values ('Gran') returning id into gran_p;
  perform pg_temp.check(pg_temp.fails($q$insert into public.people (name, kind, notes) values ('Kid2', 'child', 'secret')$q$), 'child profiles cannot hold notes');
  insert into public.budgets (person_id, season_id, amount) values (kid_p, season, 50), (gran_p, season, 20);
  insert into public.gifts (person_id, season_id, name, price, status) values (kid_p, season, 'Bike', 40, 'bought'), (gran_p, season, 'Scarf', 10, 'idea');
  perform pg_temp.check(pg_temp.fails($q$update public.members set role = 'child'$q$), 'members.role is locked');
  perform pg_temp.check(pg_temp.fails($q$update public.household_codes set join_code = 'AAAAAA'$q$), 'codes cannot be edited directly');

  -- Grown-ups join with the join code; a wrong code or an anonymous session is refused.
  perform pg_temp.act(adult);
  perform pg_temp.check(pg_temp.fails($q$select public.join_household('ZZZZZZ')$q$), 'wrong join code refused');
  perform public.join_household(lower(join_c));
  perform pg_temp.check((select role from public.members where user_id = adult) = 'adult', 'joiner is an adult');
  perform pg_temp.check(pg_temp.fails(format($q$select public.join_household(%L)$q$, join_c)), 'cannot join twice');
  perform pg_temp.check(pg_temp.fails(format($q$select public.kid_sign_in(%L, 'Kid')$q$, kids_c)), 'email accounts cannot use the kids sign-in');
  perform pg_temp.act(kid);
  perform pg_temp.check(pg_temp.fails(format($q$select public.join_household(%L)$q$, join_c)), 'a child device cannot join as a grown-up');

  -- Children sign in with the kids' code and their name, on as many devices as they like.
  perform pg_temp.check(pg_temp.fails(format($q$select public.kid_sign_in('ZZZZZZ', 'Kid')$q$)), 'wrong kids code refused');
  perform pg_temp.check(pg_temp.fails(format($q$select public.kid_sign_in(%L, 'Nobody')$q$, kids_c)), 'unknown child name refused');
  perform pg_temp.check(pg_temp.fails(format($q$select public.kid_sign_in(%L, 'Gran')$q$, kids_c)), 'grown-up names cannot be used to sign in');
  perform public.kid_sign_in(lower(kids_c), '  kid ');
  perform pg_temp.act(kid2);
  perform public.kid_sign_in(kids_c, 'Kid');

  -- The child sees only themselves and their own wishes: no gifts, budgets, seasons, codes or other people.
  perform pg_temp.act(kid);
  perform pg_temp.check((select count(*) from public.people) = 1, 'child sees only their own profile');
  perform pg_temp.check((select count(*) from public.gifts) = 0, 'child sees no gifts');
  perform pg_temp.check((select count(*) from public.budgets) = 0, 'child sees no budgets');
  perform pg_temp.check((select count(*) from public.seasons) = 0, 'child sees no seasons');
  perform pg_temp.check((select count(*) from public.household_codes) = 0, 'child cannot see the family codes');
  perform pg_temp.check((select count(*) from public.members) = 1, 'child sees only their own membership');
  perform pg_temp.check(pg_temp.fails($q$select public.reset_code('join')$q$), 'child cannot reset codes');
  insert into public.wishes (person_id, name, price) values (kid_p, 'Puppy', 5);
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.wishes (person_id, name) values (%L, 'x')$q$, gran_p)), 'child cannot wish for others');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.gifts (person_id, season_id, name) values (%L, %L, 'x')$q$, kid_p, season)), 'child cannot add gifts');
  update public.members set theme = 'elf';
  perform pg_temp.check((select theme from public.members) = 'elf', 'child saves their theme');
  perform pg_temp.act(kid2);
  perform pg_temp.check((select count(*) from public.wishes) = 1, 'second device sees the same wishlist');

  -- Strangers in another household see nothing of this one.
  perform pg_temp.act(stranger);
  perform public.create_household('RLSTESTCODE', 'Other House');
  perform pg_temp.check((select count(*) from public.people) = 0, 'stranger sees no people');
  perform pg_temp.check((select count(*) from public.gifts) = 0, 'stranger sees no gifts');
  perform pg_temp.check((select count(*) from public.household_codes where join_code = join_c) = 0, 'stranger cannot see our codes');

  -- Adults see everything, read wishes but cannot write them, and can swap a leaked code.
  perform pg_temp.act(adult);
  perform pg_temp.check((select count(*) from public.gifts) = 2, 'adult sees all gifts');
  perform pg_temp.check((select count(*) from public.wishes) = 1, 'adult reads the wishlist');
  perform pg_temp.check((select count(*) from public.members) = 4, 'adult sees all members, including both child devices');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.wishes (person_id, name) values (%L, 'x')$q$, kid_p)), 'adult cannot write wishes');
  update public.wishes set name = 'hacked';
  perform pg_temp.check((select name from public.wishes) = 'Puppy', 'adult update of wishes changes nothing');
  old_kids_c := kids_c;
  kids_c := public.reset_code('kids');
  perform pg_temp.check(kids_c <> old_kids_c, 'kids code was replaced');
  execute 'reset role';
  update auth.users set is_anonymous = true where id = nobody; -- a fresh child device
  perform pg_temp.act(nobody);
  perform pg_temp.check(pg_temp.fails(format($q$select public.kid_sign_in(%L, 'Kid')$q$, old_kids_c)), 'old kids code stops working');

  -- New year archives the current season, copies budgets, and the old year becomes read-only.
  perform pg_temp.act(adult);
  new_season := public.start_new_year();
  perform pg_temp.check((select count(*) from public.budgets where season_id = new_season) = 2, 'budgets copied to the new year');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.gifts (person_id, season_id, name) values (%L, %L, 'x')$q$, gran_p, season)), 'archived year rejects new gifts');
  update public.gifts set name = 'changed' where season_id = season;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'archived year gifts cannot be edited');

  -- Deleting a child removes their gifts, wishes and device sign-ins.
  delete from public.people where id = kid_p;
  perform pg_temp.check((select count(*) from public.gifts where person_id = kid_p) = 0, 'gifts removed with person');
  perform pg_temp.check((select count(*) from public.members where role = 'child') = 0, 'child devices signed out when the child is deleted');

  execute 'reset role';
end $$;

-- Signed-out visitors can only check a creation code or a join code.
set local role anon;
select pg_temp.check(pg_temp.fails('select * from public.people'), 'anon cannot read people');
select pg_temp.check(pg_temp.fails('select * from public.household_codes'), 'anon cannot read codes');
select pg_temp.check(public.check_family_code('rlstestcode'), 'anon can check a creation code');
select pg_temp.check(public.check_join_code('zzzzzz') is null, 'anon gets nothing for a wrong join code');
reset role;

select 'All RLS tests passed' as result;
rollback;
