import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForArenaLayout} from '../public/arena-layout.js';

function fixture() {
  const stage = {clientWidth: 0, clientHeight: 0};
  const lifecycle = new EventTarget();
  let notify, disconnected = false;
  class Observer {
    constructor(callback) { notify = callback; }
    observe(value) { assert.equal(value, stage); }
    disconnect() { disconnected = true; }
  }
  return {stage, lifecycle, Observer, resize: () => notify(), disconnected: () => disconnected};
}
test('hidden arena waits through zero-size observations and starts when visible', async () => {
  const f = fixture();
  let settled = false;
  const ready = waitForArenaLayout(f.stage, f).then(value => { settled = true; return value; });
  f.resize();
  await Promise.resolve();
  assert.equal(settled, false);
  f.stage.clientWidth = 800;
  f.resize();
  await Promise.resolve();
  assert.equal(settled, false);
  f.stage.clientHeight = 450;
  f.resize();
  assert.equal(await ready, true);
  assert.equal(f.disconnected(), true);
});
test('navigation cancels a hidden arena and releases its observer', async () => {
  const f = fixture();
  const ready = waitForArenaLayout(f.stage, f);
  f.lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(await ready, false);
  assert.equal(f.disconnected(), true);
});
test('visible arena can initialize immediately', async () => {
  assert.equal(await waitForArenaLayout({clientWidth:800,clientHeight:450}, fixture()), true);
});
