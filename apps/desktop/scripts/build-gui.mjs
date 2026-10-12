// Test build only; release packaging still requires an explicit hosted HTTPS origin.
process.env.LIFE_OS_WEB_URL = 'http://127.0.0.1:3000';
await import('./build.mjs');
