export class RequestFailed extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requestJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new RequestFailed(
      response.status,
      typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Request failed. Please try again.',
    );
  return data as T;
}
export async function postJson<T>(path: string, body: unknown) {
  // Renew signed CSRF material immediately before a mutation. It contains no session token.
  const { token } = await requestJson<{ token: string }>('/api/auth/csrf');
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
    body: JSON.stringify(body),
  });
}
export interface Profile {
  id: string;
  displayName: string;
  timeZone: string;
}
export interface InboxItem {
  id: string;
  body: string;
  createdAt: string;
}
export interface Cursor {
  id: string;
  createdAt: string;
}
