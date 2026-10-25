import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.14.1/dist/module.esm.js';
import * as db from './data.js';
import { avatar } from './avatars.js';
import { icon } from './icons.js';
import { money, countdown, summarise } from './util.js';
import { signin, kids } from './screens/auth.js';
import { people } from './screens/people.js';
import { person } from './screens/person.js';
import { budget } from './screens/budget.js';
import { settings } from './screens/settings.js';
import { kid } from './screens/kid.js';

// #/kids is the children's sign-in; #/wishes is a signed-in child's whole app.
const routes = { signin, kids, people, person, budget, settings, wishes: kid };
const PUBLIC = ['signin', 'kids'];

for (const [name, screen] of Object.entries({ gate: signin, kidsLogin: kids, people, person, budget, settings, kid }))
  Alpine.data(name, screen.data);
Alpine.magic('avatar', () => avatar);
Alpine.magic('icon', () => icon);
Alpine.magic('money', () => money);
Alpine.magic('countdown', () => countdown);

const go = hash => (location.hash === hash ? render() : (location.hash = hash));

Alpine.store('app', {
  session: null, seasons: [], seasonId: null, route: '', param: '',
  ask: null, toastMsg: '', printData: null,
  get season() { return this.seasons.find(s => s.id === this.seasonId); },
  get current() { return this.seasons.find(s => !s.archived); },
  get readonly() { return !!this.season?.archived; },
  get groups() { return this.session?.household.groups ?? []; },
  get kid() { return this.session?.role === 'child'; },
  // A child whose grown-ups switched on their own (private) people and gift lists.
  get kidLists() { return this.kid && !!this.session.person?.own_lists; },
  get tabs() { return !!this.session && (!this.kid || this.kidLists); },

  // Fresh data every time the app opens, refreshes or someone signs in.
  async load() {
    this.session = await db.getSession();
    document.documentElement.dataset.theme = this.session?.theme ?? 'santa';
    const adult = this.session && !this.kid;
    this.seasons = adult ? await db.listSeasons() : [];
    if (adult) { if (!this.season) this.seasonId = this.current?.id ?? null; }
    else this.seasonId = this.kidLists ? await db.currentSeason() : null;
  },
  async enter() { await this.load(); go(this.session.role === 'child' ? '#/wishes' : '#/people'); },
  async signOut() {
    document.getElementById('screen').innerHTML = ''; // tear down the screen before its data disappears
    await db.signOut();
    await this.load();
    go('#/signin');
  },
  async setTheme(theme) {
    await db.setTheme(theme);
    this.session.theme = document.documentElement.dataset.theme = theme;
  },

  async pickSeason(select) {
    if (select.value !== 'new') return (this.seasonId = select.value);
    select.value = this.seasonId;
    const y = this.current.year;
    if (!await this.confirm(`Start Christmas ${y + 1}? Christmas ${y} will be archived and read-only. Everyone stays on your list, with fresh gift lists.`)) return;
    await db.startNewYear();
    await this.load();
    this.seasonId = this.current.id;
    this.toast(`Ho ho ho! Christmas ${y + 1} is ready.`);
  },

  confirm(msg) { return new Promise(res => (this.ask = { msg, res })); },
  answer(yes) { this.ask.res(yes); this.ask = null; },
  toast(msg) {
    this.toastMsg = msg;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.toastMsg = ''), 2600);
  },

  async print(id) {
    const s = this.seasonId;
    const [list, gifts, budgets] = await Promise.all([db.listPeople(), db.listGifts(s), db.listBudgets(s)]);
    const p = summarise(list, gifts, budgets, this.groups).find(p => p.id === id);
    this.printData = { ...p, year: this.season.year, gifts: gifts.filter(g => g.person_id === id), wishes: p.kind === 'child' ? await db.listWishes(id) : [] };
    await Alpine.nextTick();
    window.print();
  },
});

// Hash routes (#/people, #/person/<id>, #/settings/<section>) work on GitHub Pages with no server config.
let lastDepth = 0;
function render() {
  const app = Alpine.store('app'), role = app.session?.role;
  let [name, param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const asked = name;
  if (!routes[name]) name = 'people';
  if (!role) { if (!PUBLIC.includes(name)) name = 'signin'; }
  else if (role === 'child') name = ['wishes', ...(app.kidLists ? ['people', 'person'] : [])].includes(name) ? name : 'wishes';
  else name = PUBLIC.includes(name) || name === 'wishes' ? 'people' : name;
  if (name !== asked) param = '';
  const hash = '#/' + name + (param ? '/' + param : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
  app.route = name;
  app.param = decodeURIComponent(param);
  const screen = document.getElementById('screen');
  screen.innerHTML = routes[name].template;
  // Slide in from the right when going a level deeper, from the left when coming back.
  const depth = name === 'person' || (name === 'settings' && param) ? 1 : 0;
  screen.className = '';
  void screen.offsetWidth; // restart the animation
  screen.className = depth > lastDepth ? 'slide-in' : depth < lastDepth ? 'slide-back' : '';
  lastDepth = depth;
  window.scrollTo(0, 0);
}

window.Alpine = Alpine;
Alpine.start();
await Alpine.store('app').load().catch(e => Alpine.store('app').toast(e.message));
window.addEventListener('hashchange', render);
render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
