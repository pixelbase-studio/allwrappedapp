// All data access lives here. Stage 1 keeps fake data in memory; Stage 2 swaps each
// function body for a Supabase call with the same name and return shape.
// The checks below mimic the row-level security policies Stage 2 adds in the database.
import { christmasYear, num } from './util.js';

const START_GROUPS = ['Kids', 'Grandparents', 'Family', 'Friends', 'Teachers'];
// shortcut: the family code lives here only for the prototype; Stage 2 checks it in a database function.
const FAMILY_CODES = ['NORTHPOLE'];

let n = 1000;
const uid = () => 'id' + ++n;
const copy = x => JSON.parse(JSON.stringify(x));
const fail = msg => { throw new Error(msg); };

const year = christmasYear();
const db = {
  users: [
    { id: 'u1', email: 'nick@example.com', password: 'jingle', theme: 'santa' },
    { id: 'u2', email: 'holly@example.com', password: 'jingle', theme: 'elf' },
    { id: 'u3', email: 'ivy@example.com', password: 'jingle', theme: 'snowman' },
  ],
  households: [{ id: 'h1', name: 'Our Family', groups: START_GROUPS.map((name, i) => ({ id: 'g' + i, name })) }],
  members: [
    { user_id: 'u1', household_id: 'h1', role: 'lead', email: 'nick@example.com' },
    { user_id: 'u2', household_id: 'h1', role: 'adult', email: 'holly@example.com' },
    { user_id: 'u3', household_id: 'h1', role: 'child', email: 'ivy@example.com' },
  ],
  people: [
    { id: 'p1', name: 'Ivy', kind: 'child', group: 'g0', avatar: 'gingerbread', age_band: '7–10', user_id: 'u3', interests: 'Drawing, horses', hobbies: 'Gymnastics', notes: 'Loves anything sparkly' },
    { id: 'p2', name: 'Jack', kind: 'child', group: 'g0', avatar: 'reindeer', age_band: '4–6', user_id: null, interests: 'Dinosaurs, space', hobbies: 'Football', notes: '' },
    { id: 'p3', name: 'Grandma Joy', kind: 'adult', group: 'g1', avatar: 'snowman', interests: 'Gardening', hobbies: 'Crosswords', notes: 'Size M jumpers' },
    { id: 'p4', name: 'Grandad Bob', kind: 'adult', group: 'g1', avatar: 'penguin', interests: 'Birdwatching', hobbies: 'Golf', notes: '' },
    { id: 'p5', name: 'Holly', kind: 'adult', group: 'g2', avatar: 'elf', interests: 'Cooking', hobbies: 'Running', notes: '' },
    { id: 'p6', name: 'Nick', kind: 'adult', group: 'g2', avatar: 'santa', interests: 'Music', hobbies: 'Cycling', notes: '' },
    { id: 'p7', name: 'Miss Hughes', kind: 'other', group: 'g4', avatar: 'penguin', interests: '', hobbies: '', notes: "Jack's teacher" },
  ].map(p => ({ household_id: 'h1', interests: '', hobbies: '', notes: '', age_band: null, user_id: null, ...p })),
  seasons: [
    { id: 's1', household_id: 'h1', year: year - 1, overall_budget: 450, archived: true },
    { id: 's2', household_id: 'h1', year, overall_budget: 550, archived: false },
  ],
  budgets: [],
  gifts: [],
  wishes: [
    ['p1', 'LEGO Friends treehouse', 35, 'https://www.lego.com/en-gb'],
    ['p1', 'Glitter gel pens', 8],
    ['p1', 'The Worst Witch books'],
    ['p2', 'Dinosaur torch', 12],
    ['p2', 'Glow-in-the-dark stars', 6],
  ].map(([person_id, name, price = null, url = '']) => ({ id: uid(), household_id: 'h1', person_id, name, price, url })),
  invites: [],
};
for (const [s, amounts] of [['s1', [100, 100, 40, 40, 90, 90]], ['s2', [120, 120, 40, 40, 100, 100, 15]]])
  amounts.forEach((amount, i) => db.budgets.push({ household_id: 'h1', person_id: 'p' + (i + 1), season_id: s, amount }));
for (const [season_id, person_id, name, price, status, url = '', note = ''] of [
  ['s2', 'p1', 'Pony stable playset', 45, 'bought', '', 'Hide in the loft'],
  ['s2', 'p1', 'Art set in a tin', 25, 'wrapped'],
  ['s2', 'p1', 'Gymnastics leotard', 22, 'to buy', 'https://example.com/leotard'],
  ['s2', 'p1', 'Gel pens', 8, 'idea'],
  ['s2', 'p2', 'Dinosaur dig kit', 15, 'received'],
  ['s2', 'p2', 'Rocket lamp', 30, 'to buy'],
  ['s2', 'p2', 'Football boots', 40, 'idea'],
  ['s2', 'p3', 'Bulb collection', 18, 'bought'],
  ['s2', 'p3', 'Puzzle book', 9, 'wrapped'],
  ['s2', 'p3', 'Garden kneeler', 25, 'bought'],
  ['s2', 'p4', 'Bird feeder camera', 60, 'bought', '', 'Went over, worth it'],
  ['s2', 'p5', 'Cookbook', 22, 'idea'],
  ['s2', 'p6', 'Bike lights', 35, 'to buy'],
  ['s2', 'p7', 'Box of chocolates', 8, 'idea'],
  ['s1', 'p1', 'Roller skates', 40, 'received'],
  ['s1', 'p2', 'Train set', 55, 'received'],
  ['s1', 'p3', 'Cosy slippers', 25, 'received'],
  ['s1', 'p4', 'Golf balls', 20, 'received'],
])
  db.gifts.push({ id: uid(), household_id: 'h1', season_id, person_id, name, price, status, url, note, added_by: 'u1' });

let me = null; // signed-in user id

const member = () => db.members.find(m => m.user_id === me) ?? fail('Please sign in.');
const hh = () => member().household_id;
const mine = table => db[table].filter(r => r.household_id === hh());
const isChild = () => member().role === 'child';
const ownPerson = () => db.people.find(p => p.user_id === me && p.household_id === hh());
const adultsOnly = () => isChild() && fail('Only grown-ups can do that.');
const leadOnly = () => member().role !== 'lead' && fail('Only the lead adult can do that.');
const find = (table, id) => mine(table).find(r => r.id === id) ?? fail('Not found.');
const insert = (table, row) => { const r = { id: uid(), household_id: hh(), ...row }; db[table].push(r); return copy(r); };
const drop = (table, pred) => { db[table] = db[table].filter(r => r.household_id !== hh() || !pred(r)); };
// Links are clicked by other family members, so only ever store web addresses.
const cleanUrl = u => ((u = (u ?? '').trim()) && !/^https?:\/\//i.test(u) ? 'https://' + u : u);
const openSeason = id => find('seasons', id).archived && fail('Past years are read-only.');

function newUser(email, password) {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) fail('Please enter a real email address.');
  if (password.length < 6) fail('Passwords need at least 6 characters.');
  if (db.users.some(u => u.email === email)) fail('That email already has an account.');
  const u = { id: uid(), email, password, theme: 'santa' };
  db.users.push(u);
  return u;
}

const liveInvite = token => db.invites.find(i => i.token === token && !i.used_by && i.expires_at > Date.now());

// ---- Auth and household ----

export async function signIn(email, password) {
  const u = db.users.find(u => u.email === email.trim().toLowerCase() && u.password === password);
  if (!u) fail("That email and password don't match. Try again?");
  me = u.id;
}

export async function signOut() { me = null; }

export async function getSession() {
  if (!me) return null;
  const u = db.users.find(u => u.id === me), m = member();
  return copy({ email: u.email, theme: u.theme, role: m.role, household: db.households.find(h => h.id === m.household_id), person: ownPerson() ?? null });
}

export async function setTheme(theme) { db.users.find(u => u.id === me).theme = theme; }

export async function createHousehold({ code, name, email, password }) {
  if (!FAMILY_CODES.includes(code.trim().toUpperCase())) fail("That family code isn't right. Check with whoever gave it to you.");
  if (!name.trim()) fail('Please give your household a name.');
  const u = newUser(email, password), id = uid();
  db.households.push({ id, name: name.trim(), groups: START_GROUPS.map(name => ({ id: uid(), name })) });
  db.members.push({ user_id: u.id, household_id: id, role: 'lead', email: u.email });
  db.seasons.push({ id: uid(), household_id: id, year: christmasYear(), overall_budget: null, archived: false });
  me = u.id;
}

export async function saveGroups(groups) {
  adultsOnly();
  db.households.find(h => h.id === hh()).groups = copy(groups);
  for (const p of mine('people')) if (!groups.some(g => g.id === p.group)) p.group = null;
}

// ---- Invites ----

export async function createInvite({ role, person_id = null, email = null }) {
  leadOnly();
  const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  db.invites.push({ token, household_id: hh(), role, person_id, email, expires_at: Date.now() + 7 * 864e5, used_by: null });
  return token;
}

export async function getInvite(token) {
  const i = liveInvite(token);
  if (!i) return null;
  return { role: i.role, email: i.email, household: db.households.find(h => h.id === i.household_id).name, person: db.people.find(p => p.id === i.person_id)?.name ?? null };
}

export async function acceptInvite(token, email, password) {
  const i = liveInvite(token) ?? fail('This invite has expired or been used.');
  const u = newUser(email, password);
  db.members.push({ user_id: u.id, household_id: i.household_id, role: i.role, email: u.email });
  if (i.person_id) db.people.find(p => p.id === i.person_id).user_id = u.id;
  i.used_by = u.id;
  me = u.id;
}

export async function listMembers() {
  adultsOnly();
  return mine('members').map(m => ({ email: m.email, role: m.role, person: db.people.find(p => p.user_id === m.user_id)?.name ?? '' }));
}

export async function listInvites() {
  leadOnly();
  return copy(mine('invites').filter(i => !i.used_by && i.expires_at > Date.now()));
}

// ---- Seasons ----

export async function listSeasons() {
  return copy(mine('seasons').sort((a, b) => b.year - a.year));
}

export async function updateSeason(id, { overall_budget }) {
  adultsOnly();
  openSeason(id);
  find('seasons', id).overall_budget = num(overall_budget);
}

// Archives the current year and starts the next one with the same people and budgets.
export async function startNewYear() {
  adultsOnly();
  const cur = mine('seasons').find(s => !s.archived);
  cur.archived = true;
  const next = insert('seasons', { year: cur.year + 1, overall_budget: cur.overall_budget, archived: false });
  for (const b of mine('budgets').filter(b => b.season_id === cur.id)) db.budgets.push({ ...b, season_id: next.id });
  return next.id;
}

// ---- People and budgets ----

export async function listPeople() {
  return copy(isChild() ? [ownPerson()] : mine('people'));
}

export async function addPerson({ name, kind, group, avatar, age_band }, seasonId, budget) {
  adultsOnly();
  if (!name.trim()) fail('Every person needs a name.');
  const p = insert('people', { name: name.trim(), kind, group, avatar, age_band: kind === 'child' ? age_band : null, user_id: null, interests: '', hobbies: '', notes: '' });
  if (num(budget) != null) await setBudget(p.id, seasonId, budget);
  return p;
}

export async function updatePerson(id, patch) {
  adultsOnly();
  const { name, group, avatar, age_band, interests, hobbies, notes } = { ...find('people', id), ...patch };
  if (!name.trim()) fail('Every person needs a name.');
  Object.assign(find('people', id), { name: name.trim(), group, avatar, age_band, interests, hobbies, notes });
}

export async function deletePerson(id) {
  adultsOnly();
  find('people', id);
  for (const t of ['gifts', 'wishes', 'budgets']) drop(t, r => r.person_id === id);
  drop('people', p => p.id === id);
}

export async function listBudgets(seasonId) {
  return isChild() ? [] : copy(mine('budgets').filter(b => b.season_id === seasonId));
}

export async function setBudget(person_id, season_id, amount) {
  adultsOnly();
  openSeason(season_id);
  drop('budgets', b => b.person_id === person_id && b.season_id === season_id);
  if (num(amount) != null) db.budgets.push({ household_id: hh(), person_id, season_id, amount: num(amount) });
}

// ---- Gifts (adult ideas; a child account can never read these) ----

export async function listGifts(seasonId) {
  return isChild() ? [] : copy(mine('gifts').filter(g => g.season_id === seasonId));
}

const giftFields = ({ name = '', price, url = '', note = '', status = 'idea' }) =>
  (name.trim() ? { name: name.trim(), price: num(price), url: cleanUrl(url), note: note.trim(), status } : fail('Give the gift a name.'));

export async function addGift({ person_id, season_id, ...g }) {
  adultsOnly();
  openSeason(season_id);
  find('people', person_id);
  return insert('gifts', { person_id, season_id, ...giftFields(g), added_by: me });
}

export async function updateGift(id, patch) {
  adultsOnly();
  const g = find('gifts', id);
  openSeason(g.season_id);
  Object.assign(g, giftFields({ ...g, ...patch }));
}

export async function deleteGift(id) {
  adultsOnly();
  openSeason(find('gifts', id).season_id);
  drop('gifts', g => g.id === id);
}

// ---- Wishes (the child's own list; adults read them, only that child writes) ----

const ownWishes = person_id => (ownPerson()?.id === person_id ? person_id : fail('Only the child can change their own wishlist.'));
const wishFields = ({ name = '', url = '', price }) => (name.trim() ? { name: name.trim(), url: cleanUrl(url), price: num(price) } : fail('What would you like? Give your wish a name.'));

export async function listWishes(person_id) {
  if (isChild()) ownWishes(person_id);
  return copy(mine('wishes').filter(w => w.person_id === person_id));
}

export async function addWish({ person_id, ...w }) {
  return insert('wishes', { person_id: ownWishes(person_id), ...wishFields(w) });
}

export async function updateWish(id, patch) {
  const w = find('wishes', id);
  ownWishes(w.person_id);
  Object.assign(w, wishFields({ ...w, ...patch }));
}

export async function deleteWish(id) {
  ownWishes(find('wishes', id).person_id);
  drop('wishes', w => w.id === id);
}
