import { Login } from '@life-os/app';
import { getHandlers } from '../../lib/services';
export default async function Page() {
  let setup = false;
  if (process.env.LIFE_OS_DESKTOP_DATA_DIR && process.env.APP_ORIGIN) {
    try {
      const response = await (
        await getHandlers()
      ).auth(new Request(process.env.APP_ORIGIN + '/api/auth/setup'), 'setup');
      if (response.ok) setup = (await response.json()).setup === true;
    } catch {
      /* Initialization failure remains a real sign-in error, not invented state. */
    }
  }
  return <Login setup={setup} />;
}
