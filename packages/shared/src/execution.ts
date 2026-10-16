import type { Season, Task } from './index';
export interface Reflection {
  gratitude: string;
  success: string;
  mind: string;
  accomplished: string;
  wasted: string;
  learned: string;
  prayer: string;
  tomorrow: string;
}
export const emptyReflection: Reflection = {
  gratitude: '',
  success: '',
  mind: '',
  accomplished: '',
  wasted: '',
  learned: '',
  prayer: '',
  tomorrow: '',
};
export interface DailyPlan {
  id: string;
  version: number;
  localDate: string;
  timeZone: string;
  oneThing: string | null;
  startedAt: string | null;
  closedAt: string | null;
  morning: Reflection;
  evening: Reflection;
  outcomes: { outcome: string; taskId: string | null; completedAt: string | null }[];
}
export interface ScheduleBlock {
  id: string;
  version: number;
  title: string;
  kind: string;
  taskId: string | null;
  startsAt: string;
  endsAt: string;
  projectId: string | null;
  categoryId: string | null;
  objective: string;
  seriesId: string | null;
  occurrenceDate: string | null;
  overridden: boolean;
  skipped: boolean;
}
export interface ScheduleSeries {
  id: string;
  version: number;
  title: string;
  kind: string;
  taskId: string | null;
  projectId: string | null;
  categoryId: string | null;
  objective: string;
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
  days: number[];
  timeZone: string;
}
export interface FocusSession {
  scheduleBlockId?: string | null;
  timerMode?: 'countdown' | 'stopwatch';
  activeMilliseconds?: number;
  discardedAt?: string | null;
  confirmedAt?: string | null;
  id: string;
  version: number;
  objective: string;
  taskId: string | null;
  projectId: string | null;
  categoryId: string | null;
  startedAt: string;
  endedAt: string | null;
  resumedAt: string | null;
  plannedMinutes: number;
  activeSeconds: number;
  outcome: string | null;
  notes: string | null;
}
export interface Routine {
  id: string;
  version: number;
  title: string;
  notes: string | null;
  days: number[];
  spiritual: boolean;
  archived: boolean;
  scheduled: boolean;
  completed: boolean;
  completionNotes: string | null;
}
export interface VaultItem {
  id: string;
  version: number;
  title: string;
  body: string;
  kind: string;
  archived: boolean;
  sourceInboxId: string | null;
  convertedTaskId: string | null;
  convertedGoalId: string | null;
  convertedProjectId: string | null;
  createdAt: string;
}
export interface SearchHit {
  id: string;
  title: string;
  area: string;
  href: string;
}
export interface ExecutionSnapshot {
  ownerId: string;
  timeZone: string;
  date: string;
  serverNow: string;
  content: ReturnType<typeof import('./daily').dailyContent>;
  plan: DailyPlan | null;
  activeSeason: Season | null;
  schedule: ScheduleBlock[];
  scheduleSeries: ScheduleSeries[];
  calendarDays: number;
  focus: FocusSession | null;
  focusSessions: FocusSession[];
  focusNext: string | null;
  focusHistory: FocusSession[];
  workTime: WorkTimeSnapshot;
  routines: Routine[];
  tasks: Task[];
  rankingCategories: Record<string, string | null>;
  projects: { id: string; title: string }[];
  categories: { id: string; name: string; spiritual: boolean }[];
  snapshot: {
    completedTasks: number;
    focusSeconds: number;
    scheduledMinutes: number;
    inboxCount: number;
  };
  recommendations: { id: string; score: number; reasons: string[]; algorithmVersion: number }[];
  insights: { title: string; explanation: string; action: string; severity: string }[];
  limits: { tasks: boolean; schedule: boolean; routines: boolean };
}
export function elapsedFocusMilliseconds(session: FocusSession, now: Date) {
  return (
    Math.max(session.activeMilliseconds ?? 0, session.activeSeconds * 1000) +
    (session.resumedAt && !session.endedAt
      ? Math.max(0, now.getTime() - Date.parse(session.resumedAt))
      : 0)
  );
}
export function elapsedFocus(session: FocusSession, now: Date) {
  return Math.floor(elapsedFocusMilliseconds(session, now) / 1000);
}
export function workDuration(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
export function stopwatchTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
export interface WorkDay {
  date: string;
  seconds: number;
}
export interface WorkTimeSnapshot {
  targetMinutes: number;
  targetVersion: number;
  date: string;
  dayStart: string;
  dayEnd: string;
  seconds: number;
  days: WorkDay[];
  activities: {
    key: string;
    objective: string;
    category: string;
    seconds: number;
    running: boolean;
    paused: boolean;
  }[];
  categories: { name: string; seconds: number }[];
  history: FocusSession[];
  historyLimited: boolean;
}
export interface WorkSessionDetail {
  session: FocusSession;
  intervals: { id: string; startsAt: string; endsAt: string | null; excluded: boolean }[];
  next: string | null;
  changes: {
    id: string;
    kind: string;
    reason: string;
    before: string;
    after: string;
    createdAt: string;
  }[];
  changesLimited: boolean;
  ownerId: string;
}
