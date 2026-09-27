import { spawnSync } from 'node:child_process';
import { parseAndGuardDatabaseUrl } from './guard-test-database.mjs';

const target = parseAndGuardDatabaseUrl(process.env.MYSQL_INTEGRATION_DATABASE_URL);
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: 'apps/api', env: { ...process.env, DATABASE_URL: `mysql://${encodeURIComponent(target.user)}:${encodeURIComponent(target.password)}@${target.host}:${target.port}/${encodeURIComponent(target.database)}` }, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(result.status ?? 1);
