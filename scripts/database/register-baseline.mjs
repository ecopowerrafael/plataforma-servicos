import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.BASELINE_DATABASE_URL;
const mysql = process.env.MYSQL_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';
const requiredConfirmation = 'I_UNDERSTAND_BASELINE';

const fail = (message) => {
  console.error(`ERROR: ${message}`);
  process.exit(2);
};
if (process.env.BASELINE_CONFIRM !== requiredConfirmation) fail(`defina BASELINE_CONFIRM=${requiredConfirmation}`);
if (!databaseUrl) fail('BASELINE_DATABASE_URL não está definida.');
const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.slice(1));
if (url.hostname !== '127.0.0.1' || url.port !== '3306' || database !== 'agendei_fresh_install_test') {
  fail('BASELINE_DATABASE_URL deve apontar exatamente para 127.0.0.1:3306/agendei_fresh_install_test.');
}
if (decodeURIComponent(url.username) !== 'agendei_test_runner') fail('baseline exige o usuário agendei_test_runner.');
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
const args = ['--host', url.hostname, '--port', url.port, '--user', decodeURIComponent(url.username), '--batch', '--skip-column-names', database];
const { stdout } = await execFileAsync(mysql, [...args, '-e', 'SELECT COUNT(*) FROM _prisma_migrations;'], { env, windowsHide: true });
if (Number(stdout.trim()) !== 0) fail('baseline já possui histórico Prisma; operação interrompida.');

const root = process.cwd();
const migrationsRoot = path.join(root, 'apps', 'api', 'prisma', 'migrations');
const entries = (await fs.readdir(migrationsRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
const values = [];
const deterministicId = (name) => {
  const hex = crypto.createHash('md5').update(`agendei-production-v1:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
for (const entry of entries) {
  const file = path.join(migrationsRoot, entry.name, 'migration.sql');
  let checksum = 'b2aed5dde22cb2ce83cac9f47a50b1ab5ca731e1dcce7f39cc856cd032a4126f';
  try {
    checksum = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch {
    if (entry.name !== '20260827152730_add_prospecting_flows') fail(`${entry.name}: migration.sql ausente`);
  }
  const escaped = entry.name.replaceAll('\\', '\\\\').replaceAll("'", "''");
  values.push(`('${deterministicId(entry.name)}', '${checksum}', NOW(3), '${escaped}', NULL, NULL, NOW(3), 0)`);
}
const sql = `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES ${values.join(',')};`;
await new Promise((resolve, reject) => {
  const child = spawn(mysql, args, { env, windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim()))));
  child.stdin.end(sql);
});
console.log(`Baseline registrada: ${values.length} migrations em ${database}.`);
