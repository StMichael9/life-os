import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './index';
import { productionDatabaseUrl } from './production-config';
import {
  migrationFolder,
  withOperationsClient,
  verifyMigrationCheckpoint,
  verifyRuntimePermissions,
  createEncryptedBackup,
  restoreEncryptedBackup,
  OperationsError,
} from './operations';
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new OperationsError('Set ' + name + ' securely for this operator command.');
  return value;
};
const allowLocal = process.env.LIFE_OS_OPERATIONS_ALLOW_LOCAL === 'true';
try {
  const mode = process.argv[2];
  if (mode === 'migrate') {
    const url = required('MIGRATION_DATABASE_URL');
    productionDatabaseUrl(url, allowLocal);
    const connection = createDatabase(url);
    try {
      await migrate(connection.db, { migrationsFolder: migrationFolder });
    } finally {
      await connection.close();
    }
    console.log(await withOperationsClient(url, allowLocal, verifyMigrationCheckpoint));
  } else if (mode === 'verify') {
    console.log(
      await withOperationsClient(
        required('MIGRATION_DATABASE_URL'),
        allowLocal,
        verifyMigrationCheckpoint,
      ),
    );
    console.log(
      await withOperationsClient(required('DATABASE_URL'), allowLocal, verifyRuntimePermissions),
    );
  } else if (mode === 'runtime') {
    console.log(
      await withOperationsClient(required('DATABASE_URL'), false, verifyRuntimePermissions),
    );
  } else if (mode === 'backup') {
    console.log(
      await createEncryptedBackup({
        url: required('BACKUP_DATABASE_URL'),
        keyFile: required('LIFE_OS_BACKUP_KEY_FILE'),
        file: required('LIFE_OS_BACKUP_FILE'),
        allowLocal,
        ...(process.env.PG_DUMP_BIN ? { pgDump: process.env.PG_DUMP_BIN } : {}),
      }),
    );
  } else if (mode === 'restore') {
    console.log(
      await restoreEncryptedBackup({
        url: required('RESTORE_DATABASE_URL'),
        keyFile: required('LIFE_OS_BACKUP_KEY_FILE'),
        file: required('LIFE_OS_BACKUP_FILE'),
        confirm: required('LIFE_OS_RESTORE_CONFIRM'),
        allowLocal,
        ...(process.env.PG_RESTORE_BIN ? { pgRestore: process.env.PG_RESTORE_BIN } : {}),
      }),
    );
  } else throw new OperationsError('Choose migrate, verify, runtime, backup or restore.');
} catch (e) {
  // Only deliberate redacted operator messages are shown; never print DB/crypto/tool errors.
  console.error(
    e instanceof OperationsError
      ? e.message
      : 'Operations failed. Configuration/connection/client diagnostics were withheld to protect secrets.',
  );
  process.exitCode = 1;
}
