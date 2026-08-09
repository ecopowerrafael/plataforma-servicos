import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const BACKUP_FILENAME_PATTERN = /^backup-(\d{4})-(\d{2})-(\d{2})-(\d{6})\.sql$/u;

export interface BackupClassification {
  valid: boolean;
  name: string;
  timestamp: Date | null;
}

export interface MysqlConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function buildBackupFilename(date = new Date()): string {
  const value = new Date(date);
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  const hours = String(value.getUTCHours()).padStart(2, '0');
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  const seconds = String(value.getUTCSeconds()).padStart(2, '0');

  return `backup-${String(year)}-${month}-${day}-${hours}${minutes}${seconds}.sql`;
}

export function ensureSafeBackupDirectory(configuredDir?: string): string {
  const baseDir = configuredDir ?? process.env.MYSQL_BACKUP_DIR ?? 'backups/mysql';
  const rawSegments = baseDir.split(/[\\/]/u);
  const traversalIndex = rawSegments.findIndex((segment) => segment === '..');

  const safeDir = traversalIndex >= 0 ? rawSegments.slice(0, traversalIndex).join('/') : baseDir;
  const resolved = resolve(process.cwd(), safeDir);

  mkdirSync(resolved, { recursive: true });

  return resolved;
}

export function isValidBackupFileName(filename: string): boolean {
  return BACKUP_FILENAME_PATTERN.exec(filename) !== null;
}

export function classifyBackupFile(filename: string): BackupClassification {
  if (!isValidBackupFileName(filename)) {
    return { valid: false, name: filename, timestamp: null };
  }

  const match = BACKUP_FILENAME_PATTERN.exec(filename);

  if (!match) {
    return { valid: false, name: filename, timestamp: null };
  }

  const [, year, month, day, time] = match;
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(2, 4));
  const second = Number(time.slice(4, 6));
  const timestamp = new Date(Number(year), Number(month) - 1, Number(day), hour, minute, second);

  return {
    valid: true,
    name: filename,
    timestamp,
  };
}

export function parseDatabaseUrl(databaseUrl: string): MysqlConnectionConfig {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/gu, ''));

  if (!database) {
    throw new Error('DATABASE_URL does not contain a database name.');
  }

  return {
    host: parsed.hostname || '127.0.0.1',
    port: Number(parsed.port || 3306),
    user: parsed.username || 'root',
    password: parsed.password || '',
    database,
  };
}

export function resolveDatabaseConfig(source: NodeJS.ProcessEnv = process.env): MysqlConnectionConfig {
  const configuredUrl = source.DATABASE_URL;

  if (configuredUrl) {
    return parseDatabaseUrl(configuredUrl);
  }

  const database = source.MYSQL_DATABASE ?? 'plataforma_servicos';
  const user = source.MYSQL_USER ?? 'root';
  const password = source.MYSQL_PASSWORD ?? '';
  const host = source.MYSQL_HOST ?? '127.0.0.1';
  const port = Number(source.MYSQL_PORT ?? 3306);

  return { host, port, user, password, database };
}

export function computeRetentionCandidates(
  fileNames: string[],
  retentionDays: number,
  now = new Date(),
): string[] {
  const safeDays = Number.isFinite(retentionDays) && retentionDays >= 0 ? retentionDays : 0;
  const cutoff = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);

  return fileNames
    .filter((fileName) => {
      const info = classifyBackupFile(fileName);
      return info.valid && info.timestamp !== null && info.timestamp.getTime() < cutoff.getTime();
    })
    .sort((left, right) => left.localeCompare(right));
}

export function getBackupDirectoryEntries(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory, { withFileTypes: false }) as string[];
  const validEntries = entries.filter((entry) => isValidBackupFileName(entry));

  return [...validEntries].sort((left, right) => left.localeCompare(right));
}

function getExecutable(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

export function runMysqlDump(
  config: MysqlConnectionConfig,
  backupPath: string,
): { code: number; stdout: string; stderr: string; command: string } {
  const resolvedPath = resolve(backupPath);
  const directory = dirname(resolvedPath);

  mkdirSync(directory, { recursive: true });

  const executable = getExecutable('mysqldump');
  const result = spawnSync(
    executable,
    [
      '--host',
      config.host,
      '--port',
      String(config.port),
      '--user',
      config.user,
      '--default-character-set=utf8mb4',
      '--single-transaction',
      '--routines',
      '--events',
      config.database,
      '--result-file',
      resolvedPath,
    ],
    {
      env: {
        ...process.env,
        MYSQL_PWD: config.password,
      },
      encoding: 'utf8',
    },
  ) as {
    status: number | null;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
  };

  const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString() ?? '';
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString() ?? '';

  if (result.status === null) {
    return {
      code: 127,
      stdout,
      stderr: 'mysqldump is not available in PATH or could not be executed.',
      command: executable,
    };
  }

  return {
    code: result.status,
    stdout,
    stderr,
    command: executable,
  };
}

export function runMysqlRestore(
  config: MysqlConnectionConfig,
  sqlPath: string,
): { code: number; stdout: string; stderr: string; command: string } {
  if (!existsSync(sqlPath)) {
    throw new Error(`Backup file does not exist: ${sqlPath}`);
  }

  const executable = getExecutable('mysql');
  const contents = readFileSync(sqlPath);
  const result = spawnSync(
    executable,
    ['--host', config.host, '--port', String(config.port), '--user', config.user, config.database],
    {
      env: {
        ...process.env,
        MYSQL_PWD: config.password,
      },
      input: contents,
      encoding: 'utf8',
    },
  ) as {
    status: number | null;
    stderr?: string | Buffer;
    stdout?: string | Buffer;
  };

  const stderr = typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString() ?? '';
  const stdout = typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString() ?? '';

  if (result.status === null) {
    return {
      code: 127,
      stdout,
      stderr: 'mysql is not available in PATH or could not be executed.',
      command: executable,
    };
  }

  return {
    code: result.status,
    stdout,
    stderr,
    command: executable,
  };
}

export function deleteExpiredBackups(
  directory: string,
  retentionDays: number,
  dryRun = true,
): { removed: string[]; wouldRemove: string[]; errors: string[] } {
  const result = {
    removed: [] as string[],
    wouldRemove: [] as string[],
    errors: [] as string[],
  };

  try {
    const absoluteDirectory = resolve(directory);
    const entries = getBackupDirectoryEntries(absoluteDirectory);
    const candidates = computeRetentionCandidates(entries, retentionDays, new Date());

    for (const candidate of candidates) {
      const fullPath = resolve(absoluteDirectory, candidate);
      const withinBase = fullPath.startsWith(absoluteDirectory + sepForPath());

      if (!withinBase && fullPath !== absoluteDirectory) {
        result.errors.push(`Refusing to delete outside backup directory: ${candidate}`);
        continue;
      }

      result.wouldRemove.push(candidate);

      if (dryRun) {
        continue;
      }

      try {
        rmSync(fullPath, { force: false, recursive: false });
        result.removed.push(candidate);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

function sepForPath(): string {
  return process.platform === 'win32' ? '\\' : '/';
}

export function getBackupFilePath(directory: string, fileName: string): string {
  const base = resolve(directory);
  const target = resolve(base, fileName);

  if (!target.startsWith(base + sepForPath()) && target !== base) {
    throw new Error('Path traversal detected in backup file selection.');
  }

  return target;
}

export function fileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function buildBackupTargetDirectory(dir: string): string {
  const base = resolve(process.cwd(), dir);
  return base;
}

export function parseRetentionDays(input: string | number | undefined): number {
  const parsed = Number(input ?? process.env.MYSQL_BACKUP_RETENTION_DAYS ?? 30);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 30;
  }

  return Math.trunc(parsed);
}

export function isBackupDirectorySafe(directory: string): boolean {
  const resolved = resolve(directory);
  return existsSync(resolved);
}

export function listBackupFiles(directory: string): string[] {
  return getBackupDirectoryEntries(resolve(directory));
}

export function safeJoinBackupDirectory(directory: string, fileName: string): string {
  const base = resolve(directory);
  const target = join(base, fileName);
  if (!target.startsWith(base + sepForPath()) && target !== base) {
    throw new Error('Invalid backup file name/path.');
  }

  return target;
}
