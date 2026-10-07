import { describe, expect, it } from 'vitest';
import { createHttpSecurity, CsrfRejected } from './http-security';

const secret = 'isolated-security-test-secret-at-least-32-bytes';
const origin = 'https://life.example.test';

describe('HTTP trust configuration and CSRF lifetime', () => {
  it('fails closed for missing HTTPS, broad origins, and weak secrets', () => {
    for (const value of ['http://life.example.test', `${origin}/`, `${origin}/path`, 'null'])
      expect(() => createHttpSecurity(value, secret)).toThrow();
    expect(() => createHttpSecurity('http://localhost:3000', secret)).toThrow();
    expect(() => createHttpSecurity('http://life.example.test', secret, true)).toThrow();
    expect(() => createHttpSecurity(origin, 'short')).toThrow();
    expect(createHttpSecurity('http://127.0.0.1:3000', secret, true).sessionName).toBe(
      'life_os_dev_session',
    );
  });

  it('rejects expired, tampered, and duplicate CSRF cookies and renews expired tokens', () => {
    let now = new Date('2026-10-07T12:00:00Z');
    const security = createHttpSecurity(origin, secret, false, () => now);
    const issued = security.issueCsrf(new Request(origin));
    const request = (token = issued.token, cookie = `${security.csrfName}=${token}`) =>
      new Request(origin, {
        method: 'POST',
        headers: {
          Origin: origin,
          Cookie: cookie,
          'X-CSRF-Token': token,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
    expect(() => security.assertUnsafe(request())).not.toThrow();
    expect(security.issueCsrf(request()).cookie).toBeUndefined();
    const forged = `${issued.token.slice(0, 11)}${'A'.repeat(43)}.${issued.token.split('.')[2]}`;
    expect(() => security.assertUnsafe(request(forged))).toThrow(CsrfRejected);
    expect(() =>
      security.assertUnsafe(
        request(
          issued.token,
          `${security.csrfName}=${issued.token}; ${security.csrfName}=${issued.token}`,
        ),
      ),
    ).toThrow(CsrfRejected);
    now = new Date(now.getTime() + 7_200_000);
    expect(() => security.assertUnsafe(request())).toThrow(CsrfRejected);
    expect(security.issueCsrf(request()).token).not.toBe(issued.token);
    expect(
      security.sessionToken(
        new Request(origin, {
          headers: { Cookie: `${security.sessionName}=one; ${security.sessionName}=two` },
        }),
      ),
    ).toBeUndefined();
  });
});
