import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('Run native QA on Windows.');
const root = await mkdtemp(join(tmpdir(), 'life-os-native-qa-'));
const userData = join(root, 'user-data');
await mkdir(userData);
const bundle = join(root, 'native-qa.cjs');
const require = createRequire(import.meta.url);
const executable = require('electron');
if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Invalid cleanup path');
try {
  await build({
    entryPoints: [fileURLToPath(new URL('native-qa.ts', import.meta.url))],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  for (const phase of [
    'save',
    'rotate',
    'logout',
    'empty',
    'corrupt',
    'expired',
    'foreign',
    'unavailable',
    'http',
  ]) {
    const env = {
      ...process.env,
      LIFE_OS_NATIVE_QA_DIRECTORY: userData,
      LIFE_OS_NATIVE_QA_PHASE: phase,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(executable, [bundle], {
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30000,
    });
    if (result.status !== 0)
      throw new Error(
        `Native ${phase} failed: ${result.error ?? ''}\n${result.stdout}\n${result.stderr}`,
      );
    console.log(result.stdout.trim());
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
