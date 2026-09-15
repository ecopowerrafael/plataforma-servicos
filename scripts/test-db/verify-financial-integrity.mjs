import { spawnSync } from 'node:child_process';
import { parseAndGuardDatabaseUrl } from './guard-test-database.mjs';

const target = parseAndGuardDatabaseUrl(process.env.MYSQL_INTEGRATION_DATABASE_URL);
const mysql = process.env.MYSQL_BIN || 'mysql';
const env = { ...process.env, MYSQL_PWD: target.password };
const sql = `
SELECT 'TABLES' AS section, table_name, '' AS detail FROM information_schema.tables WHERE table_schema='${target.database}' AND table_name IN ('commercial_manual_payments','commercial_wallet_entries','commercial_commissions','platform_ledger_entries','platform_subscription_charges','commercial_remittances','commercial_remittance_allocations')
UNION ALL SELECT 'COLUMNS', table_name, column_name FROM information_schema.columns WHERE table_schema='${target.database}' AND ((table_name='commercial_manual_payments' AND column_name IN ('idempotency_key','receiver_type','reversal_of_id')) OR (table_name='platform_ledger_entries' AND column_name IN ('manual_payment_id','platform_charge_id')) OR (table_name='commercial_wallet_entries' AND column_name='remittance_id'))
UNION ALL SELECT 'MIGRATIONS', migration_name, '' FROM _prisma_migrations WHERE migration_name IN ('20261011000001_add_subscription_settlement_ledger','20261011000002_add_commercial_remittances') ORDER BY section, table_name, detail;`;
const result = spawnSync(mysql, ['--protocol=TCP', '-h', target.host, '-P', String(target.port), '-u', target.user, target.database, '-N', '-B', '-e', sql], { env, encoding: 'utf8' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(result.stdout.trim() || 'No financial tables found.');
