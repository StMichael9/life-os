import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const config: NextConfig = {
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingIncludes: {
    '/*': [
      '../../packages/database/migrations/**/*',
      '../../node_modules/.pnpm/@electric-sql+pglite@*/node_modules/@electric-sql/pglite/dist/**/*',
    ],
  },
  // Use the supported compiler API; detached CLI output is unavailable in some sandboxes.
  experimental: { useTypeScriptCli: false },
  transpilePackages: ['@life-os/app', '@life-os/ui', '@life-os/shared'],
};
export default config;
