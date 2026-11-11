import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, shot, countImages } from './harness.mjs';
const payload = { messages: [{ content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] }] };
const source = h => h.manager.buildSessionProjection().messages;
async function finish(h, stopReason) {
  const message = { role: 'assistant', stopReason, content: [], timestamp: Date.now() };
  const messageEntryId = h.manager.appendMessage(message);
  await h.runner.emit({ type: 'turn_end', message, messageEntryId, toolResults: [], toolResultEntryIds: [], turnIndex: 0, entries: [], continue: false, outcome: 'completed', context: {} });
}

test('image survives tool continuation and expires only after observed terminal stop', async () => {
  const h = await harness();
  await h.command('on');
  h.manager.appendMessage(shot('original'));
  await h.project(source(h));
  await h.runner.emitBeforeProviderRequest(payload);
  await finish(h, 'toolUse');
  assert.equal(h.manager.getBranch().filter(e => e.type === 'custom' && e.customType === 'screenshot-context-receipt').length, 0);
  assert.equal(countImages(await h.project(source(h))), 1, 'tool call must not consume the image');
  await h.runner.emitBeforeProviderRequest(payload);
  await finish(h, 'stop');
  assert.equal(countImages(await h.project(source(h))), 0, 'terminal response should consume the observed image');
  h.manager.appendMessage(shot('reread'));
  assert.equal(countImages(await h.project(source(h))), 1, 'same image reread remains a new instance');
});

test('existing toolUse receipt remains compatible without migrating history', async () => {
  const h = await harness();
  await h.command('on');
  h.manager.appendMessage(shot('old'));
  const { identifyImages } = await import('../context.ts');
  const [image] = identifyImages(source(h), h.manager.getBranch());
  const assistantEntryId = h.manager.appendMessage({ role: 'assistant', stopReason: 'toolUse', content: [], timestamp: 2 });
  h.manager.appendCustomEntry('screenshot-context-receipt', { version: 1, assistantEntryId, imageIds: [image.id] });
  assert.equal(countImages(await h.project(source(h))), 0);
  h.manager.appendMessage(shot('reread'));
  assert.equal(countImages(await h.project(source(h))), 1);
});
