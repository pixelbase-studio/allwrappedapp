import * as db from '../data.js';

// The child's whole app: their avatar, name, the countdown (in the header) and their own wishlist.
export const kid = {
  template: `
  <section class="pad" x-data="kid">
    <div class="hero">
      <div class="avatar xl" x-html="$avatar(me?.avatar)"></div>
      <h1 x-text="'Hi ' + (me?.name ?? '') + '!'"></h1>
      <p>What would you like for Christmas?</p>
    </div>
    <h2>My wishlist</h2>
    <template x-if="loaded && !wishes.length">
      <div class="empty"><p>Your wishlist is empty. Santa's waiting to hear from you!</p>
        <button class="btn primary" @click="open()">Add a wish</button></div>
    </template>
    <ul class="list">
      <template x-for="w in wishes" :key="w.id">
        <li class="row" role="button" tabindex="0" @click="open(w)" @keydown.enter="open(w)">
          <span class="grow"><b x-text="w.name"></b>
            <span class="meta"><a x-show="w.url" :href="w.url" target="_blank" rel="noopener" @click.stop>Web link</a></span></span>
          <span class="amount" x-text="$money(w.price)"></span>
        </li>
      </template>
    </ul>
    <button class="fab" aria-label="Add a wish" @click="open()">+</button>

    <div class="sheet-wrap" x-show="sheet" x-cloak @keydown.escape.window="sheet = false">
      <div class="backdrop" @click="sheet = false"></div>
      <form class="sheet stack" role="dialog" aria-modal="true" :aria-label="form.id ? 'Edit wish' : 'New wish'" @submit.prevent="save">
        <h2 x-text="form.id ? 'Edit wish' : 'New wish'"></h2>
        <label>I wish for<input x-model="form.name" required x-ref="wish"></label>
        <label>Web link (optional)<input inputmode="url" x-model="form.url" placeholder="https://"></label>
        <label>Price (£, optional)<input type="number" inputmode="decimal" min="0" step="0.01" x-model="form.price"></label>
        <p class="error" x-show="error" x-text="error" role="alert"></p>
        <div class="actions">
          <button type="button" class="btn danger" x-show="form.id" @click="remove">Delete</button>
          <span class="grow"></span>
          <button type="button" class="btn ghost" @click="sheet = false">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>
    </div>
    <p class="center"><button class="link" @click="$store.app.signOut()">Not you? Sign out</button></p>
  </section>`,

  data: () => ({
    wishes: [], loaded: false, sheet: false, form: {}, error: '',
    get me() { return this.$store.app.session?.person; },
    init() { this.load(); },
    async load() {
      this.wishes = this.me ? await db.listWishes(this.me.id) : [];
      this.loaded = true;
    },
    open(w) {
      this.form = w ? { ...w, price: w.price ?? '' } : { name: '', url: '', price: '' };
      this.error = ''; this.sheet = true;
      this.$nextTick(() => this.$refs.wish.focus());
    },
    async save() {
      try {
        if (this.form.id) await db.updateWish(this.form.id, this.form);
        else await db.addWish({ ...this.form, person_id: this.me.id });
        this.sheet = false;
        this.load();
      } catch (e) { this.error = e.message; }
    },
    async remove() {
      if (!await this.$store.app.confirm(`Delete "${this.form.name}" from your wishlist?`)) return;
      await db.deleteWish(this.form.id);
      this.sheet = false;
      this.load();
    },
  }),
};
