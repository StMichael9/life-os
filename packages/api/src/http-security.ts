import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export class CsrfRejected extends Error {
  constructor() {
    super('Request could not be verified.');
  }
}
export class InvalidRequest extends Error {
  constructor(public readonly status = 400) {
    super('Invalid request.');
  }
}
const equal = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function createHttpSecurity(
  origin: string,
  secret: string,
  allowLoopbackHttp = false,
  clock: () => Date = () => new Date(),
) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' &&
      !(
        allowLoopbackHttp &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  ) {
    throw new Error(
      'APP_ORIGIN must be an exact HTTPS origin. Development HTTP requires explicit loopback opt-in.',
    );
  }
  if (Buffer.byteLength(secret) < 32)
    throw new Error('AUTH_SECRET must contain at least 32 bytes.');
  const secure = url.protocol === 'https:';
  const sessionName = secure ? '__Host-life_os_session' : 'life_os_dev_session';
  const csrfName = secure ? '__Host-life_os_csrf' : 'life_os_dev_csrf';
  const signature = (data: string) =>
    createHmac('sha256', secret).update(`csrf-v1:${data}`).digest('base64url');
  function cookie(request: Request, name: string) {
    const matches = (request.headers.get('cookie') ?? '')
      .split(';')
      .map((p) => p.trim())
      .filter((p) => p.startsWith(`${name}=`));
    return matches.length === 1 ? matches[0]!.slice(name.length + 1) : undefined;
  }
  function validCsrf(token: string | undefined) {
    if (!token || token.length > 160) return false;
    const parts = token.split('.');
    if (
      parts.length !== 3 ||
      !/^\d{10}$/.test(parts[0]!) ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[1]!) ||
      !/^[A-Za-z0-9_-]{43}$/.test(parts[2]!)
    )
      return false;
    const age = clock().getTime() / 1000 - Number(parts[0]);
    return age >= 0 && age < 7200 && equal(parts[2]!, signature(`${parts[0]}.${parts[1]}`));
  }
  function setCookie(name: string, value: string, maxAge: number, expires?: Date) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${expires ? `; Expires=${expires.toUTCString()}` : ''}${secure ? '; Secure' : ''}`;
  }
  return {
    sessionName,
    csrfName,
    sessionToken: (request: Request) => cookie(request, sessionName),
    issueCsrf(request: Request) {
      const existing = cookie(request, csrfName);
      if (validCsrf(existing)) return { token: existing!, cookie: undefined };
      const data = `${Math.floor(clock().getTime() / 1000)}.${randomBytes(32).toString('base64url')}`;
      const token = `${data}.${signature(data)}`;
      return { token, cookie: setCookie(csrfName, token, 7200) };
    },
    assertUnsafe(request: Request) {
      const site = request.headers.get('sec-fetch-site');
      const token = request.headers.get('x-csrf-token');
      const stored = cookie(request, csrfName);
      if (
        request.headers.get('origin') !== origin ||
        site === 'cross-site' ||
        !token ||
        !stored ||
        !validCsrf(token) ||
        !equal(token, stored)
      )
        throw new CsrfRejected();
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
      )
        throw new InvalidRequest(415);
    },
    sessionCookie(token: string, expiresAt: Date) {
      return setCookie(
        sessionName,
        token,
        Math.max(0, Math.floor((expiresAt.getTime() - clock().getTime()) / 1000)),
        expiresAt,
      );
    },
    clearCookies() {
      return [setCookie(sessionName, '', 0, new Date(0)), setCookie(csrfName, '', 0, new Date(0))];
    },
    async readJson(request: Request) {
      const max = 16_384;
      const declared = request.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > max))
        throw new InvalidRequest(413);
      const reader = request.body?.getReader();
      if (!reader) throw new InvalidRequest();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > max) {
            await reader.cancel();
            throw new InvalidRequest(413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch {
        throw new InvalidRequest();
      }
    },
  };
}
