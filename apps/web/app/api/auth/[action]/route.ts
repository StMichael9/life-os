import { getHandlers, unavailable } from '../../../../lib/services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  try {
    return await getHandlers().auth(request, action);
  } catch {
    return unavailable();
  }
}
export { handle as GET, handle as POST };
