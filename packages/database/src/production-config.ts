/** Trusted deployment input only. Errors never interpolate a credential or URL. */
export function productionDatabaseUrl(raw: string | undefined, allowLocal = false) {
  if (!raw) throw new Error('A database connection is required.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('The database connection is invalid.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    !/^\/[^/]+$/.test(url.pathname) ||
    url.hash
  )
    throw new Error('The database connection is invalid.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (local && allowLocal && /_(tests|e2e|restore)$/.test(url.pathname)) return url;
  if (
    local ||
    url.searchParams.get('sslmode') !== 'verify-full' ||
    url.searchParams.getAll('sslmode').length !== 1 ||
    ['uselibpqcompat', 'ssl', 'sslcert', 'sslkey', 'sslrootcert'].some((k) =>
      url.searchParams.has(k),
    )
  )
    throw new Error(
      'Hosted PostgreSQL requires sslmode=verify-full with certificate verification.',
    );
  return url;
}
