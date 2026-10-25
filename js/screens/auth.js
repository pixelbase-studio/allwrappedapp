// Sign in, Start a new family, and Join (from an invite link).
import * as db from '../data.js';

const hero = (title, text) => `
  <div class="hero">
    <div class="avatar xl" x-html="$avatar('santa')"></div>
    <h1>${title}</h1>
    <p>${text}</p>
  </div>`;

// Shared submit handling: busy flag, friendly error, then into the app.
const form = fields => ({
  ...fields, error: '', busy: false,
  async run(fn) {
    this.busy = true; this.error = '';
    try { await fn(); await this.$store.app.enter(); } catch (e) { this.error = e.message; }
    this.busy = false;
  },
});

export const signin = {
  template: `
  <section class="pad" x-data="signin">
    ${hero('Ho ho ho!', "Sign in to your family's gift lists.")}
    <form class="card stack" @submit.prevent="run(() => db.signIn(email, password))">
      <label>Email<input type="email" x-model="email" required autocomplete="email"></label>
      <label>Password<input type="password" x-model="password" required autocomplete="current-password"></label>
      <p class="error" x-show="error" x-text="error" role="alert"></p>
      <button class="btn primary" :disabled="busy">Sign in</button>
    </form>
    <p class="note">Have an invite? Open the link you were sent.</p>
    <p class="center"><a class="btn ghost" href="#/new-family">Start a new family</a></p>
    <p class="note demo">Prototype logins (password <b>jingle</b>): nick@example.com (lead), holly@example.com (adult), ivy@example.com (child). Family code: <b>NORTHPOLE</b></p>
  </section>`,
  data: () => ({ ...form({ email: '', password: '' }), db }),
};

export const newFamily = {
  template: `
  <section class="pad" x-data="newFamily">
    ${hero('Start a new family', 'Elves at work! Set up your household and you will be its lead adult.')}
    <form class="card stack" @submit.prevent="run(() => db.createHousehold({ code, name, email, password }))">
      <label>Family code<input x-model="code" required autocomplete="off" autocapitalize="characters"></label>
      <label>Household name<input x-model="name" required placeholder="e.g. The Smiths"></label>
      <label>Your email<input type="email" x-model="email" required autocomplete="email"></label>
      <label>Choose a password<input type="password" x-model="password" required minlength="6" autocomplete="new-password"></label>
      <p class="error" x-show="error" x-text="error" role="alert"></p>
      <button class="btn primary" :disabled="busy">Create our household</button>
    </form>
    <p class="center"><a href="#/signin">Back to sign in</a></p>
  </section>`,
  data: () => ({ ...form({ code: '', name: '', email: '', password: '' }), db }),
};

export const join = {
  template: `
  <section class="pad" x-data="join">
    <template x-if="loaded && !invite">
      <div class="empty">
        <div class="avatar xl" x-html="$avatar('snowman')"></div>
        <p>This invite has melted away. It may have expired or been used already. Ask for a fresh link.</p>
        <a class="btn ghost" href="#/signin">Go to sign in</a>
      </div>
    </template>
    <template x-if="invite">
      <div>
        <div class="hero">
          <div class="avatar xl" x-html="$avatar(invite.role === 'child' ? 'elf' : 'santa')"></div>
          <h1 x-text="invite.person ? 'Hello ' + invite.person + '!' : 'Ho ho ho!'"></h1>
          <p>You've been invited to join <b x-text="invite.household"></b> on All Wrapped.</p>
        </div>
        <form class="card stack" @submit.prevent="run(() => db.acceptInvite($store.app.param, email, password))">
          <label>Email<input type="email" x-model="email" required autocomplete="email"></label>
          <label>Choose a password<input type="password" x-model="password" required minlength="6" autocomplete="new-password"></label>
          <p class="error" x-show="error" x-text="error" role="alert"></p>
          <button class="btn primary" :disabled="busy">Join the family</button>
        </form>
      </div>
    </template>
  </section>`,
  data: () => ({
    ...form({ email: '', password: '', invite: null, loaded: false }), db,
    async init() {
      this.invite = await db.getInvite(this.$store.app.param);
      this.email = this.invite?.email ?? '';
      this.loaded = true;
    },
  }),
};
