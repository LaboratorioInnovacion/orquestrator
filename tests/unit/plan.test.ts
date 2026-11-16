import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from '../../packages/contracts/plan.ts';

const task = (key: string, dependsOn: string[] = []) => ({ key, role: 'researcher', dependsOn, deliverable: `${key}.md`, criteria: ['Fuentes identificadas'] });
const plan = (tasks = [task('a')]) => ({ objective: 'Comparar soluciones', revision: 1, tasks });

test('fan-out/fan-in sorts dependencies even when review appears first', () => {
  const result = validatePlan(plan([task('review', ['a', 'b']), task('b'), task('a')]));
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.ready, ['b', 'a']);
  assert.ok(result.order.indexOf('review') > result.order.indexOf('a'));
  assert.ok(result.order.indexOf('review') > result.order.indexOf('b'));
});
for (const [name, tasks, code] of [
  ['cycle', [task('a', ['b']), task('b', ['a'])], 'cycle'],
  ['self reference', [task('a', ['a'])], 'cycle'],
  ['unknown dependency', [task('a', ['missing'])], 'missing_dependency'],
  ['duplicate key', [task('a'), task('a')], 'duplicate_key'],
  ['duplicate edge', [task('a'), task('b', ['a', 'a'])], 'duplicate_dependency']
] as const) {
  test(`rejects ${name}`, () => {
    const result = validatePlan(plan([...tasks]));
    assert.equal(result.valid, false);
    if (!result.valid) assert.equal(result.issues[0].code, code);
  });
}
for (const input of [null, plan([]), plan(Array.from({ length: 21 }, (_, i) => task(`t${i}`))),
  { ...plan(), objective: ' ' }, plan([{ ...task('a'), criteria: [] }]),
  { ...plan(), revision: 0 }, { ...plan(), unexpected: true }]) {
  test(`rejects invalid schema ${JSON.stringify(input).slice(0, 70)}`, () => {
    assert.equal(validatePlan(input).valid, false);
  });
}
