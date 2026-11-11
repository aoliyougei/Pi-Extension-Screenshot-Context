import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, shot, countImages } from './harness.mjs';
const source = h => h.manager.buildSessionProjection().messages;
const success = { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'done' }], timestamp: 2 };
const payload = { messages: [{ content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] }] };
async function finish(h, message = success) {
  const messageEntryId = h.manager.appendMessage(message);
  await h.runner.emit({ type: 'turn_end', message, messageEntryId, toolResults: [], toolResultEntryIds: [], turnIndex: 0, entries: [], continue: false, outcome: 'completed', context: {} });
}

test('successful assistant without observed payload does not expire images', async () => {
  const h = await harness();
  await h.command('on');
  h.manager.appendMessage(shot('new'));
  await h.project(source(h));
  await finish(h);
  assert.equal(countImages(await h.project(source(h))), 1);
});

test('one observed payload plus matching successful turn persists per-image receipts across reload', async () => {
  const h = await harness();
  await h.command('on');
  h.manager.appendMessage(shot('new'));
  await h.project(source(h));
  await h.runner.emitBeforeProviderRequest(payload);
  await finish(h);
  const restored = await harness(h.manager);
  assert.equal(countImages(await restored.project(source(restored))), 0);
  assert.equal(countImages(source(h)), 1);
  restored.manager.appendMessage(shot('reread'));
  assert.equal(countImages(await restored.project(source(restored))), 1);
  await restored.command('off');
  assert.equal(countImages(await restored.project(source(restored))), 2);
});

for (const reason of ['error', 'aborted', 'length']) test(`${reason} does not persist receipt`, async () => {
  const h = await harness(); await h.command('on');
  h.manager.appendMessage(shot('a'));
  await h.project(source(h)); await h.runner.emitBeforeProviderRequest(payload);
  await finish(h, { ...success, stopReason: reason });
  assert.equal(countImages(await h.project(source(h))), 1);
});

for (const mode of ['removed', 'multiple', 'projection-only']) test(`ambiguous ${mode} request remains pending`, async () => {
  const h = await harness(); await h.command('on'); h.manager.appendMessage(shot('a'));
  await h.project(source(h));
  if (mode !== 'projection-only') await h.runner.emitBeforeProviderRequest(mode === 'removed' ? {} : payload);
  if (mode === 'multiple') await h.runner.emitBeforeProviderRequest(payload);
  await finish(h);
  assert.equal(countImages(await h.project(source(h))), 1);
});

test('branch navigation cannot consume pending images with a receipt from another branch', async () => {
  const h = await harness(); await h.command('on'); const root = h.manager.appendMessage(shot('a'));
  await h.project(source(h)); await h.runner.emitBeforeProviderRequest(payload); await finish(h);
  const consumedLeaf = h.manager.getLeafId();
  h.manager.branch(root); await h.runner.emit({ type: 'session_tree', newLeafId: root });
  assert.equal(countImages(await h.project(source(h))), 1);
  h.manager.branch(consumedLeaf);
  assert.equal(countImages(await h.project(source(h))), 0);
});

test('defaults, busy validation and old settings remain supported without auto-migrating old images', async () => {
  const h = await harness(); h.manager.appendMessage(shot('old')); h.manager.appendMessage(success);
  await h.command('invalid'); await h.command('status');
  assert.match(h.notifications.at(-1).text, /关闭/);
  await h.command('on'); h.setIdle(false); await h.command('off');
  assert.match(h.notifications.at(-1).text, /空闲/);
  assert.equal(countImages(await h.project(source(h))), 1);
});
