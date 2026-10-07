import { expect, it } from 'vitest';
import { dailyPlanSchema, inboxCaptureSchema, timeZoneSchema } from './index';

it('enforces deliberate daily limits', () => {
  expect(
    dailyPlanSchema.safeParse({ oneThing: 'Outcome', outcomes: ['1', '2', '3', '4'] }).success,
  ).toBe(false);
  expect(dailyPlanSchema.safeParse({ oneThing: ' ', outcomes: [] }).success).toBe(false);
});
it('rejects client ownership fields and empty captures', () => {
  expect(inboxCaptureSchema.safeParse({ body: 'idea', userId: 'other-user' }).success).toBe(false);
  expect(inboxCaptureSchema.safeParse({ body: ' ' }).success).toBe(false);
  expect(inboxCaptureSchema.parse({ body: ' An idea ' }).body).toBe('An idea');
});
it('validates configured timezone', () => {
  expect(timeZoneSchema.safeParse('America/Los_Angeles').success).toBe(true);
  expect(timeZoneSchema.safeParse('Not/AZone').success).toBe(false);
});
