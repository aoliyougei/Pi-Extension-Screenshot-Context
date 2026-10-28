import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
const exec = promisify(execFile);

test('local package installs into isolated Pi settings and discovers exactly the command extension', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'screenshot-package-'));
  try {
    const agentDir = join(temp, 'agent');
    const path = resolve('.');
    const env = { ...process.env, HOME: temp, PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1' };
    await exec('pi', ['install', path], { cwd: temp, env, timeout: 30000 });
    const settings = SettingsManager.create(temp, agentDir);
    const loader = new DefaultResourceLoader({ cwd: temp, agentDir, settingsManager: settings });
    await loader.reload();
    const loaded = loader.getExtensions();
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    assert.ok(loaded.extensions[0].commands.has('screenshot-context'));
    const config = JSON.parse(await readFile(join(agentDir, 'settings.json'), 'utf8'));
    assert.ok(config.packages.some(p => resolve(agentDir, typeof p === 'string' ? p : p.source) === path));
    await exec('pi', ['remove', path], { cwd: temp, env, timeout: 30000 });
    const after = JSON.parse(await readFile(join(agentDir, 'settings.json'), 'utf8'));
    assert.equal(after.packages?.some(p => resolve(agentDir, typeof p === 'string' ? p : p.source) === path) ?? false, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
