import { URL } from 'node:url';

export function parseAndGuardDatabaseUrl(raw, { allowCleanup = false, nodeEnv = process.env.NODE_ENV } = {}) {
  if (!raw) throw new Error('MYSQL_INTEGRATION_DATABASE_URL is required');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('Refusing non-local database host');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || !database.endsWith('_test')) throw new Error('Refusing database without _test suffix');
  if (allowCleanup && nodeEnv !== 'test') throw new Error('Cleanup requires NODE_ENV=test');
  return { host, port: Number(url.port || 3306), database, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password) };
}

if (process.argv[1]?.endsWith('guard-test-database.mjs')) {
  const target = parseAndGuardDatabaseUrl(process.env.MYSQL_INTEGRATION_DATABASE_URL, { allowCleanup: process.argv.includes('--cleanup') });
  console.log(`Guard passed for mysql://${target.user}:***@${target.host}:${target.port}/${target.database}`);
}
