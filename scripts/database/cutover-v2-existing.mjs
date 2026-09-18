import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BASELINE_CHECKSUM, BASELINE_NAME, CANONICAL_TABLES, classifyV2State, expectedServerPort, parseAllowedExtraTables } from './v2-state-guard.mjs';
import { decideExistingCutover } from './cutover-v2-existing-policy.mjs';
import { redact, safeError } from './sanitize.mjs';

const execFileAsync = promisify(execFile);
export const REQUIRED_CONFIRMATION = 'I_UNDERSTAND_EXISTING_V2_CUTOVER';
export const BACKUP_CONFIRMATION = 'I_CONFIRMED_BACKUP';
export function validateCutoverInput({ confirmation, backupConfirmation, backupSha, target }) {
  if (confirmation !== REQUIRED_CONFIRMATION) throw new Error('CUTOVER_CONFIRM inválido');
  if (backupConfirmation !== BACKUP_CONFIRMATION || !/^[a-f0-9]{64}$/i.test(backupSha ?? '')) throw new Error('backup não confirmado');
  const url = new URL(target);
  if (url.hostname !== '127.0.0.1' || !url.pathname.slice(1) || !url.username) throw new Error('alvo V2 inválido');
  return url;
}
const fail = (message) => { console.error(safeError(new Error(message))); process.exit(2); };
let url;
try { url = validateCutoverInput({ confirmation: process.env.CUTOVER_CONFIRM, backupConfirmation: process.env.BACKUP_CONFIRM, backupSha: process.env.BACKUP_SHA256, target: process.env.V2_DATABASE_URL }); } catch (error) { fail(error.message); }
const database = decodeURIComponent(url.pathname.slice(1));
const mysql = process.env.MYSQL_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
const args = ['--protocol=TCP', '--host', url.hostname, '--port', url.port || '3306', '--user', decodeURIComponent(url.username), '--batch', '--skip-column-names', database];
const query = async (sql) => (await execFileAsync(mysql, [...args, '-e', sql], { env, windowsHide: true })).stdout.trim();
try {
  const identity = await query('SELECT DATABASE(), USER(), @@hostname, @@port');
  const [selectedDatabase, user, host, serverPort] = identity.split('\t');
  if (selectedDatabase !== database || !user.startsWith(`${decodeURIComponent(url.username)}@`) || !host || serverPort !== expectedServerPort(process.env.V2_EXPECTED_SERVER_PORT, url.port || '3306')) fail('DATABASE_TARGET_MISMATCH');
  const checks = await query("SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'), (SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='00000000000000_production_v1' AND finished_at IS NULL), (SELECT COUNT(*) FROM tenant_whatsapp_configs WHERE provider IS NOT NULL), (SELECT COUNT(*) FROM whatsapp_inbound_events WHERE provider IS NOT NULL), (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='wapi_remote_identity_mappings')");
  const [applicationTables, partialBaseline, configs, events, wapi] = checks.split('\t').map(Number);
  const allowedExtraTables = parseAllowedExtraTables(process.env.V2_ALLOWED_EXTRA_TABLES);
  const tableRows = (await query("SELECT TABLE_NAME FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY TABLE_NAME")).split(/\r?\n/).filter(Boolean);
  const actualSet = new Set(tableRows);
  const missingCanonical = CANONICAL_TABLES.filter((table) => !actualSet.has(table));
  const extraTables = tableRows.filter((table) => !CANONICAL_TABLES.includes(table));
  const unauthorizedExtras = extraTables.filter((table) => !allowedExtraTables.includes(table));
  const fkRows = allowedExtraTables.length === 0 ? [] : (await query(`SELECT DISTINCT TABLE_NAME FROM information_schema.key_column_usage WHERE constraint_schema=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL AND (TABLE_NAME IN (${allowedExtraTables.map((name) => `'${name}'`).join(',')}) OR REFERENCED_TABLE_NAME IN (${allowedExtraTables.map((name) => `'${name}'`).join(',')}))`)).split(/\r?\n/).filter(Boolean);
  const schemaCompatible = missingCanonical.length === 0 && unauthorizedExtras.length === 0 && fkRows.length === 0;
  const existing = await query(`SELECT COUNT(*),COALESCE(MAX(checksum),'') FROM _prisma_migrations WHERE migration_name='${BASELINE_NAME}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`);
  const [baselineRows, baselineChecksum] = existing.split('\t');
  const state = classifyV2State({ applicationTables, baselineRows: Number(baselineRows), baselineChecksum, schemaMatches: schemaCompatible, extraTables, allowedExtraTables });
  const decision = decideExistingCutover({ state: state.state, confirmation: true, backupConfirmed: true, schemaCompatible, whatsappReady: configs >= 1 && events >= 1 && wapi === 1, noDuplicate: true, noPartialBaseline: partialBaseline === 0 });
  if (!decision.allowed) fail(state.state);
  const ledger = await query("SELECT migration_name,checksum,started_at,finished_at,applied_steps_count,COALESCE(rolled_back_at,'') FROM _prisma_migrations ORDER BY started_at,migration_name");
  const archiveDir = path.resolve(process.env.CUTOVER_LEDGER_DIR ?? 'artifacts/database');
  await fs.mkdir(archiveDir, { recursive: true });
  const archive = path.join(archiveDir, `legacy-ledger-before-v2-${Date.now()}.tsv`);
  await fs.writeFile(archive, redact(ledger) + '\n', { encoding: 'utf8', flag: 'wx' });
  const [count, checksum] = existing.split('\t');
  if (Number(count) === 1 && checksum === BASELINE_CHECKSUM) { console.log(JSON.stringify({ state: 'already-cutover', database, archive })); process.exit(0); }
  if (Number(count) !== 0) fail('baseline V2 parcial ou checksum divergente');
  const id = crypto.createHash('md5').update(`agendei-existing-v2:${BASELINE_NAME}`).digest('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.*)/, '$1-$2-$3-$4-$5');
  await query(`INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,logs,rolled_back_at,started_at,applied_steps_count) VALUES ('${id}','${BASELINE_CHECKSUM}',NOW(3),'${BASELINE_NAME}',NULL,NULL,NOW(3),0)`);
  console.log(JSON.stringify({ state: 'cutover-registered', database, identity, archive, baseline: BASELINE_NAME }));
} catch (error) { fail(error.message); }
