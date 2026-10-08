import type { createTaskService } from './tasks';
import type { createHttpSecurity } from './http-security';
import { InvalidRequest } from './http-security';
import { json, failure } from './http';
export function createTaskHttp(
  service: ReturnType<typeof createTaskService>,
  security: ReturnType<typeof createHttpSecurity>,
) {
  return async (request: Request, parts: string[] = []) => {
    try {
      const token = security.sessionToken(request),
        url = new URL(request.url);
      if (request.method === 'GET') {
        if (parts.length === 2 && parts[0] === 'from-inbox' && !url.search)
          return json(await service.capture(token, parts[1]));
        if (!parts.length) {
          for (const key of url.searchParams.keys())
            if (url.searchParams.getAll(key).length !== 1) throw new InvalidRequest();
          return json(await service.list(token, Object.fromEntries(url.searchParams)));
        }
        if (parts.length === 1 && !url.search) return json(await service.detail(token, parts[0]));
        throw new InvalidRequest();
      }
      if (!['POST', 'PATCH'].includes(request.method))
        return json({ error: 'Method not allowed.' }, 405);
      if (url.search) throw new InvalidRequest();
      security.assertUnsafe(request);
      const body = await security.readJson(request),
        account = request.headers.get('x-life-os-account') ?? undefined;
      if (request.method === 'POST' && parts.length === 2 && parts[0] === 'from-inbox')
        return json({ item: await service.convert(token, parts[1], body, account) }, 201);
      if (request.method === 'POST' && !parts.length)
        return json({ item: await service.save(token, body, undefined, account) }, 201);
      if (request.method === 'PATCH' && parts.length === 1)
        return json({ item: await service.save(token, body, parts[0], account) });
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return failure(error);
    }
  };
}
