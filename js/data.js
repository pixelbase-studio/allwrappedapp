// All data access lives here, backed by Supabase. Row-level security in the database
// (supabase/migrations) decides what each person may read and write; these functions
// only shape the calls and turn errors into friendly words.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm';
import { num, passwordOk } from './util.js';

// The publishable key is meant to be public; row-level security protects the data.
const sb = createClient('https://thalmadesosknniscfrz.supabase.co', 'sb_publishable_Pv7K6_at-neR2BS6IR1wXw_oDWTLBl0');

const fail = msg => { throw new Error(msg); };

function ok({ data, error }) {
  if (!error) return data;
  const m = error.message || '';
  if (/invalid login credentials/i.test(m)) fail("That email and password don't match. Try again?");
  if (/already registered|already been registered/i.test(m)) fail('That email already has an account. Sign in instead?');
  if (/password should/i.test(m)) fail('Your password needs 8 or more characters, with upper and lower case letters and a number.');
  if (/anonymous sign-ins are disabled/i.test(m)) fail("Kids' sign-in isn't switched on yet. Ask a grown-up.");
  if (/row-level security|permission denied/i.test(m)) fail("Sorry, you can't do that.");
  if (/check constraint/i.test(m)) fail('Please check the details and try again.');
  if (/failed to fetch|network/i.test(m)) fail("Can't reach the North Pole. Check your internet connection.");
  fail(m); // our database functions already raise friendly messages
}

let me = null; // { userId, householdId, role, personId } of the signed-in member

// Links are clicked by other family members, so only ever store web addresses.
const cleanUrl = u => ((u = (u ?? '').trim()) && !/^https?:\/\//i.test(u) ? 'https://' + u : u);

async function signUp(email, password, confirm) {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Please enter a real email address.');
  if (!passwordOk(password)) fail('Your password needs 8 or more characters, with upper and lower case letters and a number.');
  if (password !== confirm) fail("The two passwords don't match.");
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
  const m = ok(await sb.from('members').select('role, theme, email, person_id, household:households(id, name, groups)').eq('user_id', userId).maybeSingle());
  if (!m) return (me = null); // signed in, but never finished joining a household
  me = { userId, householdId: m.household.id, role: m.role, personId: m.person_id };
  const person = m.person_id && ok(await sb.from('people').select('*').eq('id', m.person_id).single());
  return { email: m.email, theme: m.theme, role: m.role, household: m.household, person: person || null };
}

export async function setTheme(theme) {
  ok(await sb.from('members').update({ theme }).eq('user_id', me.userId));
}

export async function createHousehold({ code, name, email, password, confirm }) {
  if (!name.trim()) fail('Please give your family a name.');
  if (!ok(await sb.rpc('check_family_code', { p_code: code }))) fail("That start-a-family code isn't right.");
  await signUp(email, password, confirm);
  ok(await sb.rpc('create_household', { p_code: code, p_name: name.trim() }));
}

// The family's name for a grown-ups' join code, or null if the code is wrong.
export async function checkJoinCode(code) {
  return ok(await sb.rpc('check_join_code', { p_code: code }));
}

export async function joinHousehold({ code, email, password, confirm }) {
  if (!(await checkJoinCode(code))) fail("That family code isn't right. Check with the grown-up who shared it.");
  await signUp(email, password, confirm);
  ok(await sb.rpc('join_household', { p_code: code }));
}

// The family's children (first name and avatar) for a kids' code, so a child can tap their own face.
export async function kidsForCode(code) {
  return ok(await sb.rpc('kids_for_code', { p_code: code }));
}

// Children have no password: an anonymous session on this device is linked to their profile.
export async function kidSignIn(code, name) {
  if (!name.trim()) fail("What's your first name?");
  if (!code.trim()) fail("Type the kids' code a grown-up gave you.");
  ok(await sb.auth.signInAnonymously());
  try { ok(await sb.rpc('kid_sign_in', { p_code: code, p_name: name })); }
  catch (e) { await sb.auth.signOut(); throw e; }
}

export async function saveGroups(groups) {
  ok(await sb.from('households').update({ groups }).eq('id', me.householdId));
  // People in a deleted group stay, with no group.
  let q = sb.from('people').update({ group: null }).eq('household_id', me.householdId).not('group', 'is', null);
  if (groups.length) q = q.not('group', 'in', `(${groups.map(g => `"${g.id}"`).join(',')})`);
  ok(await q);
}

// ---- Family codes and members ----

export async function getCodes() {
  return ok(await sb.from('household_codes').select('join_code, kids_code').single());
}

// which: 'join' or 'kids'. Returns the new code; the old one stops working.
export async function resetCode(which) {
  return ok(await sb.rpc('reset_code', { p_which: which }));
}

// One row per grown-up, and one per device a child has signed in on (person_id set).
export async function listMembers() {
  return ok(await sb.from('members').select('email, role, person_id').order('created_at'));
}

// ---- Seasons ----

export async function listSeasons() {
  return ok(await sb.from('seasons').select('*').order('year', { ascending: false }));
}

export async function updateSeason(id, { overall_budget }) {
  ok(await sb.from('seasons').update({ overall_budget: num(overall_budget) }).eq('id', id));
}

// This Christmas's season id, for children's own lists (children cannot read seasons).
export async function currentSeason() {
  return ok(await sb.rpc('current_season'));
}

// Archives the current year and starts the next one with the same people and budgets.
export async function startNewYear() {
  return ok(await sb.rpc('start_new_year'));
}

// ---- People and budgets ----

// Grown-ups get the family list; a child with their own lists gets just the people on them.
export async function listPeople() {
  const rows = ok(await sb.from('people').select('*').order('name'));
  return me?.role === 'child' ? rows.filter(p => p.id !== me.personId) : rows;
}

export async function addPerson({ name, kind, group, avatar, age_band, own_lists = false }, seasonId, budget) {
  if (!name.trim()) fail('Every person needs a name.');
  const row = me.role === 'child'
    ? { name: name.trim(), avatar, kind: 'other', owner_id: me.personId } // on the child's own private list
    : { name: name.trim(), kind, group, avatar, age_band: kind === 'child' ? age_band : null, own_lists: kind === 'child' && own_lists };
  const p = ok(await sb.from('people').insert(row).select().single());
  if (num(budget) != null) await setBudget(p.id, seasonId, budget);
  return p;
}

const PERSON_FIELDS = ['name', 'group', 'avatar', 'age_band', 'interests', 'hobbies', 'notes', 'own_lists'];

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
