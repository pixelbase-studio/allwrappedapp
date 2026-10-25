// Settings: a menu (#/settings) that drills down into one section at a time (#/settings/<section>).
import * as db from '../data.js';
import { AGE_BANDS } from '../util.js';
import { AVATARS } from '../avatars.js';
import { avatarPicker } from './people.js';

// To add a theme, add it here and give it a matching [data-theme] block in styles.css.
const THEMES = [
  { key: 'santa', label: 'Santa', note: 'Festive red' },
  { key: 'elf', label: 'Elf', note: 'Evergreen' },
  { key: 'snowman', label: 'Snowman', note: 'White and silver' },
];

const SECTIONS = [
  { key: 'appearance', icon: 'palette', label: 'Appearance', note: '' },
  { key: 'family', icon: 'home', label: 'Family', note: 'Join code and grown-ups' },
  { key: 'children', icon: 'child', label: 'Children', note: "Add children and the kids' sign-in" },
  { key: 'groups', icon: 'layers', label: 'Groups and list order', note: 'How the People list is grouped' },
  { key: 'budget', icon: 'pound', label: 'Budget', note: 'Overall budget for this Christmas' },
  { key: 'print', icon: 'printer', label: 'Print lists', note: "Print one person's list" },
  { key: 'account', icon: 'person', label: 'Account', note: 'Your email and sign out' },
];

// A card showing a shareable code, its buttons, and a way to replace it.
const codeCard = (title, note, which, buttons, extra = '') => `
  <div class="card stack">
    <h2>${title}</h2>
    <p class="note">${note}</p>
    <p class="code-display" x-text="codes.${which}_code"></p>
    <div class="actions">${buttons}</div>
    ${extra}
    <button class="link" @click="newCode('${which}')">Make a new code</button>
  </div>`;

export const settings = {
  template: `
  <section class="pad" x-data="settings">
    <template x-if="!section">
      <div>
        <h1 class="page-title">Settings</h1>
        <ul class="list">
          <template x-for="s in sections" :key="s.key">
            <li><a class="row" :href="'#/settings/' + s.key">
              <span class="menu-icon" x-html="$icon(s.icon)"></span>
              <span class="grow"><b x-text="s.label"></b><span class="meta" x-show="s.note" x-text="s.note"></span></span>
              <span class="chev" x-html="$icon('chevron')"></span>
            </a></li>
          </template>
        </ul>
      </div>
    </template>

    <template x-if="section">
      <div class="stack">
        <a class="back" href="#/settings">‹ Settings</a>
        <h1 class="page-title" x-text="current.label"></h1>

        <template x-if="section === 'appearance'">
          <div class="card stack">
            <h2>Theme</h2>
            <div class="themes" role="radiogroup" aria-label="Theme">
              <template x-for="t in themes" :key="t.key">
                <button class="theme" role="radio" :data-theme="t.key" :aria-checked="$store.app.session?.theme === t.key"
                  :class="{ on: $store.app.session?.theme === t.key }" @click="$store.app.setTheme(t.key)">
                  <span class="swatch"></span><span x-text="t.label"></span><small x-text="t.note"></small></button>
              </template>
            </div>
          </div>
        </template>

        <template x-if="section === 'family'">
          <div class="stack">
            ${codeCard("Grown-ups' join code", 'Share this with the grown-ups in your family. They tap <b>Join a family</b> on the sign-in screen and type it in.', 'join', `
              <button class="btn" @click="copy(codes.join_code, 'Code copied')">Copy code</button>
              <button class="btn primary" @click="share(joinMessage)">Share</button>`)}
            <div class="card stack">
              <h2>Grown-ups</h2>
              <ul class="list tight">
                <template x-for="m in grownUps" :key="m.email">
                  <li class="row"><span class="grow" x-text="m.email"></span><span class="tag" x-text="m.role === 'lead' ? 'Lead' : 'Grown-up'"></span></li>
                </template>
              </ul>
            </div>
          </div>
        </template>

        <template x-if="section === 'children'">
          <div class="stack">
            <div class="card stack">
              <p class="note" x-show="!children.length">No children yet. Add one and they'll appear on the People list too.</p>
              <ul class="list tight">
                <template x-for="c in children" :key="c.id">
                  <li><a class="row" :href="'#/person/' + c.id">
                    <span class="avatar" x-html="$avatar(c.avatar)"></span>
                    <span class="grow"><b x-text="c.name"></b>
                      <span class="meta"><span x-show="c.age_band" x-text="'Age ' + c.age_band"></span>
                        <span x-text="devices(c.id) ? 'Signed in on ' + devices(c.id) + (devices(c.id) === 1 ? ' device' : ' devices') : 'Not signed in yet'"></span>
                        <span x-show="c.own_lists">Own gift lists on</span></span></span>
                  </a></li>
                </template>
              </ul>
              <button class="btn primary" @click="openChild">Add a child</button>
            </div>
            ${codeCard("Kids' sign-in", "Open this link on your child's device. They type their first name and the kids' code. No password needed.", 'kids', `
              <button class="btn" @click="copy(kidsLink, 'Link copied')">Copy link</button>
              <button class="btn" @click="copy(codes.kids_code, 'Code copied')">Copy code</button>
              <button class="btn primary" @click="share(kidsMessage)">Share</button>`,
              `<input readonly :value="kidsLink" @focus="$el.select()" aria-label="Kids' sign-in link">`)}
          </div>
        </template>

        <template x-if="section === 'groups'">
          <div class="card stack">
            <p class="note">People are listed in this group order.</p>
            <ul class="list tight">
              <template x-for="(g, i) in groups" :key="g.id">
                <li class="row">
                  <input class="grow" :value="g.name" aria-label="Group name" @change="g.name = $el.value.trim() || g.name; $el.value = g.name; save()">
                  <button class="icon" aria-label="Move up" :disabled="i === 0" @click="move(i, -1)">↑</button>
                  <button class="icon" aria-label="Move down" :disabled="i === groups.length - 1" @click="move(i, 1)">↓</button>
                  <button class="icon danger" :aria-label="'Delete ' + g.name" @click="removeGroup(i)">✕</button>
                </li>
              </template>
            </ul>
            <form class="row-form" @submit.prevent="addGroup"><input x-model="newGroup" placeholder="New group" aria-label="New group name"><button class="btn">Add</button></form>
          </div>
        </template>

        <template x-if="section === 'budget'">
          <div class="card stack">
            <label>Overall budget for Christmas <span x-text="$store.app.current?.year"></span> (£)
              <input type="number" inputmode="decimal" min="0" step="0.01" x-model="overall" @change="saveBudget"></label>
            <p class="note">Set each person's budget on their page.</p>
          </div>
        </template>

        <template x-if="section === 'print'">
          <div class="card stack">
            <form class="row-form" @submit.prevent="printId && $store.app.print(printId)">
              <select x-model="printId" aria-label="Person to print"><option value="">Choose a person</option>
                <template x-for="p in people" :key="p.id"><option :value="p.id" x-text="p.name"></option></template></select>
              <button class="btn" :disabled="!printId">Print</button>
            </form>
          </div>
        </template>

        <template x-if="section === 'account'">
          <div class="card stack">
            <p>Signed in as <b x-text="$store.app.session?.email"></b></p>
            <p class="note">Forgotten passwords are reset by the lead grown-up in the Supabase dashboard.</p>
            <button class="btn ghost" @click="$store.app.signOut()">Sign out</button>
          </div>
        </template>
      </div>
    </template>

    <div class="sheet-wrap" x-show="sheet" x-cloak @keydown.escape.window="sheet = false">
      <div class="backdrop" @click="sheet = false"></div>
      <form class="sheet stack" role="dialog" aria-modal="true" aria-label="Add a child" @submit.prevent="saveChild">
        <h2>Add a child</h2>
        <label>First name<input x-model="child.name" required x-ref="childName" autocapitalize="words"></label>
        <label>Age band<select x-model="child.age_band">
          <template x-for="a in ageBands"><option :value="a" x-text="a" :selected="a === child.age_band"></option></template></select></label>
        <p class="label">Avatar</p>
        ${avatarPicker('child')}
        <label class="switch-row">
          <input type="checkbox" role="switch" x-model="child.own_lists">
          <span><b>Own gift lists</b><small>Let them add people and gifts that only they can see. You can change this later on their profile.</small></span>
        </label>
        <p class="note">For privacy we only keep a child's first name, age band and wishes.</p>
        <p class="error" x-show="error" x-text="error" role="alert"></p>
        <div class="actions"><span class="grow"></span><button type="button" class="btn ghost" @click="sheet = false">Cancel</button><button class="btn primary">Add child</button></div>
      </form>
    </div>
  </section>`,

  data: () => ({
    themes: THEMES, sections: SECTIONS, ageBands: AGE_BANDS, avatarKeys: Object.keys(AVATARS),
    groups: [], newGroup: '', overall: '', people: [], members: [], codes: {}, printId: '',
    sheet: false, child: {}, error: '',
    get section() { return this.$store.app.param; },
    get current() { return SECTIONS.find(s => s.key === this.section) ?? SECTIONS[0]; },
    get children() { return this.people.filter(p => p.kind === 'child'); },
    get grownUps() { return this.members.filter(m => m.role !== 'child'); },
    get siteLink() { return location.href.split('#')[0]; },
    get kidsLink() { return this.siteLink + '#/kids'; },
    get joinMessage() { return `Join our family on All Wrapped: open ${this.siteLink}, tap Join a family and enter the code ${this.codes.join_code}`; },
    get kidsMessage() { return `Open ${this.kidsLink} then type your first name and the kids' code ${this.codes.kids_code}`; },
    devices(id) { return this.members.filter(m => m.person_id === id).length; },

    async init() {
      this.groups = JSON.parse(JSON.stringify(this.$store.app.groups));
      this.overall = this.$store.app.current?.overall_budget ?? '';
      [this.people, this.members, this.codes] = await Promise.all([db.listPeople(), db.listMembers(), db.getCodes()]);
    },

    async save() { await db.saveGroups(this.groups); await this.$store.app.load(); },
    move(i, d) { this.groups.splice(i + d, 0, ...this.groups.splice(i, 1)); this.save(); },
    addGroup() {
      if (!this.newGroup.trim()) return;
      this.groups.push({ id: 'g' + Date.now(), name: this.newGroup.trim() });
      this.newGroup = '';
      this.save();
    },
    async removeGroup(i) {
      if (!await this.$store.app.confirm(`Delete the ${this.groups[i].name} group? People in it stay, with no group.`)) return;
      this.groups.splice(i, 1);
      this.save();
    },
    async saveBudget() { await db.updateSeason(this.$store.app.current.id, { overall_budget: this.overall }); await this.$store.app.load(); },

    async newCode(which) {
      const msg = which === 'join'
        ? 'Make a new join code? The old one stops working. Grown-ups who have already joined stay in the family.'
        : "Make a new kids' code? The old one stops working. Children already signed in stay signed in.";
      if (!await this.$store.app.confirm(msg)) return;
      this.codes[which + '_code'] = await db.resetCode(which);
      this.$store.app.toast('New code ready. Ho ho ho!');
    },
    async copy(text, done) {
      try { await navigator.clipboard.writeText(text); this.$store.app.toast(done); }
      catch { this.$store.app.toast('Press and hold to copy it.'); }
    },
    async share(text) {
      if (!navigator.share) return this.copy(text, 'Message copied, ready to paste');
      try { await navigator.share({ title: 'All Wrapped', text }); }
      catch (e) { if (e.name !== 'AbortError') this.copy(text, 'Message copied, ready to paste'); }
    },

    openChild() {
      this.child = { name: '', age_band: AGE_BANDS[2], avatar: 'gingerbread', own_lists: false };
      this.error = ''; this.sheet = true;
      this.$nextTick(() => this.$refs.childName.focus());
    },
    async saveChild() {
      try {
        const kidsGroup = this.$store.app.groups.find(g => g.name === 'Kids')?.id ?? null;
        await db.addPerson({ ...this.child, kind: 'child', group: kidsGroup }, this.$store.app.seasonId, '');
        this.sheet = false;
        this.$store.app.toast(`${this.child.name.trim()} added. They're on the People list too.`);
        this.people = await db.listPeople();
      } catch (e) { this.error = e.message; }
    },
  }),
};
