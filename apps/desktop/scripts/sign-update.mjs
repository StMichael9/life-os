import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const metadata = JSON.parse(await readFile('apps/desktop/package.json', 'utf8'));
const config = JSON.parse(await readFile('apps/desktop/update-config.json', 'utf8'));
const version = metadata.version,
  filename = `Life-OS-Setup-${version}.exe`,
  file = `apps/desktop/release/${filename}`;
if (!/^\d+\.\d+\.\d+$/.test(version) || !process.env.LIFE_OS_UPDATE_PRIVATE_KEY)
  throw Error('Release signing is not configured');
const hash = createHash('sha512');
for await (const chunk of createReadStream(file)) hash.update(chunk);
const payload = Buffer.from(
  JSON.stringify({
    appId: 'com.lifeos.desktop',
    version,
    filename,
    size: (await stat(file)).size,
    sha512: hash.digest('base64'),
    platform: 'win32',
    arch: 'x64',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  }),
);
const signature = sign(
  null,
  payload,
  createPrivateKey({
    key: Buffer.from(process.env.LIFE_OS_UPDATE_PRIVATE_KEY, 'base64'),
    format: 'der',
    type: 'pkcs8',
  }),
);
if (
  !verify(
    null,
    payload,
    createPublicKey({ key: Buffer.from(config.publicKey, 'base64'), format: 'der', type: 'spki' }),
    signature,
  )
)
  throw Error('Signing secret does not match the installed public key');
await writeFile(
  'apps/desktop/release/life-os-update.json',
  JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }),
);
console.log('Release installer signed; private key was not written to disk');
