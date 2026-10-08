import { validateHostedConfiguration } from './production-config';
try {
  // An operator may hold migration/backup credentials here; they must never enter Vercel.
  validateHostedConfiguration({
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    APP_ORIGIN: process.env.APP_ORIGIN,
    AUTH_ALLOW_HTTP_LOOPBACK: process.env.AUTH_ALLOW_HTTP_LOOPBACK,
  });
  console.log(
    'Hosted runtime configuration validated. Credential values were not printed. Verify that only runtime variables are installed in Vercel.',
  );
} catch {
  console.error(
    'Hosted configuration is invalid. Check HTTPS origin, verified PostgreSQL TLS, secret length and absence of the development HTTP opt-in. Values were withheld.',
  );
  process.exitCode = 1;
}
