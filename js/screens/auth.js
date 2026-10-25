// The sign-in gate (Sign in / Start a family / Join a family) and the kids' sign-in.
import * as db from '../data.js';
import { PASSWORD_RULES, passwordStrength } from '../util.js';

const EYE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

// A password input with an eye button that shows or hides what was typed.
const passwordInput = (model, autocomplete) => `
  <span class="pw" x-data="{ show: false }">
    <input :type="show ? 'text' : 'password'" x-model="${model}" required autocomplete="${autocomplete}">
    <button type="button" class="eye" @click="show = !show" :aria-label="show ? 'Hide password' : 'Show password'" :aria-pressed="show.toString()">
      <span x-show="!show">${EYE}</span><span x-show="show">${EYE_OFF}</span>
    </button>
  </span>`;

// New password with a strength meter, the rules ticked off as they are met, and a confirm field.
const newPassword = `
  <label>Choose a password ${passwordInput('password', 'new-password')}</label>
  <div class="pw-meter" x-show="password">
    <span class="bar"><i :class="'s' + strength(password)" :style="'width:' + strength(password) * 33.4 + '%'"></i></span>
    <span aria-live="polite" x-text="['', 'Weak', 'Okay', 'Strong'][strength(password)]"></span>
  </div>
  <ul class="rules">
    <template x-for="[text, test] in rules">
      <li :class="{ met: test(password) }"><span aria-hidden="true" x-text="test(password) ? '✓' : '•'"></span>
        <span x-text="text"></span><span class="sr-only" x-text="test(password) ? ' (done)' : ''"></span></li>
    </template>
  </ul>
  <label>Confirm password ${passwordInput('confirm', 'new-password')}</label>
  <p class="field-error" x-show="confirm && confirm !== password">The passwords don't match yet.</p>`;

const hero = (avatar, title, text) => `
  <div class="hero">
    <div class="avatar xl" x-html="$avatar('${avatar}')"></div>
    <h1 x-text="${title}"></h1>
    <p x-text="${text}"></p>
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

const MODES = {
  signin: { tab: 'Sign in', title: 'Ho ho ho!', text: "Sign in to your family's gift lists.", button: 'Sign in' },
  start: { tab: 'Start a family', title: 'Start a family', text: "Elves at work! You'll be your family's lead grown-up.", button: 'Create our family' },
  join: { tab: 'Join a family', title: 'Join a family', text: 'Use the code a grown-up in your family shared with you.', button: 'Join the family' },
};

export const signin = {
  template: `
  <section class="pad" x-data="gate">
    ${hero('santa', 'modes[mode].title', 'modes[mode].text')}
    <div class="seg" role="tablist" aria-label="Choose">
      <template x-for="(m, key) in modes" :key="key">
        <button type="button" role="tab" :aria-selected="mode === key" @click="setMode(key)" x-text="m.tab"></button>
      </template>
    </div>
    <form class="card stack" @submit.prevent="submit">
      <template x-if="mode === 'join'">
        <div class="stack">
          <label>Family join code<input class="code-input" x-model="code" maxlength="6" required autocomplete="off" autocapitalize="characters" spellcheck="false" @input="code = code.toUpperCase(); lookUp()"></label>
          <p class="note found" x-show="family" x-text="'You’re joining ' + family"></p>
          <p class="note" x-show="!family">A grown-up in your family can find it in Settings, under Family.</p>
        </div>
      </template>
      <template x-if="mode === 'start'">
        <div class="stack">
          <label>Start-a-family code<input x-model="code" required autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
          <label>Family name<input x-model="name" required placeholder="e.g. The Smiths"></label>
        </div>
      </template>
      <label>Email<input type="email" x-model="email" required autocomplete="email"></label>
      <template x-if="mode === 'signin'"><label>Password ${passwordInput('password', 'current-password')}</label></template>
      <template x-if="mode !== 'signin'"><div class="stack">${newPassword}</div></template>
      <p class="error" x-show="error" x-text="error" role="alert"></p>
      <button class="btn primary" :disabled="busy" x-text="modes[mode].button"></button>
    </form>
    <p class="center"><a class="btn ghost" href="#/kids">Are you a kid? Sign in here</a></p>
  </section>`,
  data: () => ({
    ...form({ mode: 'signin', code: '', name: '', email: '', password: '', confirm: '', family: '' }),
    modes: MODES, rules: PASSWORD_RULES, strength: passwordStrength,
    setMode(mode) { Object.assign(this, { mode, code: '', family: '', confirm: '', error: '' }); },
    async lookUp() {
      this.family = this.code.length === 6 ? (await db.checkJoinCode(this.code).catch(() => null)) ?? '' : '';
    },
    submit() {
      const { mode, code, name, email, password, confirm } = this;
      this.run(() => (mode === 'signin' ? db.signIn(email, password)
        : mode === 'start' ? db.createHousehold({ code, name, email, password, confirm })
        : db.joinHousehold({ code, email, password, confirm })));
    },
  }),
};

// Opened from the kids' link a grown-up shares: first name and the kids' code, no password.
export const kids = {
  template: `
  <section class="pad" x-data="kidsLogin">
    ${hero('elf', "'Hello!'", "'Let\\'s find your wishlist.'")}
    <form class="card stack" @submit.prevent="run(() => db.kidSignIn(code, name))">
      <label>Your first name<input x-model="name" required autocomplete="given-name" autocapitalize="words"></label>
      <label>Kids' code<input class="code-input" x-model="code" maxlength="6" required autocomplete="off" autocapitalize="characters" spellcheck="false" @input="code = code.toUpperCase()"></label>
      <p class="note">A grown-up can find this code in Settings, under Children.</p>
      <p class="error" x-show="error" x-text="error" role="alert"></p>
      <button class="btn primary" :disabled="busy">Let's go!</button>
    </form>
    <p class="center"><a href="#/signin">Grown-ups sign in here</a></p>
  </section>`,
  data: () => ({ ...form({ name: '', code: '' }), db }),
};
