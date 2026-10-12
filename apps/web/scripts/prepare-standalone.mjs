import { cp, mkdir, stat, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('../', import.meta.url));
const target = join(source, '.next/standalone/apps/web');
await mkdir(join(target, '.next'), { recursive: true });
await cp(join(source, '.next/static'), join(target, '.next/static'), { recursive: true });
await cp(join(source, 'desktop-server.mjs'), join(target, 'desktop-server.mjs'));
try {
  if ((await stat(join(source, 'public'))).isDirectory())
    await cp(join(source, 'public'), join(target, 'public'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// Next tracing may include local environment files. Never ship credentials in resources.
async function rejectEnvironmentFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.env' || entry.name.startsWith('.env.'))
      throw new Error('Environment files must not be included in desktop backend resources.');
    if (entry.isDirectory()) await rejectEnvironmentFiles(join(directory, entry.name));
  }
}
await rejectEnvironmentFiles(join(source, '.next/standalone'));
