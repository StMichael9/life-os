import { z } from 'zod';
import type { ExecutionRepository } from '@life-os/database';
import {
  executionCommandSchema,
  executionQuerySchema,
  searchQuerySchema,
  vaultQuerySchema,
} from '@life-os/validation';
import { rankActions, dailyInsights } from '@life-os/insights';
import { AuthenticationRequired, type SessionVerifier } from './index';
import type { createHttpSecurity } from './http-security';
import { InvalidRequest } from './http-security';
import { json, failure } from './http';
export function createExecutionService(sessions: SessionVerifier, repo: ExecutionRepository) {
  async function owner(token: string | undefined, expected?: string) {
    const principal = token ? await sessions.verify(token) : null;
    if (!principal || (expected !== undefined && expected !== principal.userId))
      throw new AuthenticationRequired();
    return principal.userId;
  }
  return {
    async today(token: string | undefined, input: unknown) {
      const userId = await owner(token),
        q = executionQuerySchema.parse(input),
        data = await repo.today(userId, q.date);
      const recommendations = rankActions(
        data.tasks
          .filter((t) => t.estimateMinutes !== null)
          .map((t) => {
            const category = data.categories.find((c) => c.id === data.rankingCategories[t.id]);
            const allocation =
              data.activeSeason?.allocations.find(
                (a) => a.categoryId === data.rankingCategories[t.id],
              )?.percent ?? 0;
            return {
              id: t.id,
              impact: t.impact,
              urgency: t.urgency,
              opportunity: t.opportunity,
              goalAlignment: t.goalAlignment,
              seasonAllocation: allocation,
              estimateMinutes: t.estimateMinutes!,
              energy: t.energy,
              ...(t.dueAt ? { dueAt: t.dueAt } : {}),
              category: category?.name.toLowerCase() ?? 'uncategorized',
              spiritual: category?.spiritual ?? false,
              status: t.status,
            };
          }),
        { now: new Date(data.serverNow), availableMinutes: q.availableMinutes, energy: q.energy },
      ).slice(0, 5);
      const outstanding = data.plan?.outcomes.filter((x) => !x.completedAt).length ?? 0;
      const insights = dailyInsights({
        scheduledMinutes: data.snapshot.scheduledMinutes,
        outstandingOutcomes: outstanding,
        inboxCount: data.snapshot.inboxCount,
        routineScheduled: data.routines.filter((r) => r.scheduled && !r.spiritual).length,
        routineCompleted: data.routines.filter((r) => r.scheduled && !r.spiritual && r.completed)
          .length,
      });
      return { ...data, recommendations, insights };
    },
    async mutate(token: string | undefined, input: unknown, expected?: string) {
      return repo.mutate(await owner(token, expected), executionCommandSchema.parse(input));
    },
    async vaultDetail(token: string | undefined, id: unknown) {
      const userId = await owner(token);
      return { item: await repo.vaultDetail(userId, z.uuid().parse(id)), ownerId: userId };
    },
    async vault(token: string | undefined, input: unknown) {
      const userId = await owner(token),
        q = vaultQuerySchema.parse(input);
      return {
        ...(await repo.vault(userId, q.before, q.kind, q.archived === 'true')),
        ownerId: userId,
      };
    },
    async search(token: string | undefined, input: unknown) {
      const userId = await owner(token),
        q = searchQuerySchema.parse(input);
      return { items: await repo.search(userId, q.q), ownerId: userId };
    },
  };
}
export function createExecutionHttp(
  service: ReturnType<typeof createExecutionService>,
  security: ReturnType<typeof createHttpSecurity>,
) {
  return async (request: Request, parts: string[] = []) => {
    try {
      const token = security.sessionToken(request),
        url = new URL(request.url);
      for (const key of url.searchParams.keys())
        if (url.searchParams.getAll(key).length !== 1) throw new InvalidRequest();
      const query = Object.fromEntries(url.searchParams);
      if (request.method === 'GET' && parts.length === 2 && parts[0] === 'vault' && !url.search)
        return json(await service.vaultDetail(token, parts[1]));
      if (request.method === 'GET' && parts.length === 1) {
        if (parts[0] === 'today') return json(await service.today(token, query));
        if (parts[0] === 'vault') return json(await service.vault(token, query));
        if (parts[0] === 'search') return json(await service.search(token, query));
      }
      if (request.method === 'POST' && parts.length === 0 && !url.search) {
        security.assertUnsafe(request);
        return json(
          await service.mutate(
            token,
            await security.readJson(request),
            request.headers.get('x-life-os-account') ?? undefined,
          ),
        );
      }
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return failure(error);
    }
  };
}
