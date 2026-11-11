import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';

// Capture the actual HTTP body after the real OpenAI-compatible serializer and all hooks.
for (const remove of [false, true]) test(`HTTP capture: same-path reread${remove ? ' characterizes late-removal receipt gap' : ' sends each new image instance'}`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'image-http-'));
  const bodies = [];
  const imageCounts = [];
  const paths = [];
  let session;
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const n = bodies.length - 1;
    imageCounts.push(JSON.stringify(body).match(/data:image\/jpeg;base64,/g)?.length ?? 0);
    const call = n === 0 || n === 2;
    const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: `read-${n}`, type: 'function', function: { name: 'fixture_read', arguments: '{"path":"same.jpg"}' } }] }
      : { role: 'assistant', content: 'observation complete' };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ id: `response-${n}`, object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason: call ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, images: { autoResize: false } });
    const runtime = await ModelRuntime.create({ modelsPath: null, authPath: join(cwd, 'auth.json'), modelsStorePath: join(cwd, 'models.json'), refreshOnCreate: false });
    runtime.registerProvider('capture', {
      baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'local-fixture-only',
      models: [{ id: 'fixture', name: 'Fixture', reasoning: false, input: ['text', 'image'], contextWindow: 100000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    });
    const extensions = [resolve('index.ts')];
    if (remove) {
      const path = join(cwd, 'late.ts');
      await writeFile(path, `export default function(pi) { pi.on('context_with_system', e => ({messages: e.messages.map(m => Array.isArray(m.content) ? {...m,content:m.content.map(b => b.type === 'image' ? {type:'text',text:'removed by later extension'} : b)} : m)})); }`);
      extensions.push(path);
    }
    const loader = new DefaultResourceLoader({ cwd, agentDir: join(cwd, 'agent'), settingsManager: settings, noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, agentsFilesOverride: () => [], additionalExtensionPaths: extensions });
    await loader.reload();
    const manager = SessionManager.inMemory(cwd);
    ({ session } = await createAgentSession({ cwd, agentDir: join(cwd, 'agent'), modelRuntime: runtime, model: runtime.getModel('capture', 'fixture'), settingsManager: settings, sessionManager: manager, resourceLoader: loader, tools: ['fixture_read'], customTools: [{
      name: 'fixture_read', label: 'Read', description: 'Read local fixture image', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      async execute(id, args) { paths.push(args.path); return { content: [{ type: 'image', data: '/9j/2Q==', mimeType: 'image/jpeg' }], details: { path: args.path } }; },
    }] }));
    await session.bindExtensions({ mode: 'rpc', uiContext: { notify() {} } });
    await session.prompt('/screenshot-context on');
    await session.prompt('read image');
    await session.prompt('read same image again');
    await session.prompt('continue without new image');
    assert.deepEqual(paths, ['same.jpg', 'same.jpg']);
    assert.deepEqual(imageCounts, remove ? [0, 0, 0, 0, 0] : [0, 1, 0, 1, 0]);
    const originals = manager.buildSessionProjection().messages.filter(m => m.role === 'toolResult');
    assert.equal(originals.length, 2);
    assert.notEqual(originals[0].toolCallId, originals[1].toolCallId);
    assert.ok(originals.every(m => m.content.some(b => b.type === 'image')));
    const receipts = manager.getBranch().filter(e => e.type === 'custom' && e.customType === 'screenshot-context-receipt');
    assert.equal(receipts.length, remove ? 0 : 2);
    if (remove) {
      const { harness, countImages } = await import('./harness.mjs');
      const restored = await harness(manager);
      assert.equal(countImages(await restored.project(manager.buildSessionProjection().messages)), 2);
    }
  } finally {
    if (session) { await session.abort(); session.dispose(); }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(cwd, { recursive: true, force: true });
  }
});
