// Run with: node test.js. Checks the countdown, budget maths and the data rules Stage 2 must keep.
import assert from 'assert';
import { sleeps, christmasYear, summarise, budgetFlag, money } from './js/util.js';
import * as db from './js/data.js';

const rejects = (p, re) => p.then(() => assert.fail('expected an error'), e => assert.match(e.message, re));

(async () => {
  assert.strictEqual(sleeps(new Date(2026, 9, 24)), 62);
  assert.strictEqual(sleeps(new Date(2026, 11, 25)), 0);
  assert.strictEqual(christmasYear(new Date(2026, 11, 26)), 2027);
  assert.strictEqual(sleeps(new Date(2026, 11, 26)), 364);
  assert.strictEqual(money(7.5), '£7.50');
  assert.strictEqual(money(35), '£35');
  assert.strictEqual(budgetFlag(120, 100), 'Over by £20');

  const rows = summarise(
    [{ id: 'a', name: 'Zed', group: 'g1' }, { id: 'b', name: 'Amy', group: 'g2' }],
    [{ person_id: 'a', price: 10, status: 'bought' }, { person_id: 'a', price: 99, status: 'idea' }],
    [{ person_id: 'a', amount: 50 }],
    [{ id: 'g1', name: 'Kids' }, { id: 'g2', name: 'Friends' }],
  );
  assert.deepStrictEqual(rows.map(r => [r.name, r.count, r.spent, r.budget]), [['Zed', 2, 10, 50], ['Amy', 0, 0, 0]]);

  // Adult sees gifts; the child Ivy sees only their own profile and wishes, never gifts or budgets.
  await db.signIn('nick@example.com', 'jingle');
  const [season] = (await db.listSeasons()).filter(s => !s.archived);
  assert.ok((await db.listGifts(season.id)).some(g => g.person_id === 'p1'));
  await rejects(db.addWish({ person_id: 'p1', name: 'x' }), /Only the child/);
  const link = await db.addGift({ person_id: 'p1', season_id: season.id, name: 'Test', url: 'javascript:alert(1)' });
  assert.strictEqual(link.url, 'https://javascript:alert(1)');

  await db.signIn('ivy@example.com', 'jingle');
  assert.deepStrictEqual((await db.listPeople()).map(p => p.name), ['Ivy']);
  assert.deepStrictEqual(await db.listGifts(season.id), []);
  assert.deepStrictEqual(await db.listBudgets(season.id), []);
  await rejects(db.listWishes('p2'), /Only the child/);
  await rejects(db.addGift({ person_id: 'p1', season_id: season.id, name: 'x' }), /grown-ups/);
  const wish = await db.addWish({ person_id: 'p1', name: 'Snow globe', price: '5' });
  assert.strictEqual(wish.price, 5);

  // Invites: lead only, single use; a child invite links the child's profile.
  await rejects(db.createInvite({ role: 'adult' }), /lead adult/);
  await db.signIn('nick@example.com', 'jingle');
  const token = await db.createInvite({ role: 'child', person_id: 'p2', email: 'jack@example.com' });
  await db.acceptInvite(token, 'jack@example.com', 'snowball');
  assert.strictEqual((await db.getSession()).person.name, 'Jack');
  assert.strictEqual(await db.getInvite(token), null);

  // New family needs the right code; new year archives and keeps people.
  await rejects(db.createHousehold({ code: 'nope', name: 'X', email: 'x@example.com', password: 'secret1' }), /family code/);
  await db.createHousehold({ code: 'northpole', name: 'The Elves', email: 'elf@example.com', password: 'secret1' });
  assert.strictEqual((await db.listPeople()).length, 0);
  assert.strictEqual((await db.getSession()).household.groups.length, 5);
  await db.signIn('nick@example.com', 'jingle');
  await db.startNewYear();
  const seasons = await db.listSeasons();
  assert.strictEqual(seasons.filter(s => !s.archived).length, 1);
  assert.strictEqual(seasons[0].year, season.year + 1);
  assert.strictEqual((await db.listBudgets(seasons[0].id)).length, 7);
  await rejects(db.addGift({ person_id: 'p1', season_id: season.id, name: 'x' }), /read-only/);

  console.log('All tests passed. Ho ho ho!');
})().catch(e => { console.error(e); process.exit(1); });
