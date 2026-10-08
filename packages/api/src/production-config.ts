import { productionDatabaseUrl } from '@life-os/database';
export function validateHostedConfiguration(env: Record<string, string | undefined>) {
  productionDatabaseUrl(env.DATABASE_URL);
  let origin: URL;
  try {
    origin = new URL(env.APP_ORIGIN ?? '');
  } catch {
    throw new Error('Set an exact HTTPS APP_ORIGIN.');
  }
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== env.APP_ORIGIN ||
    origin.username ||
    origin.password ||
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  )
    throw new Error('Set an exact hosted HTTPS APP_ORIGIN without a path or trailing slash.');
  if (
    !env.AUTH_SECRET ||
    Buffer.byteLength(env.AUTH_SECRET) < 32 ||
    /fixture|change[-_ ]?me|example|placeholder/i.test(env.AUTH_SECRET)
  )
    throw new Error('Set an independent random AUTH_SECRET of at least 32 bytes.');
  if (env.AUTH_ALLOW_HTTP_LOOPBACK !== undefined && env.AUTH_ALLOW_HTTP_LOOPBACK !== 'false')
    throw new Error('Remove the development HTTP opt-in from hosted configuration.');
  if (
    Object.entries(env).some(
      ([key, value]) =>
        key.startsWith('NEXT_PUBLIC_') &&
        /DATABASE|SECRET|TOKEN|PASSWORD|KEY/i.test(key) &&
        Boolean(value),
    ) ||
    env.MIGRATION_DATABASE_URL ||
    env.OPERATOR_DATABASE_URL ||
    env.BACKUP_DATABASE_URL ||
    env.RESTORE_DATABASE_URL ||
    env.LIFE_OS_BACKUP_KEY_FILE ||
    env.NEON_API_KEY ||
    env.VERCEL_TOKEN
  )
    throw new Error(
      'Privileged operations/provider credentials must not be present in the web runtime.',
    );
  return { valid: true as const };
}
