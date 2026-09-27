import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const baseline = path.join(root, 'apps', 'api', 'prisma', 'baseline', 'production-v1', 'schema.sql');
const databaseUrl = process.env.FRESH_INSTALL_DATABASE_URL;
const confirmation = process.env.FRESH_INSTALL_CONFIRM;
const mysql = process.env.MYSQL_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';

const stop = (message, code = 2) => {
  console.error(`ERROR: ${message}`);
  process.exit(code);
};

const runMysqlWithInput = (args, input, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(mysql, args, { env, windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `mysql saiu com código ${code}`));
    });
    child.stdin.end(input);
  });

if (confirmation !== 'I_UNDERSTAND') stop('defina FRESH_INSTALL_CONFIRM=I_UNDERSTAND para autorizar a instalação fresh.');
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_FRESH_INSTALL !== 'true') {
  stop('instalação fresh em produção exige ALLOW_PRODUCTION_FRESH_INSTALL=true e procedimento aprovado.');
}
if (!databaseUrl) stop('FRESH_INSTALL_DATABASE_URL não está definida.');
let url;
try {
  url = new URL(databaseUrl);
} catch {
  stop('DATABASE_URL inválida.');
}
if (url.hostname !== '127.0.0.1' || url.port !== '3306' || decodeURIComponent(url.pathname.slice(1)) !== 'agendei_fresh_install_test') {
  stop('FRESH_INSTALL_DATABASE_URL deve apontar exatamente para 127.0.0.1:3306/agendei_fresh_install_test.');
}
if (decodeURIComponent(url.username) !== 'agendei_test_runner') {
  stop('FRESH_INSTALL_DATABASE_URL deve usar o usuário agendei_test_runner.');
}
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) && process.env.ALLOW_NONLOCAL_FRESH_INSTALL !== 'true') {
  stop(`host não local recusado (${url.hostname}); use um procedimento aprovado para liberar.`);
}
try {
  await fs.access(baseline);
} catch {
  stop(`baseline ausente: ${path.relative(root, baseline)}. A instalação foi interrompida sem alterar o banco.`);
}

const credentials = ['--host', url.hostname, '--port', url.port || '3306', '--user', decodeURIComponent(url.username)];
const env = { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) };
const query = "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'";
try {
  const { stdout } = await execFileAsync(mysql, [...credentials, '--batch', '--skip-column-names', '-e', query, decodeURIComponent(url.pathname.slice(1))], { env, windowsHide: true });
  const identity = await execFileAsync(mysql, [...credentials, '--batch', '--skip-column-names', '-e', 'SELECT DATABASE(), USER(), @@hostname, @@port;', decodeURIComponent(url.pathname.slice(1))], { env, windowsHide: true });
  const [selectedDatabase, sessionUser, sessionHost, sessionPort] = identity.stdout.trim().split('\t');
  if (selectedDatabase !== 'agendei_fresh_install_test' || !sessionUser.startsWith('agendei_test_runner@') || !sessionHost || sessionPort !== '3306') {
    stop('identidade da sessão não corresponde ao alvo fresh; nenhuma alteração foi executada.');
  }
  const tableCount = Number(stdout.trim());
  if (!Number.isInteger(tableCount) || tableCount !== 0) stop(`banco não está vazio (${stdout.trim()} tabelas); nenhuma alteração foi executada.`);
  await runMysqlWithInput([...credentials, decodeURIComponent(url.pathname.slice(1))], await fs.readFile(baseline), env);
  console.log('Baseline aplicada. O registro da baseline e as migrations incrementais serão executados pelo instalador oficial após a materialização do manifest.');
} catch (error) {
  stop(`instalação fresh falhou antes da conclusão: ${error instanceof Error ? error.message : String(error)}`, 1);
}
