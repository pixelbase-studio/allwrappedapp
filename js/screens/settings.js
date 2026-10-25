import * as db from '../data.js';

const THEMES = [['santa', 'Santa'], ['elf', 'Elf'], ['snowman', 'Snowman']];

export const settings = {
  template: `
  <section class="pad stack" x-data="settings">
    <div class="card stack">
      <h2>Theme</h2>
      <div class="themes" role="radiogroup" aria-label="Theme">
        <template x-for="[key, label] in themes" :key="key">
          <button class="theme" role="radio" :data-theme="key" :aria-checked="$store.app.session?.theme === key"
            :class="{ on: $store.app.session?.theme === key }" @click="$store.app.setTheme(key)">
            <span class="swatch"></span><span x-text="label"></span></button>
        </template>
      </div>
    </div>

    <div class="card stack">
      <h2>Groups and list order</h2>
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

    <div class="card stack" x-show="current">
      <h2>Budget</h2>
      <label>Overall budget for Christmas <span x-text="current?.year"></span> (£)
        <input type="number" inputmode="decimal" min="0" step="0.01" x-model="overall" @change="saveBudget"></label>
      <p class="note">Set each person's budget on their page.</p>
    </div>

    <div class="card stack">
      <h2>Family and invites</h2>
      <template x-if="$store.app.isLead">
        <div class="stack">
          <button class="btn" @click="invite('adult')">Create an adult invite link</button>
          <div class="stack" x-show="children.length">
            <label>Child's profile<select x-model="childId">
              <template x-for="c in children" :key="c.id"><option :value="c.id" x-text="c.name"></option></template></select></label>
            <label>Email for the child's login<input type="email" x-model="childEmail" placeholder="e.g. name+ivy@gmail.com"></label>
            <button class="btn" @click="invite('child')">Create the child's invite link</button>
          </div>
          <p class="note" x-show="!children.length">Add a child on the People tab to give them their own login.</p>
          <div class="invite" x-show="link">
            <p class="note" x-text="linkFor"></p>
            <input readonly :value="link" x-ref="link" @focus="$el.select()" aria-label="Invite link">
            <div class="actions"><button class="btn" @click="copy">Copy link</button><button class="btn primary" @click="share">Share</button></div>
          </div>
        </div>
      </template>
      <h3>Household members</h3>
      <ul class="list tight">
        <template x-for="m in members" :key="m.email">
          <li class="row"><span class="grow" x-text="m.person ? m.person + ' (' + m.email + ')' : m.email"></span><span class="tag" x-text="m.role"></span></li>
        </template>
      </ul>
      <template x-if="invites.length">
        <p class="note" x-text="invites.length + (invites.length === 1 ? ' invite' : ' invites') + ' waiting to be opened.'"></p>
      </template>
    </div>

    <div class="card stack">
      <h2>Print lists</h2>
      <form class="row-form" @submit.prevent="printId && $store.app.print(printId)">
        <select x-model="printId" aria-label="Person to print"><option value="">Choose a person</option>
          <template x-for="p in people" :key="p.id"><option :value="p.id" x-text="p.name"></option></template></select>
        <button class="btn" :disabled="!printId">Print</button>
      </form>
    </div>

    <button class="btn ghost" @click="$store.app.signOut()">Sign out</button>
  </section>`,

  data: () => ({
    themes: THEMES, groups: [], newGroup: '', overall: '', people: [], members: [], invites: [],
    childId: '', childEmail: '', link: '', linkFor: '', printId: '',
    get current() { return this.$store.app.seasons.find(s => !s.archived); },
    get children() { return this.people.filter(p => p.kind === 'child' && !p.user_id); },
    async init() {
      this.groups = JSON.parse(JSON.stringify(this.$store.app.groups));
      this.overall = this.current?.overall_budget ?? '';
      [this.people, this.members, this.invites] = await Promise.all([
        db.listPeople(), db.listMembers(), this.$store.app.isLead ? db.listInvites() : [],
      ]);
      this.childId = this.children[0]?.id ?? '';
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
    async saveBudget() { await db.updateSeason(this.current.id, { overall_budget: this.overall }); await this.$store.app.load(); },
    async invite(role) {
      const child = this.people.find(p => p.id === this.childId);
      if (role === 'child' && !/^\S+@\S+\.\S+$/.test(this.childEmail)) return this.$store.app.toast("Add an email for the child's login first.");
      const token = await db.createInvite(role === 'child' ? { role, person_id: child.id, email: this.childEmail.trim() } : { role });
      this.link = location.href.split('#')[0] + '#/join/' + token;
      this.linkFor = role === 'child' ? `Open this on ${child.name}'s device so they can pick a password.` : 'Send this to a grown-up in your family. It works once and lasts 7 days.';
      this.invites = await db.listInvites();
    },
    async copy() {
      try { await navigator.clipboard.writeText(this.link); this.$store.app.toast('Link copied. Ho ho ho!'); }
      catch { this.$refs.link.select(); this.$store.app.toast('Press and hold the link to copy it.'); }
    },
    async share() {
      if (!navigator.share) return this.copy();
      try { await navigator.share({ title: 'All Wrapped', text: 'Join our family gift lists on All Wrapped', url: this.link }); }
      catch (e) { if (e.name !== 'AbortError') this.copy(); }
    },
  }),
};
