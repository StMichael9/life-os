import { X509Certificate, timingSafeEqual } from 'node:crypto';

export function localOrigin(port: number) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
  return `https://127.0.0.1:${port}`;
}

export function pinnedLocalCertificate(pem: string, pin: string, now = Date.now()) {
  try {
    const cert = new X509Certificate(pem);
    const actual = Buffer.from(cert.fingerprint256.replaceAll(':', ''), 'hex');
    const expected = Buffer.from(pin.replaceAll(':', ''), 'hex');
    return (
      actual.length === 32 &&
      expected.length === 32 &&
      timingSafeEqual(actual, expected) &&
      cert.checkIP('127.0.0.1') === '127.0.0.1' &&
      Date.parse(cert.validFrom) <= now &&
      now < Date.parse(cert.validTo)
    );
  } catch {
    return false;
  }
}

export function allowedLocalRequest(value: string, origin: string) {
  try {
    const url = new URL(value);
    if (url.protocol === 'wss:') url.protocol = 'https:';
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}
