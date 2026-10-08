import { describe, it, expect } from 'vitest';
import { validateHostedConfiguration } from './production-config';
import { productionDatabaseUrl } from '@life-os/database';
const valid = {
  DATABASE_URL:
    'postgresql://runtime:fixture_password@ep-test-pooler.neon.tech/life_os?sslmode=verify-full',
  APP_ORIGIN: 'https://life-os.example.org',
  AUTH_SECRET: 'a'.repeat(64),
};
describe('redacted hosted configuration validation', () => {
  it('accepts exact HTTPS, a runtime URL and verified PostgreSQL TLS', () => {
    expect(validateHostedConfiguration(valid)).toEqual({ valid: true });
  });
  it('rejects missing/ambiguous/insecure settings and privileged web credentials', () => {
    for (const patch of [
      { DATABASE_URL: '' },
      { APP_ORIGIN: 'http://life-os.example.org' },
      { APP_ORIGIN: 'https://life-os.example.org/' },
      { APP_ORIGIN: 'https://user:secret@life-os.example.org' },
      { APP_ORIGIN: 'https://localhost' },
      { AUTH_SECRET: 'short' },
      { AUTH_SECRET: 'browser-fixture-secret-at-least-32-bytes' },
      { AUTH_ALLOW_HTTP_LOOPBACK: 'true' },
      { MIGRATION_DATABASE_URL: valid.DATABASE_URL },
      { OPERATOR_DATABASE_URL: valid.DATABASE_URL },
      { BACKUP_DATABASE_URL: valid.DATABASE_URL },
      { LIFE_OS_BACKUP_KEY_FILE: '/private/key' },
      { NEON_API_KEY: 'private-key' },
      { NEXT_PUBLIC_DATABASE_URL: valid.DATABASE_URL },
      { NEXT_PUBLIC_AUTH_SECRET: valid.AUTH_SECRET },
    ])
      expect(() => validateHostedConfiguration({ ...valid, ...patch })).toThrow();
  });
  it('does not echo database credentials in failures or accept TLS bypasses', () => {
    for (const query of [
      'sslmode=require',
      'sslmode=disable',
      'sslmode=verify-full&sslmode=disable',
      'sslmode=verify-full&uselibpqcompat=true',
      'sslmode=verify-full&ssl=false',
    ]) {
      try {
        productionDatabaseUrl('postgresql://runtime:sensitive-password@db.example/app?' + query);
        expect.fail('Invalid TLS accepted.');
      } catch (e) {
        expect(String(e)).not.toContain('sensitive-password');
      }
    }
    expect(() => productionDatabaseUrl('postgresql://runtime:password@localhost/app')).toThrow();
    expect(() =>
      productionDatabaseUrl('postgresql://runtime:password@localhost/app', true),
    ).toThrow();
    expect(
      productionDatabaseUrl('postgresql://runtime:password@localhost/ops_tests', true).hostname,
    ).toBe('localhost');
  });
});
