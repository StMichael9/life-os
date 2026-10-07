import { ZodError } from 'zod';
import { CaptureConflict } from '@life-os/database';
import { AuthenticationRequired, createInboxService } from './index';
import { createAuthService, LoginFailed, RateLimited } from './auth';
import { createHttpSecurity, CsrfRejected, InvalidRequest } from './http-security';

type Auth = ReturnType<typeof createAuthService>;
type Inbox = ReturnType<typeof createInboxService>;
type Security = ReturnType<typeof createHttpSecurity>;
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
    },
  });
}
function failure(error: unknown) {
  if (error instanceof RateLimited) {
    const response = json({ error: error.message }, 429);
    response.headers.set('Retry-After', String(error.retryAfter));
    return response;
  }
  if (error instanceof AuthenticationRequired) return json({ error: 'Sign in to continue.' }, 401);
  if (error instanceof LoginFailed) return json({ error: error.message }, 401);
  if (error instanceof CsrfRejected) return json({ error: error.message }, 403);
  if (error instanceof InvalidRequest)
    return json(
      {
        error:
          error.status === 413 ? 'Capture is too long. Shorten it and try again.' : error.message,
      },
      error.status,
    );
  if (error instanceof CaptureConflict) return json({ error: error.message }, 409);
  if (error instanceof ZodError) return json({ error: 'Check the submitted fields.' }, 400);
  // Do not expose database errors, request bodies or credentials to logs/responses.
  return json({ error: 'Your request could not be completed. Please try again.' }, 503);
}
export function createHttpHandlers(auth: Auth, inbox: Inbox, security: Security) {
  return {
    async auth(request: Request, action: string) {
      try {
        if (request.method === 'GET' && action === 'csrf') {
          const issued = security.issueCsrf(request);
          const response = json({ token: issued.token });
          if (issued.cookie) response.headers.append('Set-Cookie', issued.cookie);
          return response;
        }
        if (request.method === 'GET' && action === 'session') {
          const token = security.sessionToken(request);
          const principal = token ? await auth.verify(token) : null;
          if (!principal) throw new AuthenticationRequired();
          return json({ profile: principal.profile });
        }
        if (request.method !== 'POST' || !['login', 'logout', 'refresh'].includes(action))
          return json({ error: 'Not found.' }, 404);
        security.assertUnsafe(request);
        const body = await security.readJson(request);
        const token = security.sessionToken(request);
        if (action === 'logout') {
          if (JSON.stringify(body) !== '{}') throw new InvalidRequest();
          await auth.logout(token);
          const response = json({ ok: true });
          for (const value of security.clearCookies()) response.headers.append('Set-Cookie', value);
          return response;
        }
        if (action === 'refresh' && JSON.stringify(body) !== '{}') throw new InvalidRequest();
        const session = action === 'login' ? await auth.login(body) : await auth.refresh(token);
        if (action === 'login') await auth.logout(token); // replace any existing browser session
        const response = json({ ok: true });
        if (action === 'login' || ('rotated' in session && session.rotated))
          response.headers.append(
            'Set-Cookie',
            security.sessionCookie(session.token, session.expiresAt),
          );
        return response;
      } catch (error) {
        return failure(error);
      }
    },
    async inbox(request: Request) {
      try {
        const token = security.sessionToken(request);
        if (request.method === 'GET') {
          const url = new URL(request.url);
          for (const key of url.searchParams.keys())
            if (key !== 'cursor') throw new InvalidRequest();
          if (url.searchParams.getAll('cursor').length > 1) throw new InvalidRequest();
          const raw = url.searchParams.get('cursor');
          if (raw && raw.length > 200) throw new InvalidRequest();
          let cursor: unknown = undefined;
          if (raw) {
            try {
              cursor = JSON.parse(raw);
            } catch {
              throw new InvalidRequest();
            }
          }
          return json(await inbox.list(token, cursor));
        }
        if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
        security.assertUnsafe(request);
        return json({ item: await inbox.capture(token, await security.readJson(request)) }, 201);
      } catch (error) {
        return failure(error);
      }
    },
  };
}
