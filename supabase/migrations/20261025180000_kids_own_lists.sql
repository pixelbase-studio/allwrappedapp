-- Children's own gift lists. A grown-up can switch on own_lists for a child; that child can then
-- keep people (owner_id = the child's profile) and gifts for them that only the child can see.
-- Grown-ups and other children never see these rows. Switching it off hides them; nothing is deleted.

alter table public.people
  add column own_lists boolean not null default false,
  add column owner_id uuid;
alter table public.people add constraint people_owner_fk
  foreign key (household_id, owner_id) references public.people (household_id, id) on delete cascade;
create index people_household_owner_idx on public.people (household_id, owner_id);
alter table public.people add constraint people_owned_not_child check (owner_id is null or kind <> 'child');
alter table public.people add constraint people_own_lists_children_only check (not own_lists or kind = 'child');

-- Helpers. Security definer so they read past row-level security: a grown-up must never be able to
-- "not see" a child's private person and so mistake it for a family one.
create function public.person_owner(p_person uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_id from public.people where id = p_person
$$;

create function public.can_make_lists() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select own_lists from public.people where id = public.my_person()), false)
$$;

-- Grown-ups: family gifts, never their own (a child's, if they are one). Children: gifts on their own lists.
create function public.gift_visible(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when public.is_adult()
    then public.person_owner(p_person) is null and p_person is distinct from public.my_person()
    else public.can_make_lists() and public.person_owner(p_person) = public.my_person()
  end
$$;

create function public.season_open(p_season uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.seasons where id = p_season and household_id = public.my_household() and not archived)
$$;

-- Children cannot read seasons (they hold the grown-ups' budget), so they ask for this year's id.
create function public.current_season() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.seasons where household_id = public.my_household() and not archived
$$;

-- ---------- People ----------

drop policy "adults see people, children see themselves" on public.people;
drop policy "adults add people" on public.people;
drop policy "adults edit people" on public.people;
drop policy "adults delete people" on public.people;

create policy "grown-ups see family people, children see themselves and their own lists" on public.people
  for select to authenticated using (household_id = (select public.my_household()) and (
    ((select public.is_adult()) and owner_id is null)
    or id = (select public.my_person())
    or (owner_id = (select public.my_person()) and (select public.can_make_lists()))));
create policy "grown-ups add family people, children add to their own lists" on public.people
  for insert to authenticated with check (household_id = (select public.my_household()) and (
    ((select public.is_adult()) and owner_id is null)
    or (owner_id = (select public.my_person()) and (select public.can_make_lists()))));
create policy "grown-ups edit family people, children edit their own lists" on public.people
  for update to authenticated
  using (household_id = (select public.my_household()) and (
    ((select public.is_adult()) and owner_id is null)
    or (owner_id = (select public.my_person()) and (select public.can_make_lists()))))
  with check (household_id = (select public.my_household()) and (
    ((select public.is_adult()) and owner_id is null)
    or (owner_id = (select public.my_person()) and (select public.can_make_lists()))));
create policy "grown-ups delete family people, children delete from their own lists" on public.people
  for delete to authenticated using (household_id = (select public.my_household()) and (
    ((select public.is_adult()) and owner_id is null)
    or (owner_id = (select public.my_person()) and (select public.can_make_lists()))));

revoke insert, update on public.people from authenticated;
grant insert (name, kind, "group", avatar, age_band, interests, hobbies, notes, own_lists, owner_id) on public.people to authenticated;
grant update (name, kind, "group", avatar, age_band, interests, hobbies, notes, own_lists) on public.people to authenticated;

-- ---------- Gifts ----------

drop policy "adults see gifts, never for themselves" on public.gifts;
drop policy "adults add gifts" on public.gifts;
drop policy "adults edit gifts" on public.gifts;
drop policy "adults delete gifts" on public.gifts;

create policy "see the gifts on your lists" on public.gifts for select to authenticated
  using (household_id = (select public.my_household()) and public.gift_visible(person_id));
create policy "add gifts to your lists this year" on public.gifts for insert to authenticated
  with check (household_id = (select public.my_household()) and public.gift_visible(person_id) and public.season_open(season_id));
create policy "edit gifts on your lists this year" on public.gifts for update to authenticated
  using (household_id = (select public.my_household()) and public.gift_visible(person_id) and public.season_open(season_id))
  with check (household_id = (select public.my_household()) and public.gift_visible(person_id) and public.season_open(season_id));
create policy "delete gifts on your lists this year" on public.gifts for delete to authenticated
  using (household_id = (select public.my_household()) and public.gift_visible(person_id) and public.season_open(season_id));

-- A child's private people are never matched by the kids' sign-in.
create or replace function public.kid_sign_in(p_code text, p_name text) returns void
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
  where household_id = v_household and kind = 'child' and owner_id is null and lower(trim(name)) = lower(trim(p_name));
  if v_count = 0 then raise exception 'We couldn''t find that name. Ask a grown-up to add you in Settings.'; end if;
  if v_count > 1 then raise exception 'Two children have that name. Ask a grown-up to make the names different.'; end if;
  insert into public.members (user_id, household_id, role, person_id) values (auth.uid(), v_household, 'child', v_person);
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_family_code(text), public.check_join_code(text) to anon;
