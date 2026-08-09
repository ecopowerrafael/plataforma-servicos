import { existsSync, statSync } from 'node:fs';

import {
  buildBackupFilename,
  ensureSafeBackupDirectory,
  parseDatabaseUrl,
  resolveDatabaseConfig,
  runMysqlDump,
} from '../src/lib/mysql-backup.js';

function formatError(message: string): never {
  console.error(`[mysql-backup] ${message}`);
  process.exit(1);
}

const envSource = process.env;
const databaseUrl = envSource.DATABASE_URL ?? '';
const backupDirectory = ensureSafeBackupDirectory(envSource.MYSQL_BACKUP_DIR);
const config = databaseUrl ? parseDatabaseUrl(databaseUrl) : resolveDatabaseConfig(envSource);
const targetFile = `${backupDirectory}/${buildBackupFilename()}`;

if (!existsSync(backupDirectory)) {
  formatError(`Backup directory does not exist and could not be created: ${backupDirectory}`);
}

const stats = statSync(backupDirectory);
if (!stats.isDirectory()) {
  formatError(`Backup path is not a directory: ${backupDirectory}`);
}

const result = runMysqlDump(config, targetFile);

if (result.code !== 0) {
  console.error('[mysql-backup] Backup failed.');
  if (result.stderr) {
    console.error(result.stderr.trim());
  }
  process.exit(result.code || 1);
}

console.log(`[mysql-backup] Backup created: ${targetFile}`);
