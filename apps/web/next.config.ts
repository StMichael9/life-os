import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  // Use the supported compiler API; detached CLI output is unavailable in some sandboxes.
  experimental: { useTypeScriptCli: false },
  transpilePackages: ['@life-os/app', '@life-os/ui', '@life-os/shared'],
};
export default config;
