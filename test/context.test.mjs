import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyImages, imageHash, payloadImageHashes, projectScreenshotContext } from '../context.ts';
import { shot, image, countImages } from './harness.mjs';

const fixture = () => {
  const messages = [shot('a'), { role: 'user', content: [image], timestamp: 2 }];
  const branch = messages.map((message, i) => ({ type: 'message', id: `entry-${i}`, message }));
  return { messages, branch };
};

test('later assistant success never consumes an image without an explicit receipt', () => {
  const { messages, branch } = fixture();
  messages.push({ role: 'assistant', stopReason: 'stop', content: [], timestamp: 3 });
  const images = identifyImages(messages, branch);
  assert.equal(countImages(projectScreenshotContext(messages, images)), 2);
  assert.equal(countImages(projectScreenshotContext(projectScreenshotContext(messages, images), images)), 2);
});

test('receipts target exact message instances and blocks, preserve metadata and original history', () => {
  const { messages, branch } = fixture();
  const images = identifyImages(messages, branch);
  const before = JSON.stringify(messages);
  const result = projectScreenshotContext(messages, images, new Set([images[0].id]));
  assert.equal(countImages(result), 1);
  assert.equal(result[0].toolCallId, 'a');
  assert.deepEqual(result[0].content[0], messages[0].content[0]);
  assert.match(result[0].content[1].text, /不代表已保存图片识别结果/);
  assert.equal(JSON.stringify(messages), before);
});

test('same bytes and same path reread with a new call ID is a new image instance', () => {
  const a = shot('first'), b = shot('second');
  const images = identifyImages([a, b], [{ type: 'message', id: 'a', message: a }, { type: 'message', id: 'b', message: b }]);
  assert.notEqual(images[0].id, images[1].id);
  assert.equal(countImages(projectScreenshotContext([a, b], images, new Set([images[0].id]))), 1);
});

test('unmapped or modified images remain pending rather than guessed', () => {
  const { messages, branch } = fixture();
  const changed = structuredClone(messages);
  changed[0].content[1].data = 'BBBB';
  assert.equal(identifyImages(changed, branch).length, 1);
  assert.equal(identifyImages(messages, []).length, 0);
});

for (const payload of [
  { messages: [{ content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } }] }] },
  { input: [{ content: [{ type: 'input_image', image_url: 'data:image/jpeg;base64,AAAA' }] }] },
  { messages: [{ content: [{ type: 'image', source: { type: 'base64', data: 'AAAA' } }] }] },
  { contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }] }] },
]) test('recognizes a standard inline provider image without storing base64', () => {
  assert.equal(payloadImageHashes(payload).get(imageHash('AAAA')), 1);
});

test('base64 text and unknown payload formats do not count as image receipt evidence', () => {
  assert.equal(payloadImageHashes({ text: 'data:image/jpeg;base64,AAAA', data: 'AAAA' }).size, 0);
});
