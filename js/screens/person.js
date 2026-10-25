import * as db from '../data.js';
import { summarise, STATUSES, AGE_BANDS } from '../util.js';
import { AVATARS } from '../avatars.js';
import { avatarPicker } from './people.js';

const groupOptions = selected => `
  <option value="">No group</option>
  <template x-for="g in $store.app.groups" :key="g.id"><option :value="g.id" x-text="g.name" :selected="g.id === ${selected}"></option></template>`;

export const person = {
  template: `
  <section class="pad" x-data="person">
    <template x-if="p"><div>
      <div class="person-head">
        <button class="avatar xl" @click="avatarSheet = true" aria-label="Change avatar" x-html="$avatar(p.avatar)"></button>
        <div class="grow">
          <h1 class="editable" x-show="!editName" role="button" tabindex="0" title="Tap to edit" :aria-label="'Edit name: ' + p.name"
            @click="editName = true; $refs.name.value = p.name; $nextTick(() => { $refs.name.focus(); $refs.name.select(); })" @keydown.enter="$el.click()"><span x-text="p.name"></span> <span class="pencil" aria-hidden="true">✎</span></h1>
          <form class="name-edit" x-show="editName" @submit.prevent="editName = false; savePerson({ name: $refs.name.value })" @keydown.escape="editName = false">
            <input class="title-input" x-ref="name" aria-label="Name" required>
            <button class="btn primary small">Save</button>
          </form>
          <select class="tag-select" aria-label="Group" @change="savePerson({ group: $event.target.value || null })">${groupOptions('p.group')}</select>
          <p class="meta">
            <span x-text="$money(p.spent) + ' spent of'"></span>
            <button class="link" x-show="!editBudget" :disabled="ro" x-text="p.budget ? $money(p.budget) + ' budget' : 'no budget yet'"
              @click="editBudget = true; $nextTick(() => $refs.budget.focus())"></button>
            <input class="inline-num" x-show="editBudget" x-ref="budget" type="number" inputmode="decimal" min="0" step="0.01" x-model="budget"
              aria-label="Budget in pounds" @keydown.enter.prevent="$el.blur()" @blur="saveBudget">
          </p>
        </div>
        <button class="btn ghost small" x-show="!editName" @click="$store.app.print(p.id)">Print</button>
      </div>

      <div class="seg" role="tablist">
        <button role="tab" :aria-selected="tab === 'gifts'" @click="tab = 'gifts'">Gifts</button>
        <button role="tab" x-show="p.kind === 'child'" :aria-selected="tab === 'wishlist'" @click="tab = 'wishlist'">Wishlist</button>
        <button role="tab" :aria-selected="tab === 'notes'" @click="tab = 'notes'" x-text="p.kind === 'child' ? 'About' : 'Notes'"></button>
      </div>

      <div x-show="tab === 'gifts'">
        <p class="note" x-show="ro">Christmas <span x-text="$store.app.season?.year"></span> is archived, so this list is read-only.</p>
        <template x-if="!gifts.length">
          <div class="empty"><p>No gifts yet. Santa's waiting!</p>
            <button class="btn primary" x-show="!ro" @click="openGift()">Add a gift</button></div>
        </template>
        <ul class="list">
          <template x-for="g in gifts" :key="g.id">
            <li class="row" :role="ro ? null : 'button'" :tabindex="ro ? -1 : 0" @click="openGift(g)" @keydown.enter="openGift(g)">
              <span class="grow"><b x-text="g.name"></b>
                <span class="meta"><a x-show="g.url" :href="g.url" target="_blank" rel="noopener" @click.stop>Shop link</a>
                  <span x-text="g.note"></span></span></span>
              <span class="amount" x-text="$money(g.price)"></span>
              <button class="chip" :class="'st-' + g.status.replace(' ', '-')" :disabled="ro" @click.stop="picking = g"
                :aria-label="'Status: ' + g.status + '. Change status'" x-text="g.status"></button>
            </li>
          </template>
        </ul>
        <button class="fab" aria-label="Add a gift" x-show="!ro" @click="openGift()">+</button>
      </div>

      <div x-show="tab === 'wishlist'">
        <p class="note"><span x-text="p.name"></span>'s own wishlist, for inspiration.</p>
        <template x-if="!wishes.length"><div class="empty"><p><span x-text="p.name"></span> hasn't written to Santa yet.</p></div></template>
        <ul class="list">
          <template x-for="w in wishes" :key="w.id">
            <li class="row">
              <span class="grow"><b x-text="w.name"></b>
                <span class="meta"><a x-show="w.url" :href="w.url" target="_blank" rel="noopener">Web link</a></span></span>
              <span class="amount" x-text="$money(w.price)"></span>
              <button class="btn small" x-show="!ro" @click="addToGifts(w)">Add to gifts</button>
            </li>
          </template>
        </ul>
      </div>

      <div x-show="tab === 'notes'" class="card stack">
        <label x-show="p.kind === 'child'">Age band<select @change="savePerson({ age_band: $event.target.value })">
          <template x-for="a in ageBands"><option :value="a" x-text="a" :selected="a === p.age_band"></option></template></select></label>
        <p class="note" x-show="p.kind === 'child'">For privacy we only keep a child's first name, age band and wishes.</p>
        <template x-if="p.kind !== 'child'"><div class="stack">
          <label>Interests<textarea x-model="p.interests" @change="savePerson({ interests: p.interests })"></textarea></label>
          <label>Hobbies<textarea x-model="p.hobbies" @change="savePerson({ hobbies: p.hobbies })"></textarea></label>
          <label>Notes<textarea x-model="p.notes" @change="savePerson({ notes: p.notes })" placeholder="Sizes, favourite colours, things they already have..."></textarea></label>
        </div></template>
      </div>
      <p class="note">Tap the name, avatar, group or budget above to change them.</p>
      <button class="btn danger wide" @click="remove">Delete <span x-text="p.name"></span></button>
    </div></template>

    <div class="sheet-wrap" x-show="sheet" x-cloak @keydown.escape.window="sheet = false">
      <div class="backdrop" @click="sheet = false"></div>
      <form class="sheet stack" role="dialog" aria-modal="true" :aria-label="form.id ? 'Edit gift' : 'Add a gift'" @submit.prevent="saveGift">
        <h2 x-text="form.id ? 'Edit gift' : 'Add a gift'"></h2>
        <label>Gift<input x-model="form.name" required x-ref="gift"></label>
        <label>Price (£)<input type="number" inputmode="decimal" min="0" step="0.01" x-model="form.price"></label>
        <button type="button" class="link" x-show="!more" @click="more = true">More details</button>
        <div class="stack" x-show="more">
          <label>Shop or web link<input inputmode="url" x-model="form.url" placeholder="https://"></label>
          <label>Notes<textarea x-model="form.note"></textarea></label>
          <label>Status<select x-model="form.status">
            <template x-for="s in statuses"><option :value="s" x-text="s" :selected="s === form.status"></option></template></select></label>
        </div>
        <p class="error" x-show="error" x-text="error" role="alert"></p>
        <div class="actions">
          <button type="button" class="btn danger" x-show="form.id" @click="removeGift">Delete</button>
          <span class="grow"></span>
          <button type="button" class="btn ghost" @click="sheet = false">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>
    </div>

    <div class="sheet-wrap" x-show="picking" x-cloak @keydown.escape.window="picking = null">
      <div class="backdrop" @click="picking = null"></div>
      <div class="sheet stack" role="dialog" aria-modal="true" aria-label="Choose a status">
        <h2 x-text="picking?.name"></h2>
        <template x-for="s in statuses">
          <button class="status-opt" :class="{ on: picking?.status === s }" @click="setStatus(s)">
            <i class="dot" :class="'st-' + s.replace(' ', '-')"></i><span x-text="s"></span></button>
        </template>
      </div>
    </div>

    <div class="sheet-wrap" x-show="avatarSheet" x-cloak @keydown.escape.window="avatarSheet = false">
      <div class="backdrop" @click="avatarSheet = false"></div>
      <div class="sheet stack" role="dialog" aria-modal="true" aria-label="Choose an avatar">
        <h2>Choose an avatar</h2>
        <template x-if="p">${avatarPicker('p', 'avatarSheet = false; savePerson({ avatar: key })')}</template>
      </div>
    </div>
  </section>`,

  data: () => ({
    p: null, gifts: [], wishes: [], tab: 'gifts', budget: '', editName: false, editBudget: false,
    sheet: false, more: false, form: {}, error: '', picking: null, avatarSheet: false,
    statuses: STATUSES, ageBands: AGE_BANDS, avatarKeys: Object.keys(AVATARS),
    get ro() { return this.$store.app.readonly; },
    init() { this.load(); },
    async load() {
      const id = this.$store.app.param, s = this.$store.app.seasonId;
      const [people, gifts, budgets] = await Promise.all([db.listPeople(), db.listGifts(s), db.listBudgets(s)]);
      this.p = summarise(people, gifts, budgets, this.$store.app.groups).find(x => x.id === id);
      if (!this.p) return (location.hash = '#/people');
      this.gifts = gifts.filter(g => g.person_id === id);
      this.wishes = this.p.kind === 'child' ? await db.listWishes(id) : [];
      this.budget = this.p.budget || '';
    },
    async savePerson(patch) {
      try { await db.updatePerson(this.p.id, patch); } catch (e) { this.$store.app.toast(e.message); }
      this.load();
    },
    async saveBudget() {
      this.editBudget = false;
      await db.setBudget(this.p.id, this.$store.app.seasonId, this.budget);
      this.load();
    },
    openGift(g) {
      if (this.ro) return;
      this.form = g ? { ...g, price: g.price ?? '' } : { name: '', price: '', url: '', note: '', status: 'idea' };
      this.more = !!g; this.error = ''; this.sheet = true;
      this.$nextTick(() => this.$refs.gift.focus());
    },
    async saveGift() {
      try {
        if (this.form.id) await db.updateGift(this.form.id, this.form);
        else await db.addGift({ ...this.form, person_id: this.p.id, season_id: this.$store.app.seasonId });
        this.sheet = false;
        this.load();
      } catch (e) { this.error = e.message; }
    },
    async removeGift() {
      if (!await this.$store.app.confirm(`Delete "${this.form.name}"?`)) return;
      await db.deleteGift(this.form.id);
      this.sheet = false;
      this.load();
    },
    async setStatus(status) {
      await db.updateGift(this.picking.id, { status });
      this.picking = null;
      this.load();
    },
    async addToGifts(w) {
      await db.addGift({ person_id: this.p.id, season_id: this.$store.app.seasonId, name: w.name, url: w.url, price: w.price, status: 'idea' });
      this.$store.app.toast(`Added to ${this.p.name}'s gifts`);
      this.load();
    },
    async remove() {
      if (!await this.$store.app.confirm(`Delete ${this.p.name}, their gifts, budgets and wishlist? This can't be undone.`)) return;
      await db.deletePerson(this.p.id);
      this.$store.app.toast(`${this.p.name} deleted`);
      location.hash = '#/people';
    },
  }),
};
