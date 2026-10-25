// Run with: node test.js. Checks the countdown and budget maths.
// The data rules (who can see what) are tested in the database: supabase/tests/rls_test.sql.
import assert from 'assert';
import { sleeps, christmasYear, summarise, budgetFlag, money } from './js/util.js';

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

console.log('All tests passed. Ho ho ho!');
