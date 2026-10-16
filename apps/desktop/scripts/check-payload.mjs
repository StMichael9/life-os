import { readdir, lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve('apps/desktop/release/win-unpacked/resources');
async function walk(path) {
  for (const name of await readdir(path)) {
    assert(name !== '.env' && !name.startsWith('.env.'));
    const file = join(path, name),
      s = await lstat(file);
    assert(!s.isSymbolicLink(), 'Workspace link in portable payload');
    if (s.isDirectory()) await walk(file);
  }
}
await walk(root);
const folder = join(root, 'backend/packages/database/migrations');
const journal = JSON.parse(await readFile(join(folder, 'meta/_journal.json'), 'utf8'));
assert(journal.entries.length === 11);
for (const entry of journal.entries)
  assert(
    (await readFile(join(folder, entry.tag + '.sql'))).equals(
      await readFile('packages/database/migrations/' + entry.tag + '.sql'),
    ),
  );
console.log('PASS portable resources: eleven exact migrations, no junctions or environment files');
