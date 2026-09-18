import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { safeError } from './sanitize.mjs';

export const BASELINE_NAME = '00000000000000_production_v1';
export const BASELINE_CHECKSUM = '79eb73c0968209a730b84abd565f6a0de8d3076e63618ba01fb27315611cc2e6';

export function classifyV2State({ applicationTables, baselineRows, baselineChecksum, schemaMatches = true }) {
  if (applicationTables === 0 && baselineRows === 0) return { allowed: true, state: 'empty' };
  if (!schemaMatches) return { allowed: false, code: 'DATABASE_V2_CUTOVER_REQUIRED' };
  if (applicationTables > 0 && baselineRows === 1 && baselineChecksum === BASELINE_CHECKSUM) {
    return { allowed: true, state: 'v2' };
  }
  return { allowed: false, code: 'DATABASE_V2_CUTOVER_REQUIRED' };
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
  if (selectedDatabase !== database || !user.startsWith(`${decodeURIComponent(url.username)}@`) || !host || String(port) !== String(url.port || 3306)) {
    throw new Error('DATABASE_TARGET_MISMATCH');
  }
  if (Number(applicationTables) === 0) return { allowed: true, state: 'empty', database, host, port, user };
  const ledgerSql = `SELECT COUNT(*), COALESCE(MAX(checksum), '') FROM _prisma_migrations WHERE migration_name = '${BASELINE_NAME}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;`;
  const ledger = execFileSync(mysql, [...args, '-e', ledgerSql], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).pop().split('\t');
  const result = classifyV2State({ applicationTables: Number(applicationTables), baselineRows: Number(ledger[0]), baselineChecksum: ledger[1] });
  if (!result.allowed) throw new Error(result.code);
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
