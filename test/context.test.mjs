import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScreenshotContext } from '../context.ts';

const image = (data = 'AAAA') => ({ type: 'image', data, mimeType: 'image/jpeg' });
const shot = (id, toolName = 'phone_screenshot') => ({
  role: 'toolResult', toolCallId: id, toolName,
  content: [{ type: 'text', text: 'coordinates 0–1' }, image(id)],
  details: { bytes: id.length }, isError: false, timestamp: 1,
});
const count = messages => messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(b => b.type === 'image').length;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

test('omits only historical phone image blocks and preserves text, metadata and frozen source', () => {
  const messages = freeze([
    { role: 'system', content: 'prompt', timestamp: 0 }, shot('old'),
    { role: 'assistant', content: [{ type: 'text', text: 'analysis of old screenshot' }], timestamp: 2 },
    { role: 'user', content: 'next question', timestamp: 3 },
    shot('current-a'), shot('current-b'), shot('other', 'read'),
    { role: 'user', content: [image('attachment')], timestamp: 4 },
  ]);
  const before = JSON.stringify(messages);
  const result = projectScreenshotContext(messages, new Set(['old']));
  assert.equal(count(result), 4);
  assert.equal(result[1].content.some(b => b.type === 'image'), false);
  assert.deepEqual(result[1].content[0], { type: 'text', text: 'coordinates 0–1' });
  assert.ok(result[1].content.some(b => b.type === 'text' && b.text.includes('历史')));
  const { content: ignored, ...metadata } = result[1];
  const { content: originalContent, ...originalMetadata } = messages[1];
  assert.deepEqual(metadata, originalMetadata);
  assert.equal(result[2], messages[2]);
  assert.equal(result[4], messages[4]);
  assert.equal(result[6], messages[6]);
  assert.equal(JSON.stringify(messages), before);
});

test('text-only next task sends zero historical screenshots even without another tool call', () => {
  const result = projectScreenshotContext([shot('a'), shot('b'), { role: 'user', content: 'hello' }], new Set(['a', 'b']));
  assert.equal(count(result), 0);
  assert.equal(result.at(-1).content, 'hello');
});

test('image-only tool result receives a nonempty marker; repeated projection is idempotent', () => {
  const message = { ...shot('old'), content: [image()] };
  const once = projectScreenshotContext([message], new Set(['old']));
  assert.equal(once[0].content.length, 1);
  assert.equal(once[0].content[0].type, 'text');
  assert.deepEqual(projectScreenshotContext(once, new Set(['old'])), once);
});

test('a reused ID on another tool does not cause image removal', () => {
  const messages = [shot('same', 'read')];
  assert.deepEqual(projectScreenshotContext(messages, new Set(['same'])), messages);
});

test('synthetic payload keeps two current images but removes accumulated historical image bytes', () => {
  const old = Array.from({ length: 30 }, (_, i) => ({ ...shot(`old-${i}`), content: [image('A'.repeat(100_000))] }));
  const messages = [...old, shot('current-1'), shot('current-2')];
  const result = projectScreenshotContext(messages, new Set(old.map(m => m.toolCallId)));
  assert.equal(count(result), 2);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < Buffer.byteLength(JSON.stringify(messages)) / 100);
});
