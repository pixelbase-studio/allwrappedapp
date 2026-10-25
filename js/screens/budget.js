import * as db from '../data.js';
import { summarise, budgetFlag, PIE } from '../util.js';

export const budget = {
  template: `
  <section class="pad" x-data="budget">
    <div class="card">
      <h2>Overall budget</h2>
      <p class="big"><span x-text="$money(spent)"></span> <small x-text="'spent of ' + $money(total)"></small></p>
      <span class="bar lg"><i :class="{ over: spent > total }" :style="'width:' + (total ? Math.min(100, spent / total * 100) : 0) + '%'"></i></span>
      <p class="meta" x-text="total ? flag(spent, total) : 'Set an overall budget in Settings.'"></p>
      <p class="note">Counts gifts that are bought, received or wrapped.</p>
    </div>

    <template x-if="loaded && !rows.length">
      <div class="empty"><p>No people yet, so nothing to count. Elves at work!</p><a class="btn primary" href="#/people">Add a person</a></div>
    </template>
    <ul class="list">
      <template x-for="p in rows" :key="p.id">
        <li><a class="row" :href="'#/person/' + p.id">
          <span class="grow"><b x-text="p.name"></b>
            <span class="bar"><i :class="{ over: p.spent > p.budget }" :style="'width:' + (p.budget ? Math.min(100, p.spent / p.budget * 100) : 0) + '%'"></i></span></span>
          <span class="amount"><span x-text="$money(p.spent) + ' of ' + (p.budget ? $money(p.budget) : '–')"></span>
            <span class="flag" :class="{ over: p.spent > p.budget }" x-text="flag(p.spent, p.budget) || 'No budget'"></span></span>
        </a></li>
      </template>
    </ul>

    <div class="card" x-show="rows.length">
      <h2>Spend by person</h2>
      <template x-if="!spent"><p>Nothing bought yet. Santa's sleigh is still empty!</p></template>
      <div class="pie-wrap" x-show="spent">
        <div class="pie" :style="pieStyle" role="img" :aria-label="'Pie chart of spend by person: ' + slices.map(s => s.name + ' ' + $money(s.spent)).join(', ')"></div>
        <ul class="legend">
          <template x-for="s in slices" :key="s.id"><li><i :style="'background:' + s.color"></i><span x-text="s.name"></span> <b x-text="$money(s.spent)"></b></li></template>
        </ul>
      </div>
    </div>
  </section>`,

  data: () => ({
    rows: [], loaded: false, flag: budgetFlag,
    get spent() { return this.rows.reduce((s, p) => s + p.spent, 0); },
    get total() { return this.$store.app.season?.overall_budget || this.rows.reduce((s, p) => s + p.budget, 0); },
    get slices() {
      let at = 0;
      return this.rows.filter(p => p.spent).map((p, i) => ({ ...p, color: PIE[i % PIE.length], from: at, to: (at += p.spent / this.spent * 100) }));
    },
    get pieStyle() { return 'background: conic-gradient(' + this.slices.map(s => `${s.color} ${s.from}% ${s.to}%`).join(', ') + ')'; },
    init() { this.load(); this.$watch('$store.app.seasonId', () => this.load()); },
    async load() {
      const s = this.$store.app.seasonId;
      const [people, gifts, budgets] = await Promise.all([db.listPeople(), db.listGifts(s), db.listBudgets(s)]);
      this.rows = summarise(people, gifts, budgets, this.$store.app.groups);
      this.loaded = true;
    },
  }),
};
