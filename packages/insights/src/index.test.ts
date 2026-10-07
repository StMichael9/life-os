import { describe, expect, it } from 'vitest';
import type { PriorityInput } from '@life-os/validation';
import { rankActions, RuleBasedProvider } from './index';

const task: PriorityInput = {
  id: 'task-a',
  category: 'algorithms',
  spiritual: false,
  status: 'planned',
  impact: 4,
  urgency: 2,
  opportunity: 3,
  goalAlignment: 5,
  seasonAllocation: 35,
  estimateMinutes: 90,
  energy: 'high',
};
const context = {
  now: new Date('2026-10-06T12:00:00Z'),
  availableMinutes: 90,
  energy: 'high' as const,
};

describe('priority v1', () => {
  it('recommends only available execution work', () => {
    expect(
      rankActions(
        [
          task,
          { ...task, id: 'done', status: 'completed' },
          { ...task, id: 'faith', category: 'faith' },
          { ...task, id: 'prayer', category: 'prayer', spiritual: true },
          { ...task, id: 'later', status: 'deferred' },
          { ...task, id: 'large', estimateMinutes: 120 },
        ],
        context,
      ).map((a) => a.id),
    ).toEqual(['task-a']);
    expect(rankActions([task], { ...context, energy: 'low' })).toEqual([]);
  });
  it('increases priority near a deadline and explains the recommendation', () => {
    const ranked = rankActions(
      [task, { ...task, id: 'urgent', dueAt: '2026-10-06T15:00:00Z' }],
      context,
    );
    expect(ranked[0]!.id).toBe('urgent');
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
    expect(ranked[0]!.reasons).toContain('Deadline is approaching');
  });
  it('breaks ties deterministically regardless of query order', () => {
    expect(
      rankActions(
        [
          { ...task, id: 'b' },
          { ...task, id: 'a' },
        ],
        context,
      ).map((a) => a.id),
    ).toEqual(['a', 'b']);
  });
  it('rejects invalid scores and context', () => {
    expect(() => rankActions([{ ...task, impact: 9 }], context)).toThrow();
    expect(() => rankActions([task], { ...context, availableMinutes: NaN })).toThrow();
  });
});

describe('rule-based insights', () => {
  const provider = new RuleBasedProvider();
  it('uses recorded evidence and never scores spiritual activity', () => {
    const insights = provider.alignment([
      { spiritual: false, category: 'algorithms', targetPercent: 35, actualMinutes: 28 },
      { spiritual: false, category: 'education', targetPercent: 65, actualMinutes: 172 },
      { spiritual: false, category: 'faith', targetPercent: 100, actualMinutes: 2000 },
    ]);
    expect(insights).toHaveLength(1);
    expect(insights[0]!.evidence.actualPercent).toBe(14);
    expect(insights[0]!.evidence.totalMinutes).toBe(200);
  });
  it('avoids claims with too little evidence and rejects corrupt inputs', () => {
    expect(
      provider.alignment([
        { spiritual: false, category: 'algorithms', targetPercent: 100, actualMinutes: 10 },
      ]),
    ).toEqual([]);
    expect(() =>
      provider.alignment([
        { spiritual: false, category: 'bad', targetPercent: 35, actualMinutes: -1 },
      ]),
    ).toThrow();
  });
});
