import { Tasks } from '@life-os/app';
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; fromInbox?: string; goalId?: string; projectId?: string }>;
}) {
  const { id, fromInbox, goalId, projectId } = await searchParams;
  return (
    <Tasks
      initialId={id}
      fromInbox={fromInbox}
      initialGoalId={goalId}
      initialProjectId={projectId}
    />
  );
}
