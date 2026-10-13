import { expect, it } from 'vitest';
import { localOrigin, allowedLocalRequest, pinnedLocalCertificate } from './local-trust';

it('restricts the offline runtime to its exact HTTPS loopback origin', () => {
  const origin = localOrigin(42173);
  expect(allowedLocalRequest(origin + '/api/execution', origin)).toBe(true);
  expect(allowedLocalRequest('wss://127.0.0.1:42173/channel', origin)).toBe(true);
  for (const url of [
    'http://127.0.0.1:42173/',
    'https://localhost:42173/',
    'https://127.0.0.1:42174/',
    'https://127.0.0.1.evil.test:42173/',
    'https://user@127.0.0.1:42173/',
    'file:///private',
  ])
    expect(allowedLocalRequest(url, origin)).toBe(false);
  for (const port of [0, 80, 65536, 1.5, NaN]) expect(() => localOrigin(port)).toThrow();
  expect(pinnedLocalCertificate('invalid certificate', '0'.repeat(64))).toBe(false);
});
