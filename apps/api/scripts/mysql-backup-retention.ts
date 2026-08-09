import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { deleteExpiredBackups, parseRetentionDays } from '../src/lib/mysql-backup.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const retentionDays = parseRetentionDays(
  args.find((arg) => arg.startsWith('--days='))?.split('=')[1] ?? undefined,
);
const backupDirectory = process.env.MYSQL_BACKUP_DIR ?? 'backups/mysql';
const targetDirectory = resolve(process.cwd(), backupDirectory);

if (!existsSync(targetDirectory)) {
  console.error(`[mysql-backup-retention] Backup directory does not exist: ${targetDirectory}`);
  process.exit(1);
}

const stats = statSync(targetDirectory);
if (!stats.isDirectory()) {
  console.error(`[mysql-backup-retention] Backup path is not a directory: ${targetDirectory}`);
  process.exit(1);
}

const result = deleteExpiredBackups(targetDirectory, retentionDays, dryRun);

if (result.errors.length > 0) {
  for (const errorEntry of result.errors) {
    console.error(`[mysql-backup-retention] ${errorEntry}`);
  }
}

if (dryRun) {
  console.log(
    `[mysql-backup-retention] Dry run: ${String(result.wouldRemove.length)} backup(s) would be removed.`,
  );
  if (result.wouldRemove.length > 0) {
    console.log(result.wouldRemove.map((file) => `- ${file}`).join('\n'));
  }
  process.exit(0);
}

console.log(`[mysql-backup-retention] Removed ${String(result.removed.length)} backup(s).`);
if (result.removed.length > 0) {
  console.log(result.removed.map((file) => `- ${file}`).join('\n'));
}
