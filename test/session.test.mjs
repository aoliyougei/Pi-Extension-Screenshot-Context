import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { harness, shot, countImages } from './harness.mjs';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';

// Real AgentSession and Agent loop; replace only the paid/network model transport.
for (const retry of [false, true]) test(`real session preserves disk history and pending screenshot filtering${retry ? ' across automatic retry' : ''}`, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'screenshot-session-'));
  let session;
  try {
    const manager = SessionManager.create(cwd, join(cwd, 'sessions'));
    const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: retry, maxRetries: 1, baseDelayMs: 1 } });
    const runtime = await ModelRuntime.create({ modelsPath: null, modelsStorePath: join(cwd, 'models-store.json'), authPath: join(cwd, 'auth.json'), refreshOnCreate: false });
    runtime.registerProvider('local-test', {
      baseUrl: 'http://unused.invalid', apiKey: 'local-test-fixture', api: 'openai-completions',
      models: [{ id: 'deterministic', name: 'Deterministic', reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 100000, maxTokens: 1024 }],
    });
    const loader = new DefaultResourceLoader({
      cwd, agentDir: join(cwd, 'agent'), settingsManager: settings,
      noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true,
      additionalExtensionPaths: [resolve('index.ts')], agentsFilesOverride: () => [],
    });
    await loader.reload();
    let tools = 0;
    ({ session } = await createAgentSession({
      cwd, agentDir: join(cwd, 'agent'), sessionManager: manager, settingsManager: settings,
      modelRuntime: runtime, model: runtime.getModel('local-test', 'deterministic'), thinkingLevel: 'off',
      resourceLoader: loader, tools: ['phone_screenshot'],
      customTools: [{
        name: 'phone_screenshot', label: 'Screenshot', description: 'Local fixture',
        parameters: { type: 'object', properties: {} },
        async execute(id) {
          tools++;
          if (tools === 1) {
            await session.steer('steer current task');
            await session.followUp('queued follow-up');
          }
          return { content: shot(id).content, details: { bytes: 3 } };
        },
      }],
    }));
    const counts = [];
    let requests = 0;
    session.agent.streamFunction = (model, context) => {
      counts.push(countImages(context.messages));
      const request = requests++;
      const failed = retry && request === 1;
      const n = retry && request > 1 ? request - 1 : request;
      const call = !failed && [0, 1, 3].includes(n);
      const message = {
        role: 'assistant', api: model.api, provider: model.provider, model: model.id,
        timestamp: Date.now(), stopReason: failed ? 'error' : call ? 'toolUse' : 'stop',
        ...(failed ? { errorMessage: '503 Service Unavailable' } : {}),
        content: call ? [{ type: 'toolCall', id: `shot-${n}`, name: 'phone_screenshot', arguments: {} }] : [{ type: 'text', text: 'analysis complete' }],
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      };
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => { stream.push({ type: 'done', reason: message.stopReason, message }); stream.end(); });
      return stream;
    };
    await session.bindExtensions({ mode: 'rpc', uiContext: { notify() {} } });
    await session.prompt('/screenshot-context on');
    await session.prompt('inspect phone');
    assert.deepEqual(counts, retry ? [0, 1, 1, 1, 0, 1] : [0, 1, 1, 0, 1]);
    assert.equal(countImages(manager.buildSessionProjection().messages), 3);
    await session.prompt('text-only next question');
    assert.deepEqual(counts, retry ? [0, 1, 1, 1, 0, 1, 0] : [0, 1, 1, 0, 1, 0]);
    assert.equal(countImages(manager.buildSessionProjection().messages), 3);
    const disk = await readFile(manager.getSessionFile(), 'utf8');
    assert.equal(disk.split('\n').filter(line => line.includes('"type":"image"')).length, 3);
    const reopened = SessionManager.open(manager.getSessionFile());
    assert.equal(countImages(reopened.buildSessionProjection().messages), 3);
    const restored = await harness(reopened);
    assert.equal(countImages(await restored.project(reopened.buildSessionProjection().messages)), 0);
    assert.ok(session.messages.some(m => m.role === 'assistant' && m.content.some(b => b.type === 'text' && b.text === 'analysis complete')));
    assert.equal(tools, 3);
  } finally {
    if (session) { await session.abort(); session.dispose(); }
    await rm(cwd, { recursive: true, force: true });
  }
});
