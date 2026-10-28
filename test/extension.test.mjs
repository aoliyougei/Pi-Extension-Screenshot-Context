import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, SessionManager, shot, countImages } from './harness.mjs';

const source = h => h.manager.buildSessionProjection().messages;

test('default disabled; invalid arguments do not enable; status does not append model messages', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  const initial = h.manager.getEntries().length;
  await h.command('status');
  await h.command('bad');
  assert.equal(countImages(await h.project(source(h))), 1);
  assert.equal(h.manager.getEntries().length, initial);
  assert.match(h.notifications[0].text, /关闭|off/i);
  assert.match(h.notifications.at(-1).text, /on.*off.*status/i);
});

test('enable omits existing images; retains all current task images; next prompt expires them; off restores them', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  await h.command('on');
  assert.equal(countImages(await h.project(source(h))), 0);
  await h.start();
  h.manager.appendMessage(shot('a'));
  h.manager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'analysis' }], timestamp: 2 });
  h.manager.appendMessage(shot('b'));
  assert.equal(countImages(await h.project(source(h))), 2);
  assert.equal(countImages(source(h)), 3);
  await h.start();
  assert.equal(countImages(await h.project(source(h))), 0);
  h.setIdle(true);
  await h.command('off');
  assert.equal(countImages(await h.project(source(h))), 3);
  assert.match(h.notifications.at(-1).text, /历史.*截图/);
});

test('retries, errors, aborts, steer and queued follow-up do not reset the busy-period boundary', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  await h.command('on');
  await h.start();
  h.manager.appendMessage(shot('current'));
  const before = source(h);
  await h.runner.emit({ type: 'agent_start' });
  await h.runner.emit({ type: 'agent_end', messages: [{ role: 'assistant', stopReason: 'error', content: [], timestamp: 3 }] });
  await h.runner.emit({ type: 'agent_start' });
  assert.equal(countImages(await h.project(before)), 1);
  for (const streamingBehavior of ['steer', 'followUp']) {
    await h.runner.emitInput('queued', undefined, 'rpc', streamingBehavior);
    const user = { role: 'user', content: [{ type: 'text', text: 'queued' }], timestamp: 4 };
    await h.runner.emit({ type: 'message_start', message: user });
    h.manager.appendMessage(user);
    assert.equal(countImages(await h.project(source(h))), 1);
  }
  await h.runner.emit({ type: 'agent_settled', aborted: true });
  assert.equal(countImages(await h.project(source(h))), 1);
  await h.start();
  assert.equal(countImages(await h.project(source(h))), 0);
});

test('repeating on while idle does not expire the last task images or write another setting', async () => {
  const h = await harness();
  await h.command('on');
  await h.start();
  h.manager.appendMessage(shot('current'));
  h.setIdle(true);
  const entries = h.manager.getEntries().length;
  await h.command('on');
  assert.equal(h.manager.getEntries().length, entries);
  assert.equal(countImages(await h.project(source(h))), 1);
});

test('current screenshot not yet persisted stays visible; custom continuations do not start a user task', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  await h.command('on');
  await h.start();
  assert.equal(countImages(await h.project([...source(h), shot('unpersisted')])), 1);
  h.manager.appendMessage(shot('current'));
  await h.start('custom');
  assert.equal(countImages(await h.project(source(h))), 1);
});

test('reject setting changes while busy but allow status and display queue limitation', async () => {
  const h = await harness();
  await h.command('on');
  await h.start();
  const entries = h.manager.getEntries().length;
  await h.command('off');
  assert.equal(h.manager.getEntries().length, entries);
  assert.match(h.notifications.at(-1).text, /空闲/);
  await h.command('status');
  assert.match(h.notifications.at(-1).text, /开启|on/i);
  assert.match(h.notifications.at(-1).text, /follow_up|后续/);
});

test('resume/reload retains enabled state and latest task boundary without resending old images', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  await h.command('on');
  await h.start();
  h.manager.appendMessage(shot('current'));
  const resumed = await harness(h.manager);
  await resumed.command('status');
  assert.match(resumed.notifications.at(-1).text, /开启|on/i);
  assert.equal(countImages(await resumed.project(source(resumed))), 1);
  await resumed.start();
  assert.equal(countImages(await resumed.project(source(resumed))), 0);
});

test('active branch determines settings and cutoff after navigation, not abandoned entries', async () => {
  const h = await harness();
  const root = h.manager.appendMessage({ role: 'user', content: 'root', timestamp: 1 });
  await h.command('on');
  h.manager.appendMessage(shot('branch-a'));
  await h.start();
  const enabledLeaf = h.manager.getLeafId();
  assert.equal(countImages(await h.project(source(h))), 0);
  h.manager.branch(root);
  h.manager.appendMessage(shot('branch-b'));
  await h.runner.emit({ type: 'session_tree', newLeafId: h.manager.getLeafId() });
  assert.equal(countImages(await h.project(source(h))), 1);
  await h.command('status');
  assert.match(h.notifications.at(-1).text, /关闭|off/i);
  h.manager.branch(enabledLeaf);
  await h.runner.emit({ type: 'session_tree', newLeafId: enabledLeaf });
  assert.equal(countImages(await h.project(source(h))), 0);
});

test('compaction keeping old and current results does not move the task boundary', async () => {
  const h = await harness();
  const kept = h.manager.appendMessage(shot('old'));
  await h.command('on');
  await h.start();
  h.manager.appendMessage(shot('current'));
  h.manager.appendCompaction('summary', kept, 123);
  assert.equal(countImages(await h.project(source(h))), 1);
  await h.start();
  assert.equal(countImages(await h.project(source(h))), 0);
});

test('settings entries never enter model context; no images or call-ID lists are stored in custom state', async () => {
  const h = await harness(SessionManager.inMemory('/tmp'));
  h.manager.appendMessage(shot('private-shot'));
  await h.command('on');
  await h.start();
  const customs = h.manager.getEntries().filter(e => e.type === 'custom');
  assert.ok(customs.length >= 1);
  assert.ok(customs.every(e => !JSON.stringify(e.data).includes('private-shot')));
  assert.equal(source(h).some(m => m.role === 'custom'), false);
});
