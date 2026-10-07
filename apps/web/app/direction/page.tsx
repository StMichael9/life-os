import { Direction } from '@life-os/app';
import type { DirectionResource } from '@life-os/shared';
export default async function DirectionPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; id?: string }>;
}) {
  const { view, id } = await searchParams;
  const resource: DirectionResource =
    view === 'goals' || view === 'milestones' || view === 'projects' ? view : 'seasons';
  return <Direction initialResource={resource} initialId={id} />;
}
