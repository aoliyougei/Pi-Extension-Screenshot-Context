import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, shot, countImages } from './harness.mjs';
const source = h => h.manager.buildSessionProjection().messages;
const success = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'analysis' }], timestamp: 2 };

test('default disabled, invalid arguments and status do not change state', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  h.manager.appendMessage(success);
  const entries = h.manager.getEntries().length;
  await h.command('status');
  await h.command('bad');
  assert.equal(countImages(await h.project(source(h))), 1);
  assert.equal(h.manager.getEntries().length, entries);
  assert.match(h.notifications[0].text, /关闭/);
});

test('enable filters consumed images, keeps pending images, off restores original history', async () => {
  const h = await harness();
  h.manager.appendMessage(shot('old'));
  h.manager.appendMessage(success);
  h.manager.appendMessage(shot('pending'));
  await h.command('on');
  assert.equal(countImages(await h.project(source(h))), 1);
  h.manager.appendMessage(success);
  assert.equal(countImages(await h.project(source(h))), 0);
  await h.command('off');
  assert.equal(countImages(await h.project(source(h))), 2);
  assert.match(h.notifications.at(-1).text, /历史.*截图/);
});

test('no lifecycle task markers, queue distinction or per-send counters needed', async () => {
  const h = await harness();
  await h.command('on');
  const entries = h.manager.getEntries().length;
  await h.start();
  h.manager.appendMessage(shot('pending'));
  for (const behavior of ['steer', 'followUp']) {
    await h.runner.emitInput('next', undefined, 'rpc', behavior);
    assert.equal(countImages(await h.project(source(h))), 1);
  }
  await h.runner.emit({ type: 'agent_start' });
  await h.runner.emit({ type: 'agent_end', messages: [] });
  assert.equal(countImages(await h.project(source(h))), 1);
  assert.equal(h.manager.getEntries().length, entries + 1);
});

test('busy changes rejected, duplicate on does not write, status describes pending analysis', async () => {
  const h = await harness();
  await h.command('on');
  const entries = h.manager.getEntries().length;
  await h.command('on');
  assert.equal(h.manager.getEntries().length, entries);
  h.setIdle(false);
  await h.command('off');
  assert.equal(h.manager.getEntries().length, entries);
  assert.match(h.notifications.at(-1).text, /空闲/);
  await h.command('status');
  assert.match(h.notifications.at(-1).text, /待分析/);
});

test('old enabled settings retained, obsolete task entries ignored, resume preserves pending pictures', async () => {
  const h = await harness();
  h.manager.appendCustomEntry('screenshot-context-settings', { version: 1, enabled: true });
  h.manager.appendMessage(shot('pending'));
  h.manager.appendCustomEntry('screenshot-context-task', { version: 1 });
  const resumed = await harness(h.manager);
  assert.equal(countImages(await resumed.project(source(resumed))), 1);
  h.manager.appendMessage(success);
  assert.equal(countImages(await resumed.project(source(resumed))), 0);
});

test('active branch and compaction projection determine settings and consumption', async () => {
  const h = await harness();
  const root = h.manager.appendMessage({ role: 'user', content: 'root', timestamp: 0 });
  await h.command('on');
  const kept = h.manager.appendMessage(shot('old'));
  h.manager.appendMessage(success);
  h.manager.appendMessage(shot('pending'));
  h.manager.appendCompaction('summary', kept, 123);
  const enabledLeaf = h.manager.getLeafId();
  assert.equal(countImages(await h.project(source(h))), 1);
  h.manager.branch(root);
  h.manager.appendMessage(shot('branch-b'));
  h.manager.appendMessage(success);
  assert.equal(countImages(await h.project(source(h))), 1);
  h.manager.branch(enabledLeaf);
  assert.equal(countImages(await h.project(source(h))), 1);
  assert.equal(countImages(source(h)), 2);
});
