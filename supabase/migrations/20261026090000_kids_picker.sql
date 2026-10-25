-- Kids' sign-in by tapping their own face: for a valid kids' code, list the family's children
-- (first name and avatar only) so a child can pick themselves instead of typing their name.
-- Anyone with the kids' code is family; a wrong code returns nothing.
create function public.kids_for_code(p_code text) returns table (name text, avatar text)
language sql stable security definer set search_path = '' as $$
  select p.name, p.avatar
  from public.household_codes c
  join public.people p on p.household_id = c.household_id
  where c.kids_code = upper(trim(p_code)) and p.kind = 'child' and p.owner_id is null
  order by p.name
$$;

revoke execute on function public.kids_for_code(text) from public;
grant execute on function public.kids_for_code(text) to anon, authenticated;
