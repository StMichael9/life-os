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
}
export interface FocusSession {
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
  focus: FocusSession | null;
  focusHistory: FocusSession[];
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
export function elapsedFocus(session: FocusSession, now: Date) {
  return (
    session.activeSeconds +
    (session.resumedAt && !session.endedAt
      ? Math.max(0, Math.floor((now.getTime() - Date.parse(session.resumedAt)) / 1000))
      : 0)
  );
}
