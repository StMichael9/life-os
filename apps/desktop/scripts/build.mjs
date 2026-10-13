import { build } from 'esbuild';

const hosted = process.argv.includes('--hosted');
const value = hosted
  ? (process.env.LIFE_OS_WEB_URL ?? 'http://localhost:3000')
  : 'https://127.0.0.1';
const url = new URL(value);
if (
  hosted &&
  process.argv.includes('--release') &&
  (!process.env.LIFE_OS_WEB_URL || url.protocol !== 'https:')
) {
  throw new Error('A release requires an explicit HTTPS LIFE_OS_WEB_URL.');
}
if (
  url.username ||
  url.password ||
  url.pathname !== '/' ||
  url.search ||
  url.hash ||
  !['https:', 'http:'].includes(url.protocol) ||
  (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
) {
  throw new Error('LIFE_OS_WEB_URL must be an HTTPS origin or a development loopback origin.');
}
await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  define: {
    __LIFE_OS_WEB_URL__: JSON.stringify(url.origin),
    __LIFE_OS_OFFLINE__: JSON.stringify(!hosted),
  },
  sourcemap: true,
});
