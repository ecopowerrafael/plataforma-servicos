import { spawnSync } from 'node:child_process';
import { parseAndGuardDatabaseUrl } from './guard-test-database.mjs';
const target = parseAndGuardDatabaseUrl(process.env.MYSQL_INTEGRATION_DATABASE_URL, { allowCleanup: true });
const mysql = process.env.MYSQL_BIN || 'mysql';
const sql = "UPDATE users SET email=CONCAT('snapshot+', id, '@example.invalid'), phone=NULL, name=CONCAT('Snapshot User ', id), refresh_token=NULL, verification_token=NULL; UPDATE tenants SET name=CONCAT('Snapshot Tenant ', id), email=NULL, phone=NULL, address=NULL, document=NULL; UPDATE platform_payment_configs SET active=0, credentials_ciphertext=NULL;";
const result = spawnSync(mysql, ['--protocol=TCP', '-h', target.host, '-P', String(target.port), '-u', target.user, target.database, '-e', sql], { env: { ...process.env, MYSQL_PWD: target.password }, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Snapshot sanitized: ${target.database}`);
