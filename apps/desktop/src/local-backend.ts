import { utilityProcess, type UtilityProcess } from 'electron';
import { join } from 'node:path';
import { X509Certificate, randomBytes } from 'node:crypto';
import type { LocalIdentity } from './local-identity';
import { localOrigin } from './local-trust';

export async function startLocalBackend(
  resource: string,
  database: string,
  identity: LocalIdentity,
  onCrash: () => void,
) {
  const setupSecret = randomBytes(48).toString('base64url');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
  };
  for (const name of [
    'NODE_OPTIONS',
    'ELECTRON_RUN_AS_NODE',
    'DATABASE_URL',
    'AUTH_SECRET',
    'APP_ORIGIN',
    'VERCEL',
    'VERCEL_TOKEN',
    'NEON_API_KEY',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'AUTH_ALLOW_HTTP_LOOPBACK',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'NODE_USE_ENV_PROXY',
    'NODE_EXTRA_CA_CERTS',
  ])
    delete env[name];
  const child = utilityProcess.fork(join(resource, 'apps/web/desktop-server.mjs'), [], {
    cwd: join(resource, 'apps/web'),
    env,
    execArgv: [],
    stdio: 'ignore',
    serviceName: 'Life OS private backend',
  });
  let stopping = false;
  const exited = new Promise<number>((resolve) =>
    child.once('exit', (code) => {
      resolve(code);
      if (!stopping) onCrash();
    }),
  );
  const fingerprint = new X509Certificate(identity.certificate).fingerprint256;
  try {
    const origin = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The local backend did not become ready.')),
        60000,
      );
      const fail = () => {
        clearTimeout(timer);
        reject(new Error('The local backend could not start. Saved data was preserved.'));
      };
      child.once('exit', fail);
      child.on('message', (value: unknown) => {
        if (!value || typeof value !== 'object' || !('type' in value)) return;
        if (value.type === 'error') {
          return fail();
        }
        if (
          value.type !== 'ready' ||
          !('version' in value) ||
          value.version !== 1 ||
          !('origin' in value) ||
          typeof value.origin !== 'string' ||
          !('certificateFingerprint256' in value) ||
          value.certificateFingerprint256 !== fingerprint
        )
          return;
        try {
          const port = Number(new URL(value.origin).port);
          if (localOrigin(port) !== value.origin || (identity.port !== 0 && identity.port !== port))
            return fail();
          clearTimeout(timer);
          child.removeListener('exit', fail);
          resolve(value.origin);
        } catch {
          fail();
        }
      });
      child.once('spawn', () =>
        child.postMessage({
          type: 'configure',
          version: 1,
          webRoot: join(resource, 'apps/web'),
          dataDirectory: database,
          migrationsDirectory: join(resource, 'packages/database/migrations'),
          authSecret: identity.authSecret,
          setupSecret,
          certificate: identity.certificate,
          privateKey: identity.privateKey,
          port: identity.port,
        }),
      );
    });
    return {
      child,
      origin,
      setupSecret,
      fingerprint,
      stop: async () => {
        if (stopping) return exited;
        stopping = true;
        const acknowledged = new Promise<void>((resolve) =>
          child.on('message', (value) => {
            if (value?.type === 'stopped' && value.version === 1) resolve();
          }),
        );
        if (!child.pid) return exited;
        child.postMessage({ type: 'stop', version: 1 });
        await withTimeout(Promise.all([acknowledged, exited]), 30000);
        return exited;
      },
    };
  } catch (error) {
    stopping = true;
    child.kill();
    await withTimeout(exited, 10000).catch(() => {});
    throw error;
  }
}
function withTimeout<T>(promise: Promise<T>, delay: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Life OS could not finish saving.')), delay);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export type LocalBackend = {
  child: UtilityProcess;
  origin: string;
  setupSecret: string;
  fingerprint: string;
  stop(): Promise<number>;
};
