import { z } from 'zod';

export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid IANA timezone');

export const inboxCaptureSchema = z
  .object({
    body: z.string().trim().min(1, 'Capture a thought first').max(10_000),
  })
  .strict();

export const dailyPlanSchema = z
  .object({
    oneThing: z.string().trim().min(1).max(500),
    outcomes: z.array(z.string().trim().min(1).max(500)).max(3),
  })
  .strict();

export const priorityInputSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  spiritual: z.boolean(),
  status: z.enum(['inbox', 'planned', 'in_progress', 'completed', 'deferred', 'cancelled']),
  impact: z.number().int().min(0).max(5),
  urgency: z.number().int().min(0).max(5),
  opportunity: z.number().int().min(0).max(5),
  goalAlignment: z.number().int().min(0).max(5),
  seasonAllocation: z.number().min(0).max(100),
  estimateMinutes: z.number().int().min(1).max(1440),
  energy: z.enum(['low', 'medium', 'high']),
  dueAt: z.iso.datetime({ offset: true }).optional(),
});
export type PriorityInput = z.infer<typeof priorityInputSchema>;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(12).max(128);
export const accountCreationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(100),
    timeZone: timeZoneSchema.default('UTC'),
  })
  .strict();
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();
export const captureRequestSchema = inboxCaptureSchema.extend({ requestId: z.uuid() }).strict();
export const inboxCursorSchema = z
  .object({
    createdAt: z.iso.datetime(),
    id: z.uuid(),
  })
  .strict();
export type InboxCursor = z.infer<typeof inboxCursorSchema>;

// Direction commands replace a complete record; version 0 creates, positive versions edit.
export const directionStatusSchema = z.enum(['planned', 'active', 'completed', 'archived']);
const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableId = z.uuid().nullable();
const calendarDate = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid calendar date');
const recordCommand = { id: z.uuid(), version: z.number().int().min(0).max(2_000_000_000) };
export const seasonCommandSchema = z
  .object({
    ...recordCommand,
    name: z.string().trim().min(1).max(120),
    description: nullableText(2000),
    objective: z.string().trim().min(1).max(500),
    successCriteria: nullableText(2000),
    startsOn: calendarDate,
    endsOn: calendarDate,
    status: directionStatusSchema,
    allocations: z
      .array(z.object({ categoryId: z.uuid(), percent: z.number().int().min(0).max(100) }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.endsOn < data.startsOn)
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'End date must follow the start date.',
      });
    if (new Set(data.allocations.map((a) => a.categoryId)).size !== data.allocations.length)
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Choose each category once.',
      });
    if (data.allocations.reduce((sum, a) => sum + a.percent, 0) !== 100)
      ctx.addIssue({
        code: 'custom',
        path: ['allocations'],
        message: 'Allocate exactly 100% across your categories.',
      });
  });
const measurement = z
  .string()
  .regex(/^-?\d{1,14}(\.\d{1,4})?$/, 'Use a decimal with up to four places.')
  .nullable();
export const goalCommandSchema = z
  .object({
    ...recordCommand,
    title: z.string().trim().min(1).max(200),
    description: nullableText(2000),
    notes: nullableText(4000),
    categoryId: nullableId,
    visionId: nullableId,
    targetDate: calendarDate.nullable(),
    status: directionStatusSchema,
    priority: z.number().int().min(1).max(5),
    targetValue: measurement,
    currentValue: measurement,
    unit: z.string().trim().min(1).max(60).nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const present = [data.targetValue, data.currentValue, data.unit].filter(
      (v) => v !== null,
    ).length;
    if (present !== 0 && present !== 3)
      ctx.addIssue({
        code: 'custom',
        path: ['targetValue'],
        message: 'Set target, current value and unit together, or leave all three empty.',
      });
  });
export const milestoneCommandSchema = z
  .object({
    ...recordCommand,
    goalId: z.uuid(),
    title: z.string().trim().min(1).max(200),
    targetDate: calendarDate.nullable(),
    completed: z.boolean(),
  })
  .strict();
export const projectCommandSchema = z
  .object({
    ...recordCommand,
    title: z.string().trim().min(1).max(200),
    description: nullableText(2000),
    notes: nullableText(4000),
    categoryId: nullableId,
    goalId: nullableId,
    milestoneId: nullableId,
    status: directionStatusSchema,
    startsOn: calendarDate.nullable(),
    targetDate: calendarDate.nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.goalId && data.milestoneId)
      ctx.addIssue({
        code: 'custom',
        path: ['milestoneId'],
        message: 'Choose a Goal or a Milestone, not both.',
      });
    if (data.startsOn && data.targetDate && data.targetDate < data.startsOn)
      ctx.addIssue({
        code: 'custom',
        path: ['targetDate'],
        message: 'Target date must follow the start date.',
      });
  });
export const categoryCommandSchema = z
  .object({ id: z.uuid(), name: z.string().trim().min(1).max(100), spiritual: z.boolean() })
  .strict();
export const activationSchema = z
  .object({ version: z.number().int().min(1).max(2_000_000_000) })
  .strict();
export type SeasonCommand = z.infer<typeof seasonCommandSchema>;
export type GoalCommand = z.infer<typeof goalCommandSchema>;
export type MilestoneCommand = z.infer<typeof milestoneCommandSchema>;
export type ProjectCommand = z.infer<typeof projectCommandSchema>;
export type CategoryCommand = z.infer<typeof categoryCommandSchema>;

export const taskStatusSchema = z.enum([
  'inbox',
  'planned',
  'in_progress',
  'completed',
  'deferred',
  'cancelled',
]);
const rating = z.number().int().min(0).max(5);
export const taskCommandSchema = z
  .object({
    ...recordCommand,
    title: z.string().trim().min(1).max(200),
    description: nullableText(10_000),
    notes: nullableText(4000),
    projectId: nullableId,
    goalId: nullableId,
    categoryId: nullableId,
    priority: z.number().int().min(1).max(5),
    status: taskStatusSchema,
    dueAt: z.iso
      .datetime({ offset: true })
      .refine((value) => Number.isFinite(Date.parse(value)), 'Choose a valid due time.')
      .nullable(),
    estimateMinutes: z.number().int().min(1).max(1440).nullable(),
    actualMinutes: z.number().int().min(0).max(1_000_000).nullable(),
    impact: rating,
    urgency: rating,
    opportunity: rating,
    goalAlignment: rating,
    energy: z.enum(['low', 'medium', 'high']),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.goalId && data.projectId)
      ctx.addIssue({
        code: 'custom',
        path: ['projectId'],
        message: 'Choose a Goal or a Project, not both.',
      });
  });
export type TaskCommand = z.infer<typeof taskCommandSchema>;
