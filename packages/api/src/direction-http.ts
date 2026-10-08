import { createDirectionService } from './direction';
import { createHttpSecurity, InvalidRequest } from './http-security';
import { json, failure } from './http';
export function createDirectionHttp(
  service: ReturnType<typeof createDirectionService>,
  security: ReturnType<typeof createHttpSecurity>,
) {
  return async (request: Request, parts: string[] = []) => {
    try {
      const token = security.sessionToken(request);
      const [resource, id, action] = parts;
      const url = new URL(request.url);
      if (request.method === 'GET') {
        if (parts.length > 2) throw new InvalidRequest();
        const allowed = resource && !id ? ['before', 'goalId'] : [];
        for (const key of url.searchParams.keys())
          if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
            throw new InvalidRequest();
        if (resource === 'active-season' && parts.length === 1 && !url.search)
          return json(await service.activeSeason(token));
        if (!resource) return json(await service.meta(token));
        if (id) return json(await service.detail(token, resource, id));
        return json(
          await service.list(
            token,
            resource,
            url.searchParams.get('before') ?? undefined,
            url.searchParams.get('goalId') ?? undefined,
          ),
        );
      }
      if (!['POST', 'PATCH'].includes(request.method))
        return json({ error: 'Method not allowed.' }, 405);
      if (url.search) throw new InvalidRequest();
      security.assertUnsafe(request);
      const body = await security.readJson(request);
      const expectedAccount = request.headers.get('x-life-os-account') ?? undefined;
      if (resource === 'visions' && parts.length === 1 && request.method === 'POST')
        return json({ item: await service.vision(token, body, expectedAccount) }, 201);
      if (resource === 'categories' && parts.length === 1 && request.method === 'POST')
        return json({ item: await service.category(token, body, expectedAccount) }, 201);
      if (
        resource === 'seasons' &&
        id &&
        action === 'activate' &&
        parts.length === 3 &&
        request.method === 'POST'
      )
        return json({ item: await service.activate(token, id, body, expectedAccount) });
      if (resource && parts.length === 1 && request.method === 'POST')
        return json(
          { item: await service.save(token, resource, body, undefined, expectedAccount) },
          201,
        );
      if (resource && id && parts.length === 2 && request.method === 'PATCH')
        return json({ item: await service.save(token, resource, body, id, expectedAccount) });
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return failure(error);
    }
  };
}
