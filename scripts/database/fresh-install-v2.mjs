import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import { assertV2Database } from './v2-state-guard.mjs';
import { safeError } from './sanitize.mjs';

const databaseUrl = process.env.FRESH_INSTALL_DATABASE_URL;
if (process.env.FRESH_INSTALL_CONFIRM !== 'I_UNDERSTAND') throw new Error('FRESH_INSTALL_CONFIRM must equal I_UNDERSTAND');
if (!databaseUrl) throw new Error('FRESH_INSTALL_DATABASE_URL is required');
const parsed = new URL(databaseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.port !== '3306' || parsed.pathname !== '/agendei_fresh_install_test' || parsed.username !== 'agendei_test_runner') {
  throw new Error('Fresh V2 gate requires agendei_test_runner on localhost:3306/agendei_fresh_install_test');
}
const mysql = process.env.MYSQL_BIN ?? 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';
const baseEnv = { ...process.env, V2_DATABASE_URL: databaseUrl, MYSQL_PWD: decodeURIComponent(parsed.password) };
const check = spawnSync(mysql, ['--batch', '--skip-column-names', '--protocol=TCP', '--host', parsed.hostname, '--port', parsed.port, '--user', decodeURIComponent(parsed.username), '-e', 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();'], { env: baseEnv, encoding: 'utf8' });
if (check.status !== 0) throw new Error(safeError(check.stderr || 'mysql failed'));
if (check.stdout.trim() !== '0') throw new Error(`Fresh V2 gate requires an empty database; found ${check.stdout.trim()} tables`);
assertV2Database(databaseUrl, { mysql });
const prismaCli = process.platform === 'win32' ? 'node_modules/prisma/build/index.js' : 'node_modules/.bin/prisma';
const deploy = spawnSync(process.platform === 'win32' ? process.execPath : prismaCli, process.platform === 'win32' ? [prismaCli, 'migrate', 'deploy', '--config', 'apps/api/prisma-v2/prisma.config.ts'] : ['migrate', 'deploy', '--config', 'apps/api/prisma-v2/prisma.config.ts'], { cwd: process.cwd(), env: baseEnv, stdio: 'inherit' });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);
const verify = spawnSync(process.execPath, ['scripts/database/verify-schema.mjs'], { cwd: process.cwd(), env: { ...baseEnv, VERIFY_DATABASE_URL: databaseUrl }, stdio: 'inherit' });
if (verify.status !== 0) process.exit(verify.status ?? 1);
const bootstrap = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'apps/api/src/database/bootstrap.ts'], { cwd: process.cwd(), env: { ...baseEnv, DATABASE_URL: databaseUrl }, stdio: 'inherit' });
console.log(`Bootstrap sistêmico finalizado (exit=${bootstrap.status ?? 'null'})`);
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1);
const verifyAfterBootstrap = spawnSync(process.execPath, ['scripts/database/verify-schema.mjs'], { cwd: process.cwd(), env: { ...baseEnv, VERIFY_DATABASE_URL: databaseUrl }, stdio: 'inherit' });
console.log(`Verificação pós-bootstrap finalizada (exit=${verifyAfterBootstrap.status ?? 'null'})`);
if (verifyAfterBootstrap.status !== 0) process.exit(verifyAfterBootstrap.status ?? 1);
console.log('Fresh V2 database gate concluído.');
