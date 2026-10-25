// All data access lives here, backed by Supabase. Row-level security in the database
// (supabase/migrations) decides what each person may read and write; these functions
// only shape the calls and turn errors into friendly words.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm';
import { num } from './util.js';

// The publishable key is meant to be public; row-level security protects the data.
const sb = createClient('https://thalmadesosknniscfrz.supabase.co', 'sb_publishable_Pv7K6_at-neR2BS6IR1wXw_oDWTLBl0');

const fail = msg => { throw new Error(msg); };

function ok({ data, error }) {
  if (!error) return data;
  const m = error.message || '';
  if (/invalid login credentials/i.test(m)) fail("That email and password don't match. Try again?");
  if (/already registered|already been registered/i.test(m)) fail('That email already has an account. Sign in instead?');
  if (/password should/i.test(m)) fail('Passwords need at least 6 characters.');
  if (/row-level security|permission denied/i.test(m)) fail("Sorry, you can't do that.");
  if (/check constraint/i.test(m)) fail('Please check the details and try again.');
  if (/failed to fetch|network/i.test(m)) fail("Can't reach the North Pole. Check your internet connection.");
  fail(m); // our database functions already raise friendly messages
}

let me = null; // { userId, householdId } of the signed-in member

// Links are clicked by other family members, so only ever store web addresses.
const cleanUrl = u => ((u = (u ?? '').trim()) && !/^https?:\/\//i.test(u) ? 'https://' + u : u);

async function signUp(email, password) {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Please enter a real email address.');
  if (password.length < 6) fail('Passwords need at least 6 characters.');
  const data = ok(await sb.auth.signUp({ email, password }));
  if (!data.session) fail('Your account was made, but Supabase is still asking for email confirmation. Switch it off in the Supabase dashboard.');
}

// ---- Auth and household ----

export async function signIn(email, password) {
  ok(await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
}

export async function signOut() {
  me = null;
  await sb.auth.signOut();
}

export async function getSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (me = null);
  const userId = session.user.id;
  const m = ok(await sb.from('members').select('role, theme, email, household:households(id, name, groups)').eq('user_id', userId).maybeSingle());
  if (!m) return (me = null); // signed in, but never finished joining a household
  me = { userId, householdId: m.household.id };
  const person = ok(await sb.from('people').select('*').eq('user_id', userId).maybeSingle());
  return { email: m.email, theme: m.theme, role: m.role, household: m.household, person };
}

export async function setTheme(theme) {
  ok(await sb.from('members').update({ theme }).eq('user_id', me.userId));
}

export async function createHousehold({ code, name, email, password }) {
  if (!name.trim()) fail('Please give your household a name.');
  if (!ok(await sb.rpc('check_family_code', { p_code: code }))) fail("That family code isn't right. Check with whoever gave it to you.");
  await signUp(email, password);
  ok(await sb.rpc('create_household', { p_code: code, p_name: name.trim() }));
}

export async function saveGroups(groups) {
  ok(await sb.from('households').update({ groups }).eq('id', me.householdId));
  // People in a deleted group stay, with no group.
  let q = sb.from('people').update({ group: null }).eq('household_id', me.householdId).not('group', 'is', null);
  if (groups.length) q = q.not('group', 'in', `(${groups.map(g => `"${g.id}"`).join(',')})`);
  ok(await q);
}

// ---- Invites ----

export async function createInvite({ role, person_id = null, email = null }) {
  return ok(await sb.from('invites').insert({ role, person_id, email }).select('token').single()).token;
}

export async function getInvite(token) {
  return ok(await sb.rpc('get_invite', { p_token: token }));
}

export async function acceptInvite(token, email, password) {
  const invite = (await getInvite(token)) ?? fail('This invite has expired or been used.');
  if (invite.email && invite.email.toLowerCase() !== email.trim().toLowerCase()) fail('Please use the email address this invite was made for.');
  await signUp(email, password);
  ok(await sb.rpc('accept_invite', { p_token: token }));
}

export async function listMembers() {
  const [members, people] = await Promise.all([
    sb.from('members').select('email, role, user_id').order('created_at'),
    sb.from('people').select('name, user_id').not('user_id', 'is', null),
  ]);
  return ok(members).map(m => ({ email: m.email, role: m.role, person: ok(people).find(p => p.user_id === m.user_id)?.name ?? '' }));
}

export async function listInvites() {
  return ok(await sb.from('invites').select('*').is('used_by', null).gt('expires_at', new Date().toISOString()));
}

// ---- Seasons ----

export async function listSeasons() {
  return ok(await sb.from('seasons').select('*').order('year', { ascending: false }));
}

export async function updateSeason(id, { overall_budget }) {
  ok(await sb.from('seasons').update({ overall_budget: num(overall_budget) }).eq('id', id));
}

// Archives the current year and starts the next one with the same people and budgets.
export async function startNewYear() {
  return ok(await sb.rpc('start_new_year'));
}

// ---- People and budgets ----

export async function listPeople() {
  return ok(await sb.from('people').select('*').order('name'));
}

export async function addPerson({ name, kind, group, avatar, age_band }, seasonId, budget) {
  if (!name.trim()) fail('Every person needs a name.');
  const p = ok(await sb.from('people').insert({ name: name.trim(), kind, group, avatar, age_band: kind === 'child' ? age_band : null }).select().single());
  if (num(budget) != null) await setBudget(p.id, seasonId, budget);
  return p;
}

const PERSON_FIELDS = ['name', 'group', 'avatar', 'age_band', 'interests', 'hobbies', 'notes'];

export async function updatePerson(id, patch) {
  const row = Object.fromEntries(Object.entries(patch).filter(([k]) => PERSON_FIELDS.includes(k)));
  if ('name' in row && !(row.name = row.name.trim())) fail('Every person needs a name.');
  ok(await sb.from('people').update(row).eq('id', id));
}

// Their gifts, wishes and budgets go too (the database cascades the delete).
export async function deletePerson(id) {
  ok(await sb.from('people').delete().eq('id', id));
}

export async function listBudgets(seasonId) {
  return ok(await sb.from('budgets').select('*').eq('season_id', seasonId));
}

export async function setBudget(person_id, season_id, amount) {
  if (num(amount) == null) ok(await sb.from('budgets').delete().eq('person_id', person_id).eq('season_id', season_id));
  else ok(await sb.from('budgets').upsert({ person_id, season_id, amount: num(amount) }, { onConflict: 'person_id,season_id' }));
}

// ---- Gifts (adult ideas; a child account can never read these) ----

export async function listGifts(seasonId) {
  return ok(await sb.from('gifts').select('*').eq('season_id', seasonId).order('created_at'));
}

const giftFields = ({ name = '', price, url = '', note = '', status = 'idea' }) =>
  (name.trim() ? { name: name.trim(), price: num(price), url: cleanUrl(url), note: note.trim(), status } : fail('Give the gift a name.'));

export async function addGift({ person_id, season_id, ...g }) {
  return ok(await sb.from('gifts').insert({ person_id, season_id, ...giftFields(g) }).select().single());
}

export async function updateGift(id, patch) {
  ok(await sb.from('gifts').update('name' in patch ? giftFields(patch) : { status: patch.status }).eq('id', id));
}

export async function deleteGift(id) {
  ok(await sb.from('gifts').delete().eq('id', id));
}

// ---- Wishes (the child's own list; adults read them, only that child writes them) ----

const wishFields = ({ name = '', url = '', price }) =>
  (name.trim() ? { name: name.trim(), url: cleanUrl(url), price: num(price) } : fail('What would you like? Give your wish a name.'));

export async function listWishes(person_id) {
  return ok(await sb.from('wishes').select('*').eq('person_id', person_id).order('created_at'));
}

export async function addWish({ person_id, ...w }) {
  return ok(await sb.from('wishes').insert({ person_id, ...wishFields(w) }).select().single());
}

export async function updateWish(id, patch) {
  ok(await sb.from('wishes').update(wishFields(patch)).eq('id', id));
}

export async function deleteWish(id) {
  ok(await sb.from('wishes').delete().eq('id', id));
}
