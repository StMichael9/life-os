export function trustedOrigin(value: string, packaged: boolean): string {
  const url = new URL(value);
  const developmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && developmentHost && !packaged))
  ) {
    throw new Error(
      'Life OS requires an HTTPS origin (loopback HTTP is allowed only in development).',
    );
  }
  return url.origin;
}
export function allowedNavigation(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Shared by the actual BrowserWindow constructor; no privilege bridge is exposed. */
export const rendererSecurity = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
});
