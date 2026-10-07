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
