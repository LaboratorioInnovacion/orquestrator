import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeGateway } from '../scripts/probe-gateway.mjs';

function transport(data, event = 'message') {
  return class extends EventTarget {
    constructor() {
      super();
      if (event) queueMicrotask(() => this.dispatchEvent(
        event === 'message' ? new MessageEvent(event, { data }) : new Event(event)));
    }
    close() { this.dispatchEvent(new Event('close')); }
  };
}

test('challenge discovery never claims authentication or a session', async () => {
  assert.deepEqual(await probeGateway('ws://localhost:18789', {
    Socket: transport(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'test' } }))
  }), { challengeReceived: true, authenticated: false, sessionVerified: false });
});
for (const data of ['invalid json', '{}', 'null', '{"type":"event","event":"connect.challenge"}']) {
  test(`rejects invalid first frame: ${data}`, async () => {
    await assert.rejects(probeGateway('ws://localhost', { Socket: transport(data) }));
  });
}
for (const event of ['close', 'error', null]) {
  test(`fails on ${event ?? 'timeout'}`, async () => {
    await assert.rejects(probeGateway('ws://localhost', { Socket: transport(null, event), timeoutMs: 10 }));
  });
}
test('rejects credentials and unsupported protocols before connecting', () => {
  for (const url of ['https://localhost', 'ws://user:secret@localhost', 'ws://localhost?token=secret']) {
    assert.throws(() => probeGateway(url));
  }
});
