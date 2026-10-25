-- Sign-in rethink: grown-ups join a family with a 6-character join code; children sign in
-- without a password using a separate kids' code and their name (an anonymous Supabase session
-- linked to their child profile). Invite links are retired.

-- 6 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
create function public.new_code() returns text
language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(b, i) % 31, 1), '')
  from (select extensions.gen_random_bytes(6) b) r, generate_series(0, 5) i
$$;

-- Kept apart from households so a child account (which can read its household) never sees the codes.
create table public.household_codes (
  household_id uuid primary key references public.households (id) on delete cascade,
  join_code text not null unique default public.new_code(),
  kids_code text not null unique default public.new_code(),
  check (join_code <> kids_code)
);
insert into public.household_codes (household_id) select id from public.households;
alter table public.household_codes enable row level security;
create policy "adults see their family codes" on public.household_codes for select to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()));

-- A child's sign-in now lives on members (one row per device), not on people.
alter table public.members add column person_id uuid, alter column email drop not null;
alter table public.members add constraint members_person_fk
  foreign key (household_id, person_id) references public.people (household_id, id) on delete cascade;
create index members_household_person_idx on public.members (household_id, person_id);
update public.members m set person_id = p.id from public.people p where p.user_id = m.user_id;
alter table public.members add constraint members_child_has_person check ((role = 'child') = (person_id is not null));

create or replace function public.my_person() returns uuid
language sql stable security definer set search_path = '' as $$
  select person_id from public.members where user_id = auth.uid()
$$;

drop policy "adults see people, children see themselves" on public.people;
create policy "adults see people, children see themselves" on public.people for select to authenticated
  using (household_id = (select public.my_household()) and ((select public.is_adult()) or id = (select public.my_person())));
alter table public.people drop column user_id;

-- Privacy: for a child we store only first name, age band and wishes.
alter table public.people add constraint people_child_privacy
  check (kind <> 'child' or (interests = '' and hobbies = '' and notes = ''));

drop function public.get_invite(text);
drop function public.accept_invite(text);
drop table public.invites;

-- ---------- Functions ----------

create or replace function public.create_household(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'Please sign up with an email address.'; end if;
  if not public.check_family_code(p_code) then raise exception 'That family code isn''t right.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You already belong to a family.'; end if;
  insert into public.households (name, groups)
  values (trim(p_name), (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', n) order by i)
                         from unnest(array['Kids', 'Grandparents', 'Family', 'Friends', 'Teachers']) with ordinality t (n, i)))
  returning id into v_id;
  insert into public.household_codes (household_id) values (v_id);
  insert into public.members (user_id, household_id, role, email)
  select auth.uid(), v_id, 'lead', email from auth.users where id = auth.uid();
  insert into public.seasons (household_id, year) values (v_id, public.christmas_year());
  return v_id;
end;
$$;

-- Lets the join screen check a code before creating an account. Returns the family's name, or null.
create function public.check_join_code(p_code text) returns text
language sql stable security definer set search_path = '' as $$
  select h.name from public.household_codes c join public.households h on h.id = c.household_id
  where c.join_code = upper(trim(p_code))
$$;

create function public.join_household(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'Please sign up with an email address.'; end if;
  select household_id into v_household from public.household_codes where join_code = upper(trim(p_code));
  if not found then raise exception 'That family code isn''t right. Check with the grown-up who shared it.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You already belong to a family.'; end if;
  insert into public.members (user_id, household_id, role, email)
  select auth.uid(), v_household, 'adult', email from auth.users where id = auth.uid();
  return v_household;
end;
$$;

-- Called from an anonymous session: links this device to the child profile with that name.
create function public.kid_sign_in(p_code text, p_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid;
  v_person uuid;
  v_count int;
begin
  if auth.uid() is null or not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Please use the kids'' sign-in.';
  end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You''re already signed in.'; end if;
  select household_id into v_household from public.household_codes where kids_code = upper(trim(p_code));
  if not found then raise exception 'That code isn''t right. Ask a grown-up for the kids'' code.'; end if;
  select count(*), min(id::text)::uuid into v_count, v_person from public.people
  where household_id = v_household and kind = 'child' and lower(trim(name)) = lower(trim(p_name));
  if v_count = 0 then raise exception 'We couldn''t find that name. Ask a grown-up to add you in Settings.'; end if;
  if v_count > 1 then raise exception 'Two children have that name. Ask a grown-up to make the names different.'; end if;
  insert into public.members (user_id, household_id, role, person_id) values (auth.uid(), v_household, 'child', v_person);
end;
$$;

-- A grown-up can swap a code that has been shared too widely.
create function public.reset_code(p_which text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := public.new_code();
begin
  if not public.is_adult() then raise exception 'Only grown-ups can do that.'; end if;
  if p_which = 'join' then update public.household_codes set join_code = v_code where household_id = public.my_household();
  elsif p_which = 'kids' then update public.household_codes set kids_code = v_code where household_id = public.my_household();
  else raise exception 'Unknown code.';
  end if;
  return v_code;
end;
$$;

revoke all on public.household_codes from anon;
revoke insert, update, delete on public.household_codes from authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_family_code(text), public.check_join_code(text) to anon;
