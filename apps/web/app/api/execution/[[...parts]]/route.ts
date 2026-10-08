import { getHandlers, unavailable } from '../../../../lib/services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request, context: { params: Promise<{ parts?: string[] }> }) {
  try {
    return await getHandlers().execution(request, (await context.params).parts ?? []);
  } catch {
    return unavailable();
  }
}
export { handle as GET, handle as POST };
