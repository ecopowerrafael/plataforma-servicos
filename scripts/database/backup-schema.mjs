import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { safeError } from './sanitize.mjs';

const execFileAsync = promisify(execFile);
const output = process.env.DB_SCHEMA_BACKUP_PATH;
const databaseUrl = process.env.DB_SCHEMA_BACKUP_DATABASE_URL;
const mysqldump = process.env.MYSQLDUMP_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe';

if (!output) {
  console.error('ERROR: defina DB_SCHEMA_BACKUP_PATH para gravar o backup de schema.');
  process.exit(2);
}
if (!databaseUrl) {
  console.error('ERROR: DB_SCHEMA_BACKUP_DATABASE_URL não está definida; nenhum backup foi executado.');
  process.exit(2);
}
if (/\b(password|token|secret)\b/i.test(output)) {
  console.error('ERROR: caminho de backup rejeitado por parecer conter segredo.');
  process.exit(2);
}

const url = new URL(databaseUrl);
const args = [
  '--no-data',
  '--routines=false',
  '--triggers=false',
  '--single-transaction',
  '--host', url.hostname,
  '--port', url.port || '3306',
  '--user', decodeURIComponent(url.username),
  '--result-file', output,
  decodeURIComponent(url.pathname.slice(1)),
];

const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
try {
  await execFileAsync(mysqldump, args, { env, windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  const content = await fs.readFile(output);
  const checksum = crypto.createHash('sha256').update(content).digest('hex');
  console.log(JSON.stringify({ path: path.resolve(output), bytes: content.length, sha256: checksum }));
} catch (error) {
  console.error(`ERROR: backup de schema falhou: ${safeError(error)}`);
  process.exitCode = 1;
}
