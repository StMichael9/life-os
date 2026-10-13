import { readdir, readFile, lstat, readlink, mkdir, copyFile, rm, access } from 'node:fs/promises';
import { join, dirname, relative, resolve, sep, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const project = resolve(fileURLToPath(new URL('../', import.meta.url)));
const workspace = resolve(project, '../..');
const source = join(workspace, 'apps/web/.next/standalone');
const target = join(project, 'dist/backend');
const store = join(source, 'node_modules/.pnpm');
const inside = (root, path) => path === root || path.startsWith(root + sep);
const exists = (path) =>
  access(path).then(
    () => true,
    () => false,
  );

// Next's Windows pnpm tracing uses absolute junctions into the original checkout.
// Resolve their TRACED counterparts, never ship/copy arbitrary files from that checkout.
async function traced(path) {
  const info = await lstat(path);
  if (!info.isSymbolicLink()) return path;
  const linked = resolve(dirname(path), await readlink(path));
  const mapped = inside(source, linked)
    ? linked
    : inside(workspace, linked)
      ? join(source, relative(workspace, linked))
      : undefined;
  if (!mapped || !inside(source, mapped) || !(await exists(mapped)))
    throw new Error('A standalone dependency is missing its traced portable files.');
  return traced(mapped);
}

async function copyTree(from, to) {
  from = await traced(from);
  const info = await lstat(from);
  if (info.isDirectory()) {
    await mkdir(to, { recursive: true });
    for (const entry of await readdir(from)) {
      if (entry === '.env' || entry.startsWith('.env.'))
        throw new Error('Environment files cannot enter desktop resources.');
      if (entry !== 'node_modules') await copyTree(join(from, entry), join(to, entry));
    }
  } else if (info.isFile()) {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  } else throw new Error('Unsupported standalone file.');
}

async function packages(directory) {
  if (!(await exists(directory))) return [];
  const result = [];
  for (const entry of await readdir(directory)) {
    if (entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (entry.startsWith('@')) {
      for (const member of await readdir(path))
        result.push([entry + '/' + member, join(path, member)]);
    } else result.push([entry, path]);
  }
  return result.filter(([name]) => /^[a-zA-Z0-9@._/-]+$/.test(name));
}

async function peers(packagePath) {
  const directory = dirname(packagePath);
  return packages(basename(directory).startsWith('@') ? dirname(directory) : directory);
}

// Materialize each exact traced package with its exact pnpm neighbours nested inside.
// Nesting preserves different dependency versions (e.g. semver 6 and 7) without links.
async function materialize(name, path, destination, ancestors = new Map()) {
  path = await traced(path);
  if (ancestors.get(name) === path) return;
  if (!(await exists(join(path, 'package.json'))))
    throw new Error('A traced package has no package manifest: ' + name);
  await copyTree(path, destination);
  const next = new Map(ancestors).set(name, path);
  for (const [dependency, dependencyPath] of await peers(path)) {
    const resolved = await traced(dependencyPath);
    if (resolved === path || next.get(dependency) === resolved) continue;
    await materialize(dependency, resolved, join(destination, 'node_modules', dependency), next);
  }
}

export async function prepareBackend() {
  if (resolve(target) !== join(resolve(project), 'dist/backend') || !inside(project, target))
    throw new Error('Invalid backend preparation target.');
  await access(join(source, 'apps/web/desktop-server.mjs'));
  await rm(target, { recursive: true, force: true });
  await copyTree(source, target);
  const selected = new Map();
  for (const entry of await readdir(store)) {
    if (entry === 'node_modules') continue;
    for (const [name, path] of await packages(join(store, entry, 'node_modules'))) {
      const resolved = await traced(path);
      if (!(await exists(join(resolved, 'package.json')))) continue;
      if (!selected.has(name)) selected.set(name, resolved);
    }
  }
  // Preserve pnpm's selected hoisted aliases when multiple versions were traced.
  for (const [name, path] of await packages(join(store, 'node_modules'))) {
    const resolved = await traced(path);
    if (await exists(join(resolved, 'package.json'))) selected.set(name, resolved);
  }
  for (const [name, path] of selected)
    await materialize(name, path, join(target, 'node_modules', name));
  // Turbopack creates hashed external aliases under .next/node_modules as well.
  // Preserve every application-local alias, including those hashed names.
  async function localAliases(from, to) {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        if (from === source) continue;
        for (const [name, path] of await packages(join(from, entry.name)))
          await materialize(name, path, join(to, 'node_modules', name));
      } else if (entry.isDirectory())
        await localAliases(join(from, entry.name), join(to, entry.name));
    }
  }
  await localAliases(source, target);
  const require = createRequire(join(target, 'apps/web/server.js'));
  for (const name of ['next', '@electric-sql/pglite', '@node-rs/argon2']) {
    if (!inside(target, require.resolve(name)))
      throw new Error('Backend dependency escaped staging.');
    require(name);
  }
  const metadata = JSON.parse(await readFile(join(target, 'apps/web/package.json'), 'utf8'));
  if (metadata.name !== '@life-os/web') throw new Error('Unexpected bundled web runtime.');
  console.log(
    `Prepared portable backend: ${selected.size} traced packages, no workspace junctions.`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepareBackend();
