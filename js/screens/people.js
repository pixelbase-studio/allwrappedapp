import * as db from '../data.js';
import { summarise, AGE_BANDS } from '../util.js';
import { AVATARS } from '../avatars.js';

// Avatar picker markup, shared with the person page. `target` is the object holding `avatar`.
export const avatarPicker = (target, after = '') => `
  <div class="avatar-pick" role="radiogroup" aria-label="Avatar">
    <template x-for="key in avatarKeys" :key="key">
      <button type="button" class="avatar" role="radio" :aria-checked="${target}.avatar === key" :class="{ on: ${target}.avatar === key }"
        @click="${target}.avatar = key; ${after}" x-html="$avatar(key)"></button>
    </template>
  </div>`;

export const people = {
  template: `
  <section class="pad" x-data="people">
    <p class="note private" x-show="$store.app.kid">🔒 Only you can see these lists. Grown-ups can't peek!</p>
    <template x-if="loaded && !rows.length">
      <div class="empty">
        <div class="avatar xl" x-html="$avatar('elf')"></div>
        <p x-text="$store.app.kid ? 'Who are you buying presents for? Add them here.' : 'No people yet. The elves are waiting!'"></p>
        <button class="btn primary" x-show="!$store.app.readonly" @click="openAdd">Add a person</button>
      </div>
    </template>
    <ul class="list">
      <template x-for="p in rows" :key="p.id">
        <li><a class="row" :href="'#/person/' + p.id">
          <span class="avatar" x-html="$avatar(p.avatar)"></span>
          <span class="grow">
            <b x-text="p.name"></b>
            <span class="meta"><span class="tag" x-show="p.groupName" x-text="p.groupName"></span>
              <span class="presents" role="img" :aria-label="p.count ? p.ready + ' of ' + p.count + ' gifts bought' : 'No gifts yet'">
                <template x-for="i in Math.min(p.count, 8)"><i :class="{ ready: i <= p.ready }" x-html="$icon('gift')"></i></template>
                <span x-show="p.count > 8" x-text="'+' + (p.count - 8)"></span>
                <span x-show="!p.count">No gifts yet</span></span></span>
            <span class="bar" x-show="p.budget"><i :class="{ over: p.spent > p.budget }" :style="'width:' + Math.min(100, p.spent / p.budget * 100) + '%'"></i></span>
          </span>
          <span class="amount" x-text="$money(p.spent) + (p.budget ? ' of ' + $money(p.budget) : ' spent')"></span>
        </a></li>
      </template>
    </ul>
    <button class="fab" aria-label="Add a person" x-show="!$store.app.readonly" @click="openAdd">+</button>

    <div class="sheet-wrap" x-show="sheet" x-cloak @keydown.escape.window="sheet = false">
      <div class="backdrop" @click="sheet = false"></div>
      <form class="sheet stack" role="dialog" aria-modal="true" aria-label="Add a person" @submit.prevent="save">
        <h2>Add a person</h2>
        <label>Name<input x-model="form.name" required x-ref="name"></label>
        <template x-if="!$store.app.kid"><div class="stack">
          <div class="two">
            <label>Group<select x-model="form.group">
              <option value="">No group</option>
              <template x-for="g in $store.app.groups" :key="g.id"><option :value="g.id" x-text="g.name" :selected="g.id === form.group"></option></template>
            </select></label>
            <label>Budget (£)<input type="number" inputmode="decimal" min="0" step="0.01" x-model="form.budget"></label>
          </div>
          <label>They are<select x-model="form.kind">
            <option value="adult">A grown-up</option><option value="child">A child</option><option value="other">Someone else</option>
          </select></label>
          <label x-show="form.kind === 'child'">Age band<select x-model="form.age_band">
            <template x-for="a in ageBands"><option :value="a" x-text="a"></option></template>
          </select></label>
        </div></template>
        <p class="label">Avatar</p>
        ${avatarPicker('form')}
        <p class="error" x-show="error" x-text="error" role="alert"></p>
        <div class="actions"><button type="button" class="btn ghost" @click="sheet = false">Cancel</button><button class="btn primary">Save</button></div>
      </form>
    </div>
  </section>`,

  data: () => ({
    rows: [], loaded: false, sheet: false, form: {}, error: '',
    avatarKeys: Object.keys(AVATARS), ageBands: AGE_BANDS,
    init() { this.load(); this.$watch('$store.app.seasonId', () => this.load()); },
    async load() {
      const s = this.$store.app.seasonId;
      const [people, gifts, budgets] = await Promise.all([db.listPeople(), db.listGifts(s), db.listBudgets(s)]);
      this.rows = summarise(people, gifts, budgets, this.$store.app.groups);
      this.loaded = true;
    },
    openAdd() {
      this.form = { name: '', kind: 'adult', group: this.$store.app.groups[0]?.id ?? '', budget: '', avatar: 'santa', age_band: AGE_BANDS[2] };
      this.error = ''; this.sheet = true;
      this.$nextTick(() => this.$refs.name.focus());
    },
    async save() {
      try {
        await db.addPerson({ ...this.form, group: this.form.group || null }, this.$store.app.seasonId, this.form.budget);
        this.sheet = false;
        this.$store.app.toast(this.form.name + ' added. Ho ho ho!');
        this.load();
      } catch (e) { this.error = e.message; }
    },
  }),
};
