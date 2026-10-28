import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Tests use the installed host SDK, never a second bundled runtime.
const sdkEntry = new URL(import.meta.resolve('@earendil-works/pi-coding-agent')).pathname;
const sdk = await import(pathToFileURL(sdkEntry).href);
const loader = await import(pathToFileURL(resolve(dirname(sdkEntry), 'core/extensions/loader.js')).href);

export const { SessionManager } = sdk;
export async function harness(manager = SessionManager.inMemory('/tmp'), extensionPaths = [resolve('index.ts')]) {
  const loaded = await loader.loadExtensions(extensionPaths, '/tmp');
  if (loaded.errors.length) throw new Error(JSON.stringify(loaded.errors));
  let idle = true;
  const notifications = [];
  const errors = [];
  const runner = new sdk.ExtensionRunner(loaded.extensions, loaded.runtime, '/tmp', manager, {});
  const unused = () => { throw new Error('Unexpected host action'); };
  runner.bindCore({
    appendEntry: (type, data) => manager.appendCustomEntry(type, data),
    sendMessage: unused, sendUserMessage: unused, setSessionName: unused,
    getSessionName: () => undefined, setLabel: unused, getActiveTools: () => [],
    getAllTools: () => [], getSettings: () => ({}), setActiveTools: unused,
    refreshTools: unused, getCommands: () => [], setModel: unused,
    getThinkingLevel: () => 'off', setThinkingLevel: unused,
  }, {
    getModel: () => undefined, getScopedModels: () => [], isIdle: () => idle,
    isProjectTrusted: () => true, getSignal: () => undefined, abort: unused,
    hasPendingMessages: () => false, shutdown: unused, getContextUsage: () => undefined,
    compact: unused, getSystemPrompt: () => 'system',
  });
  runner.setUIContext({ notify: (text, level) => notifications.push({ text, level }) }, 'rpc');
  runner.onError(error => errors.push(error));
  await runner.emit({ type: 'session_start', reason: 'startup' });
  return {
    manager, runner, notifications, errors,
    setIdle(value) { idle = value; },
    async command(args) {
      const command = runner.getCommand('screenshot-context');
      if (!command) throw new Error('Missing /screenshot-context command');
      await command.handler(args, runner.createCommandContext());
      if (errors.length) throw new Error(JSON.stringify(errors));
    },
    async start(messageType = 'user') {
      idle = false;
      // Calls the real registered handler via the SDK; no provider calls involved.
      await runner.emitBeforeAgentStart(messageType === 'user'
        ? { messageType: 'user', prompt: 'task', images: undefined }
        : { messageType: 'custom', message: { role: 'custom', customType: 'test', content: 'continue', display: false, timestamp: 1 } },
      { sections: [], selectedTools: [] });
      if (errors.length) throw new Error(JSON.stringify(errors));
    },
    async project(messages) {
      const projected = await runner.emitContext(messages);
      if (errors.length) throw new Error(JSON.stringify(errors));
      return projected;
    },
  };
}

export const image = { type: 'image', data: 'AAAA', mimeType: 'image/jpeg' };
export const shot = id => ({ role: 'toolResult', toolCallId: id, toolName: 'phone_screenshot', content: [{ type: 'text', text: 'screen' }, { ...image }], details: { bytes: 3 }, isError: false, timestamp: 1 });
export const countImages = messages => messages.flatMap(m => Array.isArray(m.content) ? m.content : []).filter(b => b.type === 'image').length;
