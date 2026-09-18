import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeError } from './sanitize.mjs';
import fs from 'node:fs';
import path from 'node:path';

export const BASELINE_NAME = '00000000000000_production_v1';
export const BASELINE_CHECKSUM = '79eb73c0968209a730b84abd565f6a0de8d3076e63618ba01fb27315611cc2e6';
export const V2_STATES = Object.freeze({ READY: 'V2_READY', CUTOVER: 'V2_CUTOVER_REQUIRED', PARTIAL: 'V2_PARTIAL', MISMATCH: 'SCHEMA_MISMATCH', EMPTY: 'EMPTY_DATABASE', TARGET: 'TARGET_MISMATCH' });
const BASELINE_SQL = fs.readFileSync(path.resolve('apps/api/prisma-v2/migrations/00000000000000_production_v1/migration.sql'), 'utf8');
export const CANONICAL_TABLES = Object.freeze([...new Set(Array.from(BASELINE_SQL.matchAll(/^CREATE TABLE `([^`]+)`/gim), (match) => match[1]))]);
export function parseAllowedExtraTables(value = '') {
  if (value === '') return [];
  const names = value.split(',');
  if (names.some((name) => !/^[A-Za-z0-9_]+$/.test(name))) throw new Error('V2_ALLOWED_EXTRA_TABLES_INVALID');
  if (new Set(names).size !== names.length) throw new Error('V2_ALLOWED_EXTRA_TABLES_DUPLICATE');
  return names;
}

export function expectedServerPort(value, transportPort) {
  if (value === undefined) return String(transportPort || 3306);
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65535) throw new Error('V2_EXPECTED_SERVER_PORT_INVALID');
  return value;
}

export function classifyV2State({ applicationTables, baselineRows, baselineChecksum, schemaMatches = true, extraTables = [], allowedExtraTables = [] }) {
  const unauthorizedExtras = extraTables.filter((table) => !allowedExtraTables.includes(table));
  if (applicationTables === 0 && baselineRows === 0) return { allowed: true, state: V2_STATES.EMPTY, warnings: [] };
  if (!schemaMatches) return { allowed: false, state: V2_STATES.MISMATCH, code: 'DATABASE_V2_CUTOVER_REQUIRED' };
  if (unauthorizedExtras.length > 0) return { allowed: false, state: V2_STATES.MISMATCH, code: 'DATABASE_V2_CUTOVER_REQUIRED', unauthorizedExtras };
  if (applicationTables > 0 && baselineRows === 1 && baselineChecksum === BASELINE_CHECKSUM) {
    return { allowed: true, state: V2_STATES.READY, warnings: extraTables.map((table) => `legacy extra preserved: ${table}`) };
  }
  if (applicationTables > 0 && baselineRows === 0) return { allowed: false, state: V2_STATES.CUTOVER, code: 'DATABASE_V2_CUTOVER_REQUIRED' };
  return { allowed: false, state: V2_STATES.PARTIAL, code: 'DATABASE_V2_CUTOVER_REQUIRED' };
}

export function assertV2Database(databaseUrl, { mysql = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe' } = {}) {
  if (!databaseUrl) throw new Error('V2_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
  const args = ['--protocol=TCP', '--host', url.hostname, '--port', url.port || '3306', '--user', decodeURIComponent(url.username), '--batch', '--skip-column-names', database];
  const identitySql = "SELECT DATABASE(), USER(), @@hostname, @@port, (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations');";
  const output = execFileSync(mysql, [...args, '-e', identitySql], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).pop().split('\t');
  const [selectedDatabase, user, host, port, applicationTables] = output;
  const expectedServerPortEnv = process.env.V2_EXPECTED_SERVER_PORT;
  const serverPort = expectedServerPort(expectedServerPortEnv, url.port || 3306);
  const allowedExtraTables = parseAllowedExtraTables(process.env.V2_ALLOWED_EXTRA_TABLES);
  if (selectedDatabase !== database || !user.startsWith(`${decodeURIComponent(url.username)}@`) || !host || String(port) !== serverPort) {
    throw new Error(V2_STATES.TARGET);
  }
  if (Number(applicationTables) === 0) return { allowed: true, state: V2_STATES.EMPTY, database, host, port, user };
  const tableRows = execFileSync(mysql, [...args, '-e', "SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY TABLE_NAME"], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).filter(Boolean);
  const canonicalSet = new Set(CANONICAL_TABLES);
  const actualSet = new Set(tableRows);
  const missingCanonical = CANONICAL_TABLES.filter((table) => !actualSet.has(table));
  const extraTables = tableRows.filter((table) => !canonicalSet.has(table));
  if (missingCanonical.length > 0) throw new Error(V2_STATES.MISMATCH);
  const fkRows = allowedExtraTables.length === 0 ? [] : execFileSync(mysql, [...args, '-e', `SELECT DISTINCT TABLE_NAME FROM information_schema.key_column_usage WHERE constraint_schema=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND (TABLE_NAME IN (${allowedExtraTables.map((name) => `'${name}'`).join(',')}) OR REFERENCED_TABLE_NAME IN (${allowedExtraTables.map((name) => `'${name}'`).join(',')}))`], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).filter(Boolean);
  if (fkRows.length > 0) throw new Error(V2_STATES.MISMATCH);
  const ledgerSql = `SELECT COUNT(*), COALESCE(MAX(checksum), '') FROM _prisma_migrations WHERE migration_name = '${BASELINE_NAME}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;`;
  const ledger = execFileSync(mysql, [...args, '-e', ledgerSql], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).pop().split('\t');
  const result = classifyV2State({ applicationTables: Number(applicationTables), baselineRows: Number(ledger[0]), baselineChecksum: ledger[1], extraTables, allowedExtraTables });
  if (!result.allowed) throw new Error(result.state);
  return { ...result, database, host, port, user };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = assertV2Database(process.env.V2_DATABASE_URL);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(safeError(error));
    process.exitCode = 1;
  }
}
