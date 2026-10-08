import { z } from 'zod';
import type { TaskRepository } from '@life-os/database';
import { taskCommandSchema, taskStatusSchema } from '@life-os/validation';
import { AuthenticationRequired, type SessionVerifier } from './index';
const idSchema = z.uuid();
const querySchema = z
  .object({
    before: idSchema.optional(),
    status: taskStatusSchema.optional(),
    goalId: idSchema.optional(),
    projectId: idSchema.optional(),
  })
  .strict()
  .refine((q) => !(q.goalId && q.projectId), 'Choose one parent filter.');
export function createTaskService(sessions: SessionVerifier, repo: TaskRepository) {
  async function owner(token: string | undefined, expectedAccount?: string) {
    const principal = token ? await sessions.verify(token) : null;
    if (!principal || (expectedAccount !== undefined && expectedAccount !== principal.userId))
      throw new AuthenticationRequired();
    return principal.userId;
  }
  return {
    async capture(token: string | undefined, id: unknown) {
      const userId = await owner(token);
      return { ...(await repo.capture(userId, idSchema.parse(id))), ownerId: userId };
    },
    async list(token: string | undefined, query: unknown = {}) {
      const userId = await owner(token);
      const q = querySchema.parse(query);
      return {
        ...(await repo.list(userId, q.before, q.status, q.goalId, q.projectId)),
        ownerId: userId,
      };
    },
    async detail(token: string | undefined, id: unknown) {
      const userId = await owner(token);
      return { ...(await repo.detail(userId, idSchema.parse(id))), ownerId: userId };
    },
    async save(
      token: string | undefined,
      input: unknown,
      editId?: unknown,
      expectedAccount?: string,
    ) {
      const userId = await owner(token, expectedAccount);
      const command = taskCommandSchema.parse(input);
      if (
        editId === undefined
          ? command.version !== 0
          : command.id !== idSchema.parse(editId) || command.version < 1
      )
        throw new z.ZodError([
          {
            code: 'custom',
            path: ['version'],
            message: 'Create with version 0; edit the matching ID and current version.',
          },
        ]);
      return repo.save(userId, command);
    },
    async convert(
      token: string | undefined,
      id: unknown,
      input: unknown,
      expectedAccount?: string,
    ) {
      const userId = await owner(token, expectedAccount);
      const command = taskCommandSchema.parse(input);
      if (command.version !== 0)
        throw new z.ZodError([
          { code: 'custom', path: ['version'], message: 'Convert with version 0.' },
        ]);
      return repo.convert(userId, idSchema.parse(id), command);
    },
  };
}
