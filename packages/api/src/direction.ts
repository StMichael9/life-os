import { z } from 'zod';
import type { DirectionRepository } from '@life-os/database';
import {
  seasonCommandSchema,
  goalCommandSchema,
  milestoneCommandSchema,
  projectCommandSchema,
  categoryCommandSchema,
  activationSchema,
  visionCommandSchema,
} from '@life-os/validation';
import { AuthenticationRequired, type SessionVerifier } from './index';
const resourceSchema = z.enum(['seasons', 'goals', 'milestones', 'projects']);
const idSchema = z.uuid();
export function createDirectionService(sessions: SessionVerifier, repo: DirectionRepository) {
  async function owner(token: string | undefined, expectedAccount?: string) {
    const principal = token ? await sessions.verify(token) : null;
    if (!principal) throw new AuthenticationRequired();
    if (expectedAccount !== undefined && expectedAccount !== principal.userId)
      throw new AuthenticationRequired();
    return principal.userId;
  }
  return {
    async activeSeason(token: string | undefined) {
      const userId = await owner(token);
      return { activeSeason: await repo.activeSeason(userId), ownerId: userId };
    },
    async meta(token: string | undefined) {
      const userId = await owner(token);
      return { ...(await repo.meta(userId)), ownerId: userId };
    },
    async vision(token: string | undefined, input: unknown, expectedAccount?: string) {
      return repo.vision(await owner(token, expectedAccount), visionCommandSchema.parse(input));
    },
    async category(token: string | undefined, input: unknown, expectedAccount?: string) {
      return repo.category(await owner(token, expectedAccount), categoryCommandSchema.parse(input));
    },
    async list(token: string | undefined, resource: unknown, before?: unknown, goalId?: unknown) {
      const userId = await owner(token);
      const kind = resourceSchema.parse(resource);
      const parent = goalId === undefined ? undefined : idSchema.parse(goalId);
      if (parent && kind !== 'milestones')
        throw new z.ZodError([
          { code: 'custom', path: ['goalId'], message: 'Goal filter only applies to milestones.' },
        ]);
      return {
        ...(await repo.list(
          userId,
          kind,
          before === undefined ? undefined : idSchema.parse(before),
          parent,
        )),
        ownerId: userId,
      };
    },
    async detail(token: string | undefined, resource: unknown, id: unknown) {
      const userId = await owner(token);
      return {
        ...(await repo.detail(userId, resourceSchema.parse(resource), idSchema.parse(id))),
        ownerId: userId,
      };
    },
    async save(
      token: string | undefined,
      resource: unknown,
      input: unknown,
      editId?: unknown,
      expectedAccount?: string,
    ) {
      const userId = await owner(token, expectedAccount);
      const kind = resourceSchema.parse(resource);
      const parsed = {
        seasons: seasonCommandSchema,
        goals: goalCommandSchema,
        milestones: milestoneCommandSchema,
        projects: projectCommandSchema,
      }[kind].parse(input);
      if (
        editId === undefined
          ? parsed.version !== 0
          : parsed.id !== idSchema.parse(editId) || parsed.version < 1
      )
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['version'],
            message: 'Create with version 0; edit the matching ID with its current version.',
          },
        ]);
      switch (kind) {
        case 'seasons':
          return repo.saveSeason(userId, seasonCommandSchema.parse(input));
        case 'goals':
          return repo.saveGoal(userId, goalCommandSchema.parse(input));
        case 'milestones':
          return repo.saveMilestone(userId, milestoneCommandSchema.parse(input));
        case 'projects':
          return repo.saveProject(userId, projectCommandSchema.parse(input));
      }
    },
    async activate(
      token: string | undefined,
      id: unknown,
      input: unknown,
      expectedAccount?: string,
    ) {
      return repo.activate(
        await owner(token, expectedAccount),
        idSchema.parse(id),
        activationSchema.parse(input).version,
      );
    },
  };
}
