-- Row-level security checks. Runs as each kind of user inside one transaction, then rolls back.
-- Run in the Supabase SQL editor (or via the MCP execute_sql tool); it raises an exception on the first failure.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'lead@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'adult@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'kid@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'nobody@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'stranger@test.local');
insert into public.family_codes values ('RLSTESTCODE');

-- Act as a signed-in user, the way PostgREST does.
create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
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
  nobody uuid := '00000000-0000-0000-0000-00000000000d';
  stranger uuid := '00000000-0000-0000-0000-00000000000e';
  hid uuid; season uuid; new_season uuid; kid_p uuid; gran_p uuid; adult_tok text; kid_tok text; n int;
begin
  -- A wrong family code is refused; the right one makes a household with five groups and a current season.
  perform pg_temp.act(nobody);
  perform pg_temp.check(pg_temp.fails($q$select public.create_household('wrong', 'X')$q$), 'bad family code refused');
  perform pg_temp.act(lead);
  hid := public.create_household(' rlstestcode ', 'Test House');
  perform pg_temp.check((select jsonb_array_length(groups) from public.households) = 5, 'starting groups');
  select id into season from public.seasons;
  perform pg_temp.check(season is not null, 'lead sees the current season');

  insert into public.people (name, kind) values ('Kid', 'child') returning id into kid_p;
  insert into public.people (name) values ('Gran') returning id into gran_p;
  insert into public.budgets (person_id, season_id, amount) values (kid_p, season, 50), (gran_p, season, 20);
  insert into public.gifts (person_id, season_id, name, price, status) values (kid_p, season, 'Bike', 40, 'bought'), (gran_p, season, 'Scarf', 10, 'idea');
  insert into public.invites (role) values ('adult') returning token into adult_tok;
  insert into public.invites (role, person_id, email) values ('child', kid_p, 'KID@test.local') returning token into kid_tok;
  perform pg_temp.check(pg_temp.fails(format($q$update public.people set user_id = %L where id = %L$q$, lead, kid_p)), 'people.user_id is locked');
  perform pg_temp.check(pg_temp.fails($q$update public.members set role = 'child'$q$), 'members.role is locked');

  -- Strangers in another household see nothing of this one and cannot write into it.
  perform pg_temp.act(stranger);
  perform public.create_household('RLSTESTCODE', 'Other House');
  perform pg_temp.check((select count(*) from public.people) = 0, 'stranger sees no people');
  perform pg_temp.check((select count(*) from public.gifts) = 0, 'stranger sees no gifts');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.gifts (household_id, person_id, season_id, name) values (%L, %L, %L, 'x')$q$, hid, gran_p, season)), 'stranger cannot add gifts');
  perform pg_temp.check(pg_temp.fails(format($q$select public.accept_invite('nope')$q$)), 'bad invite token refused');

  -- Invites: single use, and a child invite only works for the email the lead gave.
  perform pg_temp.act(adult);
  perform public.accept_invite(adult_tok);
  perform pg_temp.act(nobody);
  perform pg_temp.check(pg_temp.fails(format($q$select public.accept_invite(%L)$q$, adult_tok)), 'invite is single use');
  perform pg_temp.check(pg_temp.fails(format($q$select public.accept_invite(%L)$q$, kid_tok)), 'child invite needs the right email');
  perform pg_temp.act(kid);
  perform public.accept_invite(kid_tok);

  -- The child sees only themselves and their own wishes: no gifts, budgets, seasons or other people.
  perform pg_temp.check((select count(*) from public.people) = 1, 'child sees only their own profile');
  perform pg_temp.check((select count(*) from public.gifts) = 0, 'child sees no gifts');
  perform pg_temp.check((select count(*) from public.budgets) = 0, 'child sees no budgets');
  perform pg_temp.check((select count(*) from public.seasons) = 0, 'child sees no seasons');
  perform pg_temp.check((select count(*) from public.members) = 1, 'child sees only their own membership');
  insert into public.wishes (person_id, name, price) values (kid_p, 'Puppy', 5);
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.wishes (person_id, name) values (%L, 'x')$q$, gran_p)), 'child cannot wish for others');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.gifts (person_id, season_id, name) values (%L, %L, 'x')$q$, kid_p, season)), 'child cannot add gifts');
  update public.members set theme = 'elf';
  perform pg_temp.check((select theme from public.members) = 'elf', 'child saves their theme');

  -- Adults see everything, read wishes but cannot write them, and cannot make invites.
  perform pg_temp.act(adult);
  perform pg_temp.check((select count(*) from public.gifts) = 2, 'adult sees all gifts');
  perform pg_temp.check((select count(*) from public.wishes) = 1, 'adult reads the wishlist');
  perform pg_temp.check((select count(*) from public.members) = 3, 'adult sees all members');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.wishes (person_id, name) values (%L, 'x')$q$, kid_p)), 'adult cannot write wishes');
  perform pg_temp.check(pg_temp.fails($q$insert into public.invites (role) values ('adult')$q$), 'only the lead invites');
  update public.wishes set name = 'hacked';
  perform pg_temp.check((select name from public.wishes) = 'Puppy', 'adult update of wishes changes nothing');

  -- New year archives the current season, copies budgets, and the old year becomes read-only.
  new_season := public.start_new_year();
  perform pg_temp.check((select count(*) from public.budgets where season_id = new_season) = 2, 'budgets copied to the new year');
  perform pg_temp.check(pg_temp.fails(format($q$insert into public.gifts (person_id, season_id, name) values (%L, %L, 'x')$q$, gran_p, season)), 'archived year rejects new gifts');
  update public.gifts set name = 'changed' where season_id = season;
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'archived year gifts cannot be edited');
  insert into public.gifts (person_id, season_id, name) values (gran_p, new_season, 'Gloves');

  -- Deleting a person removes their gifts, wishes and budgets.
  delete from public.people where id = kid_p;
  perform pg_temp.check((select count(*) from public.gifts where person_id = kid_p) = 0, 'gifts removed with person');

  execute 'reset role';
end $$;

-- Signed-out visitors can only check a family code and look up an invite.
set local role anon;
select pg_temp.check(pg_temp.fails('select * from public.people'), 'anon cannot read people');
select pg_temp.check(public.check_family_code('rlstestcode'), 'anon can check a family code');
reset role;

select 'All RLS tests passed' as result;
rollback;
