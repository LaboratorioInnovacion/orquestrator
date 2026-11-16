import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, type TaskSnapshot } from '../../services/orchestrator/scheduler.ts';
import type { Plan } from '../../packages/contracts/plan.ts';
const plan: Plan = {
  objective: 'Investigar y revisar', revision: 1,
  tasks: [
    { key: 'review', role: 'reviewer', dependsOn: ['a', 'b'], deliverable: 'review.md', criteria: ['Verificado'] },
    ...['a', 'b', 'c'].map(key => ({ key, role: 'researcher' as const, dependsOn: [], deliverable: `${key}.md`, criteria: ['Fuentes'] }))
  ]
};
function state(): Record<string, TaskSnapshot> {
  return Object.fromEntries(plan.tasks.map(t => [t.key, { status: 'pending', workspace: t.key }]));
}
test('admits parallel independent specialists but caps at two', () => {
  const result = schedule(plan, state());
  assert.deepEqual(result.dispatch, ['a', 'b']);
  assert.ok(result.waiting.some(t => t.key === 'c' && t.reason === 'specialist_capacity'));
});
test('review waits for acceptance, not just runtime completion', () => {
  const snapshots = state();
  snapshots.a.status = 'completed';
  snapshots.b.status = 'reviewing';
  assert.ok(!schedule(plan, snapshots).dispatch.includes('review'));
  snapshots.b.status = 'completed';
  assert.ok(schedule(plan, snapshots).dispatch.includes('review'));
});
test('failed dependency blocks descendants', () => {
  const snapshots = state();
  snapshots.a.status = 'failed';
  assert.deepEqual(schedule(plan, snapshots).blocked, [{ key: 'review', reason: 'dependency_failed:a' }]);
});
test('shared mutable workspace permits one admission', () => {
  const snapshots = state();
  snapshots.b.workspace = 'a';
  assert.deepEqual(schedule(plan, snapshots).dispatch, ['a', 'c']);
});
test('ambiguous or cancelling runs retain capacity and workspace', () => {
  const snapshots = state();
  snapshots.a.status = 'needs_reconciliation';
  snapshots.b.status = 'cancelling';
  assert.deepEqual(schedule(plan, snapshots).dispatch, []);
});
test('pause prevents new dispatches without cancelling runs', () => {
  const snapshots = state();
  snapshots.a.status = 'running';
  const original = structuredClone(snapshots);
  assert.deepEqual(schedule(plan, snapshots, undefined, true).dispatch, []);
  assert.deepEqual(snapshots, original);
});
test('total capacity and zero limits stop admissions', () => {
  assert.equal(schedule(plan, state(), { total: 1, specialists: 2 }).dispatch.length, 1);
  assert.equal(schedule(plan, state(), { total: 0, specialists: 0 }).dispatch.length, 0);
  assert.throws(() => schedule(plan, state(), { total: -1, specialists: 1 }));
});
test('missing or foreign states fail closed', () => {
  assert.throws(() => schedule(plan, {}));
  assert.throws(() => schedule(plan, { ...state(), foreign: { status: 'running', workspace: 'foreign' } }));
});
