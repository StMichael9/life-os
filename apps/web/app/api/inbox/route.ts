import { getHandlers, unavailable } from '../../../lib/services';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  try {
    return await getHandlers().inbox(request);
  } catch {
    return unavailable();
  }
}
export { handle as GET, handle as POST };
