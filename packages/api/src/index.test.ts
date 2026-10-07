import { expect, it, vi } from 'vitest';
import { AuthenticationRequired, createInboxService } from './index';

const create = () => {
  const repository = {
    capture: vi.fn(async (_owner: string, body: string) => ({ id: 'item', body })),
    list: vi.fn(async () => []),
  };
  const sessions = {
    verify: vi.fn(async (token: string) =>
      token === 'valid' ? { userId: 'verified-user' } : null,
    ),
  };
  return { repository, service: createInboxService(sessions, repository) };
};
it('denies absent, expired, and revoked sessions before repository access', async () => {
  const { service, repository } = create();
  for (const token of [undefined, 'expired', 'revoked']) {
    await expect(service.capture(token, { body: 'secret' })).rejects.toThrow(
      AuthenticationRequired,
    );
    await expect(service.list(token)).rejects.toThrow(AuthenticationRequired);
  }
  expect(repository.capture).not.toHaveBeenCalled();
  expect(repository.list).not.toHaveBeenCalled();
});
it('derives ownership only from the verified session', async () => {
  const { service, repository } = create();
  await service.capture('valid', { body: ' A thought ' });
  expect(repository.capture).toHaveBeenCalledWith('verified-user', 'A thought');
  await service.list('valid');
  expect(repository.list).toHaveBeenCalledWith('verified-user');
  await expect(
    service.capture('valid', { body: 'secret', userId: 'someone-else' }),
  ).rejects.toThrow();
  expect(repository.capture).toHaveBeenCalledTimes(1);
});
