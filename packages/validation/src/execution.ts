import { z } from 'zod';
const id = z.uuid();
const version = z.number().int().min(0).max(2_000_000_000);
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Choose a real calendar date.');
const short = z.string().trim().min(1).max(500);
const note = z.string().trim().max(2000);
const link = id.nullable();
const instant = z.iso.datetime({ offset: true });
const reflection = z
  .object({
    gratitude: note,
    success: note,
    mind: note,
    accomplished: note,
    wasted: note,
    learned: note,
    prayer: note,
    tomorrow: note,
  })
  .strict();
export const vaultKind = z.enum([
  'idea',
  'someday',
  'not_now',
  'research',
  'career',
  'business',
  'personal',
  'scripture',
  'thought',
]);
const workFields = {
  title: short,
  kind: z.enum(['task', 'focus', 'routine', 'meeting', 'training', 'custom']),
  taskId: link,
  projectId: link.default(null),
  categoryId: link.default(null),
  objective: z.string().trim().max(500).default(''),
};
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length);
export const executionCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('vault-promote'),
      requestId: id,
      id,
      version,
      target: z.enum(['goal', 'project']),
      targetId: id,
    })
    .strict(),
  z
    .object({
      action: z.literal('plan'),
      requestId: id,
      date: calendarDate,
      version,
      oneThing: short.nullable(),
      outcomes: z
        .array(z.object({ outcome: short, taskId: link, completed: z.boolean() }).strict())
        .max(3),
      workflow: z.enum(['save', 'start', 'close', 'reopen']),
      reflection,
    })
    .strict()
    .refine(
      (c) =>
        new Set(c.outcomes.flatMap((x) => (x.taskId ? [x.taskId] : []))).size ===
        c.outcomes.filter((x) => x.taskId).length,
      'Link each Task at most once.',
    ),
  z
    .object({
      action: z.literal('schedule'),
      requestId: id,
      id,
      version,
      ...workFields,
      startsAt: instant,
      endsAt: instant,
      remove: z.boolean(),
    })
    .strict()
    .refine((c) => !(c.taskId && c.projectId), 'Choose a Task or Project.')
    .refine(
      (c) =>
        Date.parse(c.endsAt) > Date.parse(c.startsAt) &&
        Date.parse(c.endsAt) - Date.parse(c.startsAt) <= 86400000,
      'Blocks must last between a second and 24 hours.',
    ),
  z
    .object({
      action: z.literal('schedule-series'),
      requestId: id,
      id,
      version,
      ...workFields,
      startsOn: calendarDate,
      endsOn: calendarDate,
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      days: weekdays,
    })
    .strict()
    .refine((c) => !(c.taskId && c.projectId), 'Choose a Task or Project.')
    .refine((c) => c.endTime > c.startTime, 'Repeated blocks must end later on the same day.')
    .refine(
      (c) =>
        c.endsOn >= c.startsOn && Date.parse(c.endsOn) - Date.parse(c.startsOn) <= 365 * 86400000,
      'Choose a repeat range of at most one year.',
    ),
  z
    .object({
      action: z.literal('focus-start'),
      requestId: id,
      id,
      objective: short,
      taskId: link,
      projectId: link,
      categoryId: link,
      plannedMinutes: z.number().int().min(1).max(720),
      notes: note.default(''),
    })
    .strict()
    .refine((c) => !(c.taskId && c.projectId), 'Choose a Task or Project.'),
  z.object({ action: z.literal('focus-notes'), requestId: id, id, version, notes: note }).strict(),
  z
    .object({
      action: z.literal('focus-control'),
      requestId: id,
      id,
      version,
      operation: z.enum(['pause', 'resume', 'finish']),
      completeTask: z.boolean().default(false),
      outcome: note,
      notes: note,
    })
    .strict()
    .refine(
      (c) => !c.completeTask || c.operation === 'finish',
      'Complete linked work only when finishing.',
    ),
  z
    .object({
      action: z.literal('routine'),
      requestId: id,
      id,
      version,
      title: short,
      notes: note,
      days: z
        .array(z.number().int().min(0).max(6))
        .min(1)
        .max(7)
        .refine((d) => new Set(d).size === d.length),
      spiritual: z.boolean(),
      archived: z.boolean(),
    })
    .strict(),
  z
    .object({
      action: z.literal('routine-check'),
      requestId: id,
      id,
      date: calendarDate,
      completed: z.boolean(),
      notes: note,
    })
    .strict(),
  z
    .object({
      action: z.literal('vault'),
      requestId: id,
      id,
      version,
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(10000),
      kind: vaultKind,
      archived: z.boolean(),
      sourceInboxId: link,
    })
    .strict(),
  z.object({ action: z.literal('vault-task'), requestId: id, id, version, taskId: id }).strict(),
  z.object({ action: z.literal('inbox-dismiss'), requestId: id, id }).strict(),
]);
export type ExecutionCommand = z.infer<typeof executionCommandSchema>;
export const executionQuerySchema = z
  .object({
    date: calendarDate.optional(),
    focusId: id.optional(),
    calendarDays: z.coerce
      .number()
      .pipe(z.union([z.literal(1), z.literal(7)]))
      .default(1),
    availableMinutes: z.coerce.number().int().min(1).max(720).default(90),
    energy: z.enum(['low', 'medium', 'high']).default('medium'),
  })
  .strict();
export const searchQuerySchema = z.object({ q: z.string().trim().min(1).max(100) }).strict();
export const vaultQuerySchema = z
  .object({
    before: id.optional(),
    kind: vaultKind.optional(),
    archived: z.enum(['true', 'false']).default('false'),
  })
  .strict();

export const focusQuerySchema = z.object({ before: id.optional() }).strict();
