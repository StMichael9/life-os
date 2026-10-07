import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createDatabase, createAuthRepository } from '@life-os/database';
import { createAuthService } from './auth';

// The trusted operator runs this command; there is deliberately no registration API.
let mute = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!mute) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
let database: ReturnType<typeof createDatabase> | undefined;
try {
  if (!process.stdin.isTTY) throw new Error('Run interactively to enter account details securely.');
  const email = await rl.question('Email: ');
  const displayName = await rl.question('Display name: ');
  const timeZone = (await rl.question('IANA timezone [UTC]: ')) || 'UTC';
  process.stdout.write('Password (12–128 characters): ');
  mute = true;
  const password = await rl.question('');
  mute = false;
  process.stdout.write('\n');
  process.stdout.write('Confirm password: ');
  mute = true;
  const confirmation = await rl.question('');
  mute = false;
  process.stdout.write('\n');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const url = process.env.DATABASE_URL;
  const secret = process.env.AUTH_SECRET;
  if (!url || !secret)
    throw new Error('Set DATABASE_URL and AUTH_SECRET for the intended environment.');
  database = createDatabase(url);
  await createAuthService(createAuthRepository(database.db), secret).createAccount({
    email,
    displayName,
    timeZone,
    password,
  });
  process.stdout.write('Account created.\n');
} catch (error) {
  // Zod errors may echo input; never print credential-bearing errors.
  process.stderr.write(
    error instanceof Error && error.name === 'Error'
      ? `${error.message}\n`
      : 'Account creation failed. Check configuration and input.\n',
  );
  process.exitCode = 1;
} finally {
  mute = false;
  rl.close();
  await database?.close();
}
