import { describe, expect, it } from 'vitest';
import { allowedNavigation, trustedOrigin } from './security';

describe('desktop trust boundary', () => {
  it('allows loopback HTTP only for unpackaged development', () => {
    expect(trustedOrigin('http://localhost:3000', false)).toBe('http://localhost:3000');
    expect(() => trustedOrigin('http://localhost:3000', true)).toThrow();
    expect(() => trustedOrigin('http://example.com', false)).toThrow();
  });
  it('rejects credentials, paths, queries, and non-web schemes', () => {
    for (const value of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'https://a:b@example.com',
      'https://example.com/path',
      'https://example.com/?next=other',
    ]) {
      expect(() => trustedOrigin(value, true)).toThrow();
    }
  });
  it('requires exact origin for navigation and redirects', () => {
    const origin = trustedOrigin('https://life.example.com', true);
    expect(allowedNavigation(`${origin}/today`, origin)).toBe(true);
    for (const value of [
      'https://life.example.com.evil.test',
      'https://life.example.com@evil.test',
      'http://life.example.com',
      'file:///tmp/test',
      'https://life.example.com:444',
    ]) {
      expect(allowedNavigation(value, origin)).toBe(false);
    }
  });
});
