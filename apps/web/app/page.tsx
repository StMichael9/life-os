import { headers } from 'next/headers';
import { Today, Execution } from '@life-os/app';
import type { Season } from '@life-os/shared';
import { getHandlers } from '../lib/services';
async function seasonProps(
  cookie: string,
): Promise<{ initialSeason?: Season | null; accountId?: string; seasonUnavailable?: boolean }> {
  const hasSession = cookie
    .split(';')
    .some((part) => /^\s*(?:__Host-life_os_session|life_os_dev_session)=/.test(part));
  if (!hasSession) return {};
  try {
    const origin = process.env.APP_ORIGIN;
    if (!origin) return { seasonUnavailable: true };
    const response = await getHandlers().direction(
      new Request(`${origin}/api/direction/active-season`, { headers: { Cookie: cookie } }),
      ['active-season'],
    );
    if (!response.ok) return { seasonUnavailable: response.status !== 401 };
    const data = (await response.json()) as { activeSeason: Season | null; ownerId: string };
    return { initialSeason: data.activeSeason, accountId: data.ownerId };
  } catch {
    return { seasonUnavailable: true };
  }
}
export default async function HomePage() {
  // Anonymous previews never contact private repositories. Verification stays server-side.
  const props = await seasonProps((await headers()).get('cookie') ?? '');
  return props.accountId ? <Execution /> : <Today {...props} />;
}
