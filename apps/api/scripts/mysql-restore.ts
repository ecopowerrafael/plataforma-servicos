import { existsSync, statSync } from 'node:fs';

import {
  getBackupFilePath,
  parseDatabaseUrl,
  resolveDatabaseConfig,
  runMysqlRestore,
} from '../src/lib/mysql-backup.js';

function requireConfirmed(flag: string | undefined, force: boolean): void {
  if (force) {
    return;
  }

  if (flag === 'yes' || flag === 'y' || flag === 'true') {
    return;
  }

  throw new Error('Restore requires explicit confirmation. Pass --confirm or --yes to proceed.');
}

const args = process.argv.slice(2);
const explicitPathIndex = args.findIndex((arg) => arg === '--file' || arg === '-f');
const confirmIndex = args.findIndex((arg) => arg === '--confirm' || arg === '--yes' || arg === '--force');
const force = confirmIndex >= 0;
const fileArg = explicitPathIndex >= 0 ? args[explicitPathIndex + 1] : undefined;

if (!fileArg) {
  console.error('[mysql-restore] Usage: npm run db:restore -- --file <backup.sql> [--confirm]');
  process.exit(1);
}

try {
  requireConfirmed(process.env.MYSQL_RESTORE_CONFIRM, force);
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const config = databaseUrl ? parseDatabaseUrl(databaseUrl) : resolveDatabaseConfig(process.env);
  const directory = process.env.MYSQL_BACKUP_DIR ?? 'backups/mysql';
  const target = getBackupFilePath(directory, fileArg);

  if (!existsSync(target)) {
    throw new Error(`Backup file does not exist: ${target}`);
  }

  if (!statSync(target).isFile()) {
    throw new Error(`Selected path is not a file: ${target}`);
  }

  console.warn(`[mysql-restore] This will restore the database using ${target}.`);
  console.warn('[mysql-restore] This operation is destructive and cannot be undone without a fresh backup.');

  const result = runMysqlRestore(config, target);

  if (result.code !== 0) {
    console.error('[mysql-restore] Restore failed.');
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(result.code || 1);
  }

  console.log(`[mysql-restore] Restore completed successfully: ${target}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[mysql-restore] ${message}`);
  process.exit(1);
}
