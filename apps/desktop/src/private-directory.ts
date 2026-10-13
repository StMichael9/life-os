import { mkdir, lstat, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const execute = promisify(execFile);

/** Establish access before opening local secrets or database files. Never traverse a junction. */
export async function protectDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Invalid private data directory');
  if (process.platform !== 'win32') {
    await chmod(directory, 0o700);
    return;
  }
  const script = `
$ErrorActionPreference = 'Stop'
$path = $env:LIFE_OS_PRIVATE_DIRECTORY
$current = [Security.Principal.WindowsIdentity]::GetCurrent().User
$folder = [IO.DirectoryInfo]::new($path)
# Read/write only the DACL. Replacing a fresh security descriptor through Set-Acl
# can request SACL privileges on an already protected directory at next launch.
$acl = $folder.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$acl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
foreach ($sid in @($current, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
}
$folder.SetAccessControl($acl)
$actual = Get-Acl -LiteralPath $path
if (!$actual.AreAccessRulesProtected) { throw 'Inheritance is not protected' }
$allowed = @($current.Value, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $actual.Access) {
  $sid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
  if ($rule.AccessControlType -eq 'Allow' -and $sid -notin $allowed) { throw 'Unexpected access rule' }
}
`;
  const powershell = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  try {
    await execute(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      {
        env: {
          ...process.env,
          LIFE_OS_PRIVATE_DIRECTORY: directory,
          // A developer's PowerShell 7 module path is incompatible with the OS PowerShell 5 host.
          PSModulePath: join(
            process.env.SystemRoot ?? 'C:\\Windows',
            'System32',
            'WindowsPowerShell',
            'v1.0',
            'Modules',
          ),
        },
        windowsHide: true,
        timeout: 15000,
      },
    );
  } catch (cause) {
    throw new Error('Life OS could not protect its private data directory.', { cause });
  }
}
