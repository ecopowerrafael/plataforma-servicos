import { execFileSync, spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { safeError } from './sanitize.mjs';

const databaseUrl = process.env.FRESH_INSTALL_DATABASE_URL;
if (process.env.FRESH_RESET_CONFIRM !== 'I_UNDERSTAND_FRESH_RESET') throw new Error('FRESH_RESET_CONFIRM obrigatório');
if (!databaseUrl) throw new Error('FRESH_INSTALL_DATABASE_URL obrigatório');
const url = new URL(databaseUrl);
const database = decodeURIComponent(url.pathname.slice(1));
if (url.hostname !== '127.0.0.1' || url.port !== '3306' || database !== 'agendei_fresh_install_test' || decodeURIComponent(url.username) !== 'agendei_test_runner') {
  throw new Error('reset permitido somente para agendei_test_runner@127.0.0.1:3306/agendei_fresh_install_test');
}
const mysql = process.env.MYSQL_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
const args = ['--protocol=TCP', '--host', '127.0.0.1', '--port', '3306', '--user', 'agendei_test_runner'];
const identity = execFileSync(mysql, [...args, '--batch', '--skip-column-names', '-e', 'SELECT DATABASE(), USER(), @@hostname, @@port;', database], { env, encoding: 'utf8', windowsHide: true }).trim().split('\t');
if (identity[0] !== database || identity[3] !== '3306' || !identity[1].startsWith('agendei_test_runner@') || !identity[2]) throw new Error('reset target identity mismatch');
const tables = execFileSync(mysql, [...args, '--batch', '--skip-column-names', '-e', "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();", database], { env, encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).filter(Boolean);
const sql = ['SET FOREIGN_KEY_CHECKS=0;', ...tables.map((table) => `DROP TABLE IF EXISTS \`${table.replaceAll('`', '``')}\`;`), 'SET FOREIGN_KEY_CHECKS=1;'].join(' ');
const result = spawnSync(mysql, [...args, database], { env, input: sql, encoding: 'utf8', windowsHide: true });
if (result.status !== 0) throw new Error(safeError(result.stderr || 'reset fresh falhou'));
console.log(JSON.stringify({ reset: true, host: url.hostname, port: url.port, database, user: url.username, droppedTables: tables.length }));
