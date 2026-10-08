import { getHandlers, unavailable } from '../../../../lib/services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ parts?: string[] }> }) {
  const { parts } = await context.params;
  try {
    return await getHandlers().tasks(request, parts);
  } catch {
    return unavailable();
  }
}
export { handle as GET, handle as POST, handle as PATCH };
