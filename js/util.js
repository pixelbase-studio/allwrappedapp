export const STATUSES = ['idea', 'to buy', 'bought', 'received', 'wrapped'];
export const SPENT = ['bought', 'received', 'wrapped'];
export const AGE_BANDS = ['0–3', '4–6', '7–10', '11–13', '14+'];
export const PIE = ['#c8102e', '#1f7a3a', '#f5a524', '#3b6fd8', '#8e44ad', '#16a3a3', '#e86aa6', '#6b7a8f'];

export const num = v => (v === '' || v == null || isNaN(v) ? null : Number(v));

export function money(n) {
  if (n == null || n === '') return '';
  return '£' + (Number(n) % 1 ? Number(n).toFixed(2) : String(Number(n)));
}

// The Christmas we are counting towards: this year's, or next year's once Boxing Day arrives.
export function christmasYear(now = new Date()) {
  return now.getMonth() === 11 && now.getDate() > 25 ? now.getFullYear() + 1 : now.getFullYear();
}

export function sleeps(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(christmasYear(now), 11, 25) - today) / 864e5);
}

// The countdown as a big number and the words that go with it.
export function countdown(n = sleeps()) {
  if (n === 0) return { number: '', label: 'Merry Christmas! Ho ho ho!' };
  if (n === 1) return { number: 1, label: "more sleep. It's Christmas Eve!" };
  return { number: n, label: 'sleeps until Christmas' };
}

// One row per person with their gift count, spend and budget, in group (list) order.
export function summarise(people, gifts, budgets, groups) {
  const order = id => { const i = groups.findIndex(g => g.id === id); return i < 0 ? groups.length : i; };
  return people.map(p => {
    const theirs = gifts.filter(g => g.person_id === p.id);
    const bought = theirs.filter(g => SPENT.includes(g.status));
    const spent = bought.reduce((s, g) => s + (g.price || 0), 0);
    const budget = budgets.find(b => b.person_id === p.id)?.amount || 0;
    return { ...p, count: theirs.length, ready: bought.length, spent, budget, groupName: groups.find(g => g.id === p.group)?.name ?? '' };
  }).sort((a, b) => order(a.group) - order(b.group) || a.name.localeCompare(b.name));
}

// Grown-up passwords must meet every rule; Supabase enforces the same rules on the server.
export const PASSWORD_RULES = [
  ['8 or more characters', p => p.length >= 8],
  ['An uppercase letter', p => /[A-Z]/.test(p)],
  ['A lowercase letter', p => /[a-z]/.test(p)],
  ['A number', p => /\d/.test(p)],
];
export const passwordOk = p => PASSWORD_RULES.every(([, test]) => test(p));

// 0 (empty) to 3 (strong): the rules met, plus credit for length and symbols.
export function passwordStrength(p) {
  if (!p) return 0;
  const score = PASSWORD_RULES.filter(([, test]) => test(p)).length + (p.length >= 12) + /[^A-Za-z0-9]/.test(p);
  return score >= 6 ? 3 : score >= 4 ? 2 : 1;
}

export function budgetFlag(spent, budget) {
  if (!budget) return '';
  return spent > budget ? `Over by ${money(spent - budget)}` : `${money(budget - spent)} left`;
}
