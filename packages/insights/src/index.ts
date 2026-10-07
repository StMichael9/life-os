import { priorityInputSchema, type PriorityInput } from '@life-os/validation';

export interface PriorityContext {
  now: Date;
  availableMinutes: number;
  energy: 'low' | 'medium' | 'high';
}

/** A ranking heuristic, not a forecast of life outcomes. No spiritual scoring. */
export function rankActions(inputs: readonly PriorityInput[], context: PriorityContext) {
  if (
    !Number.isFinite(context.now.getTime()) ||
    !Number.isFinite(context.availableMinutes) ||
    context.availableMinutes < 0
  ) {
    throw new RangeError('Invalid priority context');
  }
  const energy = { low: 0, medium: 1, high: 2 };
  return inputs
    .map((input) => priorityInputSchema.parse(input))
    .filter(
      (input) =>
        ['planned', 'in_progress'].includes(input.status) &&
        !input.spiritual &&
        input.category !== 'faith' &&
        input.estimateMinutes <= context.availableMinutes &&
        energy[input.energy] <= energy[context.energy],
    )
    .map((input) => {
      const hoursToDeadline = input.dueAt
        ? (Date.parse(input.dueAt) - context.now.getTime()) / 3_600_000
        : Infinity;
      const deadlineBonus = hoursToDeadline <= 24 ? 15 : hoursToDeadline <= 72 ? 8 : 0;
      const score = Math.round(
        input.impact * 5 +
          input.goalAlignment * 4 +
          input.urgency * 3 +
          input.opportunity * 2 +
          input.seasonAllocation * 0.15 +
          deadlineBonus,
      );
      const reasons = [
        ...(input.impact >= 4 ? ['High expected impact'] : []),
        ...(input.goalAlignment >= 4 ? ['Directly supports a goal'] : []),
        ...(input.seasonAllocation >= 25 ? ['A major allocation in your active Season'] : []),
        ...(deadlineBonus
          ? [hoursToDeadline < 0 ? 'Deadline has passed' : 'Deadline is approaching']
          : []),
        `Fits your ${context.availableMinutes}-minute window and current energy`,
      ];
      return { id: input.id, score, reasons, algorithmVersion: 1 as const };
    })
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface AllocationEvidence {
  category: string;
  spiritual: boolean;
  targetPercent: number;
  actualMinutes: number;
}

export class RuleBasedProvider {
  alignment(allocations: readonly AllocationEvidence[]) {
    if (
      allocations.some(
        (a) =>
          !Number.isFinite(a.actualMinutes) ||
          a.actualMinutes < 0 ||
          !Number.isFinite(a.targetPercent) ||
          a.targetPercent < 0 ||
          a.targetPercent > 100,
      )
    ) {
      throw new RangeError('Invalid allocation evidence');
    }
    const execution = allocations.filter((a) => !a.spiritual && a.category !== 'faith');
    const total = execution.reduce((sum, a) => sum + a.actualMinutes, 0);
    if (total < 120) return []; // Too little recorded work to claim a trend.
    return execution.flatMap((a) => {
      const actualPercent = Math.round((a.actualMinutes / total) * 100);
      if (a.targetPercent - actualPercent < 15) return [];
      return [
        {
          key: `alignment:${a.category}`,
          title: `${a.category} needs protected time`,
          explanation: `${a.category} has ${a.targetPercent}% of your Season allocation and ${actualPercent}% of recorded execution time.`,
          evidence: {
            actualMinutes: a.actualMinutes,
            totalMinutes: total,
            targetPercent: a.targetPercent,
            actualPercent,
          },
          action: 'Consider protecting a focus block, or revise the allocation.',
          severity: 'notice' as const,
          algorithmVersion: 1 as const,
        },
      ];
    });
  }
}
