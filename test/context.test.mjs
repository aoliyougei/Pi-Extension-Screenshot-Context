import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScreenshotContext } from '../context.ts';
import { shot, image, countImages } from './harness.mjs';
const response = stopReason => ({ role: 'assistant', stopReason, content: [{ type: 'text', text: 'analysis' }], timestamp: 2 });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('only pending screenshot batch remains, preserving frozen source, text, metadata and other images', () => {
  const messages = freeze([shot('old'), response('toolUse'), shot('a'), shot('b'), { ...shot('read'), toolName: 'read' }, { role: 'user', content: [image] }]);
  const before = JSON.stringify(messages);
  const result = projectScreenshotContext(messages);
  assert.equal(countImages(result), 4);
  assert.equal(result[0].content.some(b => b.type === 'image'), false);
  assert.deepEqual(result[0].content[0], messages[0].content[0]);
  assert.ok(result[0].content.some(b => b.type === 'text' && b.text.includes('历史')));
  const { content, ...metadata } = result[0];
  const { content: original, ...expected } = messages[0];
  assert.deepEqual(metadata, expected);
  assert.equal(result[2], messages[2]);
  assert.equal(result[4], messages[4]);
  assert.equal(JSON.stringify(messages), before);
});

for (const reason of ['stop', 'toolUse']) test(`successful ${reason} consumes previous screenshots, including same task`, () => {
  assert.equal(countImages(projectScreenshotContext([shot('a'), shot('b'), response(reason)])), 0);
});
for (const reason of ['error', 'aborted', 'length', 'pending', 'deferred', undefined]) test(`${reason} does not consume pending screenshots`, () => {
  assert.equal(countImages(projectScreenshotContext([shot('a'), response(reason)])), 1);
});

test('retry after errors keeps only pending batch, not previously consumed screenshots', () => {
  const messages = [shot('old'), response('stop'), shot('pending'), response('error'), response('aborted')];
  assert.equal(countImages(projectScreenshotContext(messages)), 1);
  assert.equal(countImages(projectScreenshotContext([...messages, response('stop')])), 0);
});

test('user/queue messages and reused IDs do not decide image lifetime', () => {
  const messages = [shot('same'), response('stop'), { role: 'user', content: 'next' }, shot('same')];
  assert.equal(countImages(projectScreenshotContext(messages)), 1);
});

test('image-only expired result has marker and projection is idempotent', () => {
  const messages = [{ ...shot('old'), content: [image] }, response('stop')];
  const once = projectScreenshotContext(messages);
  assert.equal(once[0].content.length, 1);
  assert.equal(once[0].content[0].type, 'text');
  assert.deepEqual(projectScreenshotContext(once), once);
});

test('synthetic accumulated image bytes removed while current batch retained', () => {
  const old = Array.from({ length: 30 }, (_, i) => ({ ...shot(`old-${i}`), content: [{ ...image, data: 'A'.repeat(100000) }] }));
  const messages = [...old, response('stop'), shot('current-1'), shot('current-2')];
  const result = projectScreenshotContext(messages);
  assert.equal(countImages(result), 2);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < Buffer.byteLength(JSON.stringify(messages)) / 100);
});
