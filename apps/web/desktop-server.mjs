import { setTimeout, clearTimeout } from 'node:timers';
import { createServer, get } from 'node:https';
import { X509Certificate, createPrivateKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';

// Trusted private backend entry for Electron utilityProcess. No renderer IPC/preload.
// Node fork IPC is supported solely to test this same entry in Cloud/CI.
const parent = process.parentPort;
if (!parent && !process.send) throw new Error('The desktop backend requires its private parent.');
const send = (message) => {
  try {
    if (parent) parent.postMessage(message);
    else if (process.connected) process.send?.(message, () => {});
  } catch {
    /* Parent closure must not interrupt engine shutdown. */
  }
};
const receive = (listener) =>
  parent ? parent.on('message', ({ data }) => listener(data)) : process.on('message', listener);
let configured = false,
  server,
  app,
  stopping,
  starting,
  maintenance,
  accepting = false,
  ready = false,
  activeRequests = 0,
  shutdownStage = 'startup';
const drainWaiters = new Set();

async function stop(exitCode = 0) {
  stopping ??= (async () => {
    accepting = false;
    shutdownStage = 'startup';
    await starting?.catch(() => {});
    accepting = false;
    await maintenance;
    shutdownStage = 'requests';
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    shutdownStage = 'database';
    const close = globalThis[Symbol.for('life-os.desktop.shutdown')];
    if (typeof close === 'function') await close();
    shutdownStage = 'framework';
    await app?.close();
    send({ type: 'stopped', version: 1 });
    process.exit(exitCode);
  })();
  return stopping;
}

async function start(config) {
  if (
    !config ||
    config.type !== 'configure' ||
    config.version !== 1 ||
    !['webRoot', 'dataDirectory', 'migrationsDirectory'].every(
      (key) => typeof config[key] === 'string' && isAbsolute(config[key]),
    ) ||
    typeof config.authSecret !== 'string' ||
    Buffer.byteLength(config.authSecret) < 32 ||
    typeof config.setupSecret !== 'string' ||
    Buffer.byteLength(config.setupSecret) < 32 ||
    typeof config.certificate !== 'string' ||
    typeof config.privateKey !== 'string' ||
    !Number.isInteger(config.port) ||
    (config.port !== 0 && (config.port < 1024 || config.port > 65535))
  )
    throw new Error('Invalid private desktop configuration.');
  const certificate = new X509Certificate(config.certificate);
  if (
    !certificate.checkIP('127.0.0.1') ||
    !certificate.checkPrivateKey(createPrivateKey(config.privateKey)) ||
    Date.parse(certificate.validTo) <= Date.now()
  )
    throw new Error('Invalid local TLS identity.');
  // Hosted/development credentials never leak into or select the offline runtime.
  for (const key of [
    'DATABASE_URL',
    'VERCEL',
    'AUTH_ALLOW_HTTP_LOOPBACK',
    'NEON_API_KEY',
    'VERCEL_TOKEN',
  ])
    delete process.env[key];
  process.env.NODE_ENV = 'production';
  process.env.NEXT_TELEMETRY_DISABLED = '1';
  process.env.LIFE_OS_DESKTOP_DATA_DIR = config.dataDirectory;
  process.env.LIFE_OS_DESKTOP_MIGRATIONS_DIR = config.migrationsDirectory;
  process.env.AUTH_SECRET = config.authSecret;
  process.env.LIFE_OS_DESKTOP_SETUP_SECRET = config.setupSecret;
  const require = createRequire(join(config.webRoot, 'server.js'));
  const nextConfig = JSON.parse(
    await readFile(join(config.webRoot, '.next/required-server-files.json'), 'utf8'),
  ).config;
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
  const next = require('next');
  app = next({ dev: false, dir: config.webRoot, conf: nextConfig });
  await app.prepare();
  const handle = app.getRequestHandler();
  let origin = '';
  server = createServer(
    { key: config.privateKey, cert: config.certificate },
    (request, response) => {
      if (request.headers.host !== new URL(origin).host) {
        response.writeHead(403, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      if (!accepting) {
        response.writeHead(503, { 'Cache-Control': 'no-store', 'Retry-After': '1' });
        response.end();
        return;
      }
      activeRequests++;
      response.once('close', () => {
        activeRequests--;
        if (activeRequests === 0) for (const resolve of drainWaiters) resolve();
      });
      for (const header of [
        'x-forwarded-host',
        'x-forwarded-proto',
        'x-forwarded-port',
        'x-forwarded-for',
      ])
        delete request.headers[header];
      request.headers['x-forwarded-host'] = new URL(origin).host;
      request.headers['x-forwarded-proto'] = 'https';
      void Promise.resolve(handle(request, response)).catch(() => {
        if (!response.headersSent) response.writeHead(503, { 'Cache-Control': 'no-store' });
        response.end();
      });
    },
  );
  server.headersTimeout = 10000;
  server.requestTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '127.0.0.1', resolve);
  });
  origin = 'https://127.0.0.1:' + server.address().port;
  process.env.APP_ORIGIN = origin;
  accepting = true;
  // Initialize migrations/services before main loads the renderer. Trust only this cert.
  await new Promise((resolve, reject) => {
    const request = get(origin + '/api/auth/csrf', { ca: config.certificate }, (response) => {
      response.resume();
      response.on('end', () =>
        response.statusCode === 200 ? resolve() : reject(new Error('Local initialization failed.')),
      );
    });
    request.setTimeout(30000, () => request.destroy(new Error('Local initialization timed out.')));
    request.on('error', reject);
  });
  if (stopping) return;
  ready = true;
  send({
    type: 'ready',
    version: 1,
    origin,
    certificateFingerprint256: certificate.fingerprint256,
  });
}

async function maintain(message) {
  const requestId = message.requestId;
  if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId)) return;
  if (!ready || stopping || maintenance) {
    send({ type: 'operation-error', version: 1, requestId, operation: message.type });
    return;
  }
  accepting = false;
  maintenance = (async () => {
    let key;
    try {
      if (!(message.backupKey instanceof Uint8Array) || message.backupKey.byteLength !== 32)
        throw new Error('Invalid backup key.');
      key = Buffer.from(message.backupKey);
      if (activeRequests > 0)
        await new Promise((resolve, reject) => {
          const done = () => {
            clearTimeout(timer);
            drainWaiters.delete(done);
            resolve();
          };
          const timer = setTimeout(() => {
            drainWaiters.delete(done);
            reject(new Error('Writes are still active.'));
          }, 15000);
          drainWaiters.add(done);
        });
      if (message.type === 'backup') {
        const backup = globalThis[Symbol.for('life-os.desktop.backup')];
        if (typeof backup !== 'function') throw new Error('Local backup unavailable.');
        const archive = await backup(key);
        send({ type: 'backup-ready', version: 1, requestId, archive });
      } else {
        const restore = globalThis[Symbol.for('life-os.desktop.restore')];
        if (
          typeof restore !== 'function' ||
          !(message.archive instanceof Uint8Array) ||
          typeof message.candidateDirectory !== 'string' ||
          !isAbsolute(message.candidateDirectory)
        )
          throw new Error('Invalid candidate restore.');
        await restore(message.archive, key, message.candidateDirectory);
        send({ type: 'restore-ready', version: 1, requestId });
      }
    } catch {
      send({ type: 'operation-error', version: 1, requestId, operation: message.type });
    } finally {
      key?.fill(0);
      if (!stopping) accepting = true;
    }
  })();
  await maintenance;
  maintenance = undefined;
}

receive((message) => {
  if (!configured && !stopping && message?.type === 'configure') {
    configured = true;
    starting = start(message);
    void starting.catch(async () => {
      send({ type: 'error', version: 1, stage: 'startup' });
      // Never print TLS keys, filesystem contents, credentials or raw framework errors.
      try {
        await stop(1);
      } catch {
        process.exit(1);
      }
    });
  } else if (configured && message?.version === 1 && ['backup', 'restore'].includes(message.type)) {
    void maintain(message);
  } else if (message?.type === 'stop' && message.version === 1) {
    void stop().catch((error) => {
      send({
        type: 'error',
        version: 1,
        stage: shutdownStage,
        category: error?.name === 'TypeError' ? 'TypeError' : 'Error',
      });
      process.exit(1);
    });
  }
});
process.on('SIGTERM', () => void stop().catch(() => process.exit(1)));
process.on('SIGINT', () => void stop().catch(() => process.exit(1)));
if (parent) parent.on('close', () => void stop().catch(() => process.exit(1)));
else process.on('disconnect', () => void stop().catch(() => process.exit(1)));
