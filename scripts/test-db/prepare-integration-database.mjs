import { spawnSync } from 'node:child_process';
import { parseAndGuardDatabaseUrl } from './guard-test-database.mjs';

const target = parseAndGuardDatabaseUrl(process.env.MYSQL_INTEGRATION_DATABASE_URL, { allowCleanup: true });
const mysql = process.env.MYSQL_BIN || 'mysql';
const env = { ...process.env, MYSQL_PWD: target.password };
const sql = `CREATE DATABASE IF NOT EXISTS \`${target.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
const result = spawnSync(mysql, ['--protocol=TCP', '-h', target.host, '-P', String(target.port), '-u', target.user, '-e', sql], { env, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Prepared local test database ${target.database}.`);
