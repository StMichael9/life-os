import { it, expect } from 'vitest';
import { dailyInsights } from './index';
it('produces explanations from real evidence and no invented trend on an empty day', () => {
  expect(
    dailyInsights({
      scheduledMinutes: 0,
      outstandingOutcomes: 0,
      inboxCount: 0,
      routineScheduled: 0,
      routineCompleted: 0,
    }),
  ).toEqual([]);
  const rules = dailyInsights({
    scheduledMinutes: 510,
    outstandingOutcomes: 2,
    inboxCount: 10,
    routineScheduled: 2,
    routineCompleted: 0,
  });
  expect(rules).toHaveLength(4);
  expect(rules.every((r) => r.explanation && r.action)).toBe(true);
  expect(rules[3]?.explanation).toContain('Reflective practices are excluded');
  expect(() =>
    dailyInsights({
      scheduledMinutes: NaN,
      outstandingOutcomes: 0,
      inboxCount: 0,
      routineScheduled: 0,
      routineCompleted: 0,
    }),
  ).toThrow();
});
