-- All Wrapped schema. Every table carries household_id and is protected by row-level security.
-- Clients only ever see their own household; a child account sees only its own profile and wishes.

-- ---------- Households and members ----------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  groups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  role text not null check (role in ('lead', 'adult', 'child')),
  email text not null,
  theme text not null default 'santa' check (theme in ('santa', 'elf', 'snowman')),
  created_at timestamptz not null default now()
);
create index members_household_idx on public.members (household_id);

-- Helpers used by the policies. Security definer so they can read members without recursing into its own policy.
create function public.my_household() returns uuid
language sql stable security definer set search_path = '' as $$
  select household_id from public.members where user_id = auth.uid()
$$;

create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.members where user_id = auth.uid()
$$;

create function public.is_adult() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('lead', 'adult') from public.members where user_id = auth.uid()), false)
$$;

-- ---------- People, seasons, budgets, gifts, wishes, invites ----------

create table public.people (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'adult' check (kind in ('adult', 'child', 'other')),
  "group" text,
  avatar text not null default 'santa',
  age_band text,
  interests text not null default '',
  hobbies text not null default '',
  notes text not null default '',
  user_id uuid unique references auth.users (id) on delete set null, -- links a child profile to the child's login
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create function public.my_person() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.people where user_id = auth.uid()
$$;

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households (id) on delete cascade,
  year int not null check (year between 2000 and 2200),
  overall_budget numeric(10, 2) check (overall_budget >= 0),
  archived boolean not null default false,
  unique (household_id, year),
  unique (household_id, id)
);
create unique index seasons_one_current_idx on public.seasons (household_id) where not archived;

-- Composite foreign keys keep every child row inside the same household as its person and season.
create table public.budgets (
  household_id uuid not null default public.my_household(),
  person_id uuid not null,
  season_id uuid not null,
  amount numeric(10, 2) not null check (amount >= 0),
  primary key (person_id, season_id),
  foreign key (household_id, person_id) references public.people (household_id, id) on delete cascade,
  foreign key (household_id, season_id) references public.seasons (household_id, id) on delete cascade
);
create index budgets_household_person_idx on public.budgets (household_id, person_id);
create index budgets_household_season_idx on public.budgets (household_id, season_id);

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household(),
  person_id uuid not null,
  season_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  note text not null default '',
  url text not null default '' check (url = '' or url ~* '^https?://'),
  price numeric(10, 2) check (price >= 0),
  status text not null default 'idea' check (status in ('idea', 'to buy', 'bought', 'received', 'wrapped')),
  added_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, person_id) references public.people (household_id, id) on delete cascade,
  foreign key (household_id, season_id) references public.seasons (household_id, id) on delete cascade
);
create index gifts_household_person_idx on public.gifts (household_id, person_id);
create index gifts_household_season_idx on public.gifts (household_id, season_id);
create index gifts_added_by_idx on public.gifts (added_by);

create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household(),
  person_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  url text not null default '' check (url = '' or url ~* '^https?://'),
  price numeric(10, 2) check (price >= 0),
  created_at timestamptz not null default now(),
  foreign key (household_id, person_id) references public.people (household_id, id) on delete cascade
);
create index wishes_household_person_idx on public.wishes (household_id, person_id);

create table public.invites (
  token text primary key default encode(extensions.gen_random_bytes(18), 'hex'),
  household_id uuid not null default public.my_household() references public.households (id) on delete cascade,
  role text not null check (role in ('adult', 'child')),
  person_id uuid,
  email text,
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, person_id) references public.people (household_id, id) on delete cascade,
  check ((role = 'child') = (person_id is not null)),
  check (role = 'adult' or email is not null)
);
create index invites_household_person_idx on public.invites (household_id, person_id);
create index invites_used_by_idx on public.invites (used_by);

-- Family codes gate "Start a new family". No policies: only the functions below can read it.
create table public.family_codes (code text primary key);

-- ---------- Row-level security ----------

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.people enable row level security;
alter table public.seasons enable row level security;
alter table public.budgets enable row level security;
alter table public.gifts enable row level security;
alter table public.wishes enable row level security;
alter table public.invites enable row level security;
alter table public.family_codes enable row level security;

create policy "members read their household" on public.households for select to authenticated
  using (id = (select public.my_household()));
create policy "adults edit their household" on public.households for update to authenticated
  using (id = (select public.my_household()) and (select public.is_adult()))
  with check (id = (select public.my_household()));

create policy "adults see members, children see themselves" on public.members for select to authenticated
  using (household_id = (select public.my_household()) and ((select public.is_adult()) or user_id = (select auth.uid())));
create policy "members change their own theme" on public.members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "adults see people, children see themselves" on public.people for select to authenticated
  using (household_id = (select public.my_household()) and ((select public.is_adult()) or user_id = (select auth.uid())));
create policy "adults add people" on public.people for insert to authenticated
  with check (household_id = (select public.my_household()) and (select public.is_adult()));
create policy "adults edit people" on public.people for update to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()))
  with check (household_id = (select public.my_household()));
create policy "adults delete people" on public.people for delete to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()));

create policy "adults see seasons" on public.seasons for select to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()));
create policy "adults edit the current season" on public.seasons for update to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()) and not archived)
  with check (household_id = (select public.my_household()) and not archived);

-- Budgets and gifts: adults only, and past (archived) years are read-only.
create policy "adults see budgets" on public.budgets for select to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult()));
create policy "adults add budgets" on public.budgets for insert to authenticated
  with check (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));
create policy "adults edit budgets" on public.budgets for update to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived))
  with check (household_id = (select public.my_household())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));
create policy "adults delete budgets" on public.budgets for delete to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));

-- A child account can never read gifts, and never gifts for its own profile.
create policy "adults see gifts, never for themselves" on public.gifts for select to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult())
    and person_id is distinct from (select public.my_person()));
create policy "adults add gifts" on public.gifts for insert to authenticated
  with check (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));
create policy "adults edit gifts" on public.gifts for update to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived))
  with check (household_id = (select public.my_household())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));
create policy "adults delete gifts" on public.gifts for delete to authenticated
  using (household_id = (select public.my_household()) and (select public.is_adult())
    and exists (select 1 from public.seasons s where s.id = season_id and not s.archived));

-- Wishes: adults read them for inspiration; only the child who owns them writes them.
create policy "adults and the owning child read wishes" on public.wishes for select to authenticated
  using (household_id = (select public.my_household())
    and ((select public.is_adult()) or person_id = (select public.my_person())));
create policy "a child adds their own wishes" on public.wishes for insert to authenticated
  with check (household_id = (select public.my_household()) and person_id = (select public.my_person()));
create policy "a child edits their own wishes" on public.wishes for update to authenticated
  using (household_id = (select public.my_household()) and person_id = (select public.my_person()))
  with check (household_id = (select public.my_household()) and person_id = (select public.my_person()));
create policy "a child deletes their own wishes" on public.wishes for delete to authenticated
  using (household_id = (select public.my_household()) and person_id = (select public.my_person()));

create policy "the lead adult sees invites" on public.invites for select to authenticated
  using (household_id = (select public.my_household()) and (select public.my_role()) = 'lead');
create policy "the lead adult creates invites" on public.invites for insert to authenticated
  with check (household_id = (select public.my_household()) and (select public.my_role()) = 'lead' and used_by is null);

-- ---------- Privileges: signed-out visitors get nothing; columns that must not change are locked ----------

revoke all on all tables in schema public from anon;
revoke insert, update on public.households, public.members, public.seasons, public.people from authenticated;
grant update (name, groups) on public.households to authenticated;
grant update (theme) on public.members to authenticated;
grant update (overall_budget) on public.seasons to authenticated;
grant insert (name, kind, "group", avatar, age_band, interests, hobbies, notes) on public.people to authenticated;
grant update (name, kind, "group", avatar, age_band, interests, hobbies, notes) on public.people to authenticated;
revoke all on public.family_codes from authenticated;

-- ---------- Functions the app calls ----------

-- The Christmas being planned: this year's, or next year's once Boxing Day arrives (UK time).
create function public.christmas_year() returns int
language sql stable set search_path = '' as $$
  select extract(year from d)::int + case when extract(month from d) = 12 and extract(day from d) > 25 then 1 else 0 end
  from (select (now() at time zone 'Europe/London')::date as d) t
$$;

create function public.check_family_code(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_codes where code = upper(trim(p_code)))
$$;

create function public.create_household(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if not public.check_family_code(p_code) then raise exception 'That family code isn''t right.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You already belong to a household.'; end if;
  insert into public.households (name, groups)
  values (trim(p_name), (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'name', n) order by i)
                         from unnest(array['Kids', 'Grandparents', 'Family', 'Friends', 'Teachers']) with ordinality t (n, i)))
  returning id into v_id;
  insert into public.members (user_id, household_id, role, email)
  select auth.uid(), v_id, 'lead', email from auth.users where id = auth.uid();
  insert into public.seasons (household_id, year) values (v_id, public.christmas_year());
  return v_id;
end;
$$;

create function public.get_invite(p_token text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('role', i.role, 'email', i.email, 'household', h.name, 'person', p.name)
  from public.invites i
  join public.households h on h.id = i.household_id
  left join public.people p on p.id = i.person_id
  where i.token = p_token and i.used_by is null and i.expires_at > now()
$$;

create function public.accept_invite(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.invites;
  v_email text;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into v_invite from public.invites
  where token = p_token and used_by is null and expires_at > now() for update;
  if not found then raise exception 'This invite has expired or been used.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then raise exception 'You already belong to a household.'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if v_invite.email is not null and lower(v_invite.email) <> lower(v_email) then
    raise exception 'Please use the email address this invite was made for.';
  end if;
  insert into public.members (user_id, household_id, role, email) values (auth.uid(), v_invite.household_id, v_invite.role, v_email);
  if v_invite.person_id is not null then
    update public.people set user_id = auth.uid() where id = v_invite.person_id and user_id is null;
    if not found then raise exception 'That child already has a login.'; end if;
  end if;
  update public.invites set used_by = auth.uid() where token = p_token;
end;
$$;

-- Archives the current year and starts the next one, keeping the people and their budgets.
create function public.start_new_year() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_cur public.seasons;
  v_new uuid;
begin
  if not public.is_adult() then raise exception 'Only grown-ups can do that.'; end if;
  select * into v_cur from public.seasons where household_id = public.my_household() and not archived for update;
  if not found then raise exception 'There is no current Christmas to archive.'; end if;
  update public.seasons set archived = true where id = v_cur.id;
  insert into public.seasons (household_id, year, overall_budget) values (v_cur.household_id, v_cur.year + 1, v_cur.overall_budget)
  returning id into v_new;
  insert into public.budgets (household_id, person_id, season_id, amount)
  select household_id, person_id, v_new, amount from public.budgets where season_id = v_cur.id;
  return v_new;
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_family_code(text), public.get_invite(text) to anon;
