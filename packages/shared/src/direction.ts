export type DirectionStatus = 'planned' | 'active' | 'completed' | 'archived';
export type DirectionResource = 'seasons' | 'goals' | 'milestones' | 'projects';
export interface DirectionBase {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface Category {
  id: string;
  name: string;
  spiritual: boolean;
}
export interface Vision {
  id: string;
  title: string;
}
export interface Allocation {
  categoryId: string;
  percent: number;
  name: string;
}
export interface Season extends DirectionBase {
  name: string;
  description: string | null;
  objective: string;
  successCriteria: string | null;
  startsOn: string;
  endsOn: string;
  status: DirectionStatus;
  allocations: Allocation[];
}
export interface Goal extends DirectionBase {
  title: string;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  visionId: string | null;
  targetDate: string | null;
  status: DirectionStatus;
  priority: number;
  targetValue: string | null;
  currentValue: string | null;
  unit: string | null;
}
export interface Milestone extends DirectionBase {
  title: string;
  goalId: string;
  targetDate: string | null;
  completedAt: string | null;
}
export interface Project extends DirectionBase {
  title: string;
  description: string | null;
  notes: string | null;
  categoryId: string | null;
  goalId: string | null;
  milestoneId: string | null;
  status: DirectionStatus;
  startsOn: string | null;
  targetDate: string | null;
}
export interface DirectionEntities {
  seasons: Season;
  goals: Goal;
  milestones: Milestone;
  projects: Project;
}
export interface DirectionPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface Ancestor {
  kind: 'vision' | 'goal' | 'milestone';
  id: string;
  title: string;
}
export interface DirectionMeta {
  categories: Category[];
  visions: Vision[];
  activeSeason: Season | null;
}
// Exact decimal equivalence without binary floating-point rounding.
export function canonicalDecimal(value: string | null): string | null {
  if (value === null) return null;
  const result = value
    .replace(/^(-?)0+(?=\d)/, '$1')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return /^-?0$/.test(result) ? '0' : result;
}
