import type { Ancestor, DirectionBase } from './direction';
export type TaskStatus =
  'inbox' | 'planned' | 'in_progress' | 'completed' | 'deferred' | 'cancelled';
export interface Task extends DirectionBase {
  title: string;
  description: string | null;
  notes: string | null;
  projectId: string | null;
  goalId: string | null;
  categoryId: string | null;
  priority: number;
  status: TaskStatus;
  dueAt: string | null;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  impact: number;
  urgency: number;
  opportunity: number;
  goalAlignment: number;
  energy: 'low' | 'medium' | 'high';
  completedAt: string | null;
  sourceInboxId: string | null;
}
export interface TaskDetail {
  item: Task;
  ancestors: (Ancestor | { kind: 'project'; id: string; title: string })[];
}
export const taskStatusLabels: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  deferred: 'Deferred',
  cancelled: 'Cancelled',
};
export function wallTime(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}T${value('hour')}:${value('minute')}:${value('second')}`;
}
/** Resolve an explicit local due time; never silently shift a skipped/repeated DST time. */
export function dueInstant(local: string, timeZone: string): string {
  const normalized = local.length === 16 ? `${local}:00` : local;
  const naive = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== normalized)
    throw new Error('Choose a valid due date and time.');
  const candidates = new Set<string>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = naive + hours * 3_600_000;
    const offset = Date.parse(`${wallTime(new Date(sample).toISOString(), timeZone)}Z`) - sample;
    const candidate = new Date(naive - offset).toISOString();
    if (wallTime(candidate, timeZone) === normalized) candidates.add(candidate);
  }
  if (candidates.size !== 1)
    throw new Error(
      candidates.size
        ? 'This time repeats when the clocks change. Choose a time outside the repeated hour.'
        : 'This time does not exist when the clocks change. Choose another time.',
    );
  return [...candidates][0]!;
}
