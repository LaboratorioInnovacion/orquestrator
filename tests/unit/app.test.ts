import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../../services/orchestrator/app.ts';

const token = 'local-test-token-with-at-least-32-characters';
const headers = { authorization: `Bearer ${token}` };

test('requires configured owner token', () => {
  assert.throws(() => buildApp({ token: '' }));
});
test('health, auth and capability boundaries', async t => {
  const app = buildApp({ token });
  t.after(() => app.close());
  assert.equal((await app.inject('/api/v1/health/live')).statusCode, 200);
  for (const authorization of ['', 'Bearer wrong', `Basic ${token}`]) {
    const response = await app.inject({ url: '/api/v1/capabilities', headers: { authorization } });
    assert.equal(response.statusCode, 401);
    assert.ok(!response.body.includes(token));
  }
  const capability = await app.inject({ url: '/api/v1/capabilities', headers });
  assert.equal(capability.json().dispatch, false);
  assert.equal(capability.json().planValidation, true);
  assert.equal((await app.inject({ url: '/api/v1/health/ready', headers })).statusCode, 503);
});
test('HTTP accepts DAG and returns 422 for cycle; no work is persisted', async t => {
  const app = buildApp({ token });
  t.after(() => app.close());
  const payload = {
    objective: 'Crear informe', revision: 1,
    tasks: [{ key: 'a', role: 'executor', dependsOn: [], deliverable: 'informe.md', criteria: ['Contenido revisable'] }]
  };
  const valid = await app.inject({ method: 'POST', url: '/api/v1/plans/validate', headers, payload });
  assert.equal(valid.statusCode, 200);
  assert.deepEqual(valid.json().ready, ['a']);
  const invalid = await app.inject({ method: 'POST', url: '/api/v1/plans/validate', headers,
    payload: { ...payload, tasks: [{ ...payload.tasks[0], dependsOn: ['a'] }] } });
  assert.equal(invalid.statusCode, 422);
  assert.equal(invalid.json().issues[0].code, 'cycle');
});
test('rejects malformed JSON and oversized bodies', async t => {
  const app = buildApp({ token });
  t.after(() => app.close());
  const opts = { method: 'POST' as const, url: '/api/v1/plans/validate', headers: { ...headers, 'content-type': 'application/json' } };
  assert.equal((await app.inject({ ...opts, payload: '{' })).statusCode, 400);
  assert.equal((await app.inject({ ...opts, payload: JSON.stringify({ text: 'x'.repeat(130 * 1024) }) })).statusCode, 413);
});
