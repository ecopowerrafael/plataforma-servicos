import { spawnSync } from 'node:child_process';
import { assertV2Database } from './v2-state-guard.mjs';
import { safeError } from './sanitize.mjs';

const url = process.env.V2_DATABASE_URL;
if (!url) throw new Error('V2_DATABASE_URL is required; refusing legacy/root DATABASE_URL fallback');
try { assertV2Database(url); } catch (error) { console.error(safeError(error)); process.exit(1); }
const prisma = process.platform === 'win32' ? 'node_modules/prisma/build/index.js' : 'node_modules/.bin/prisma';
const result = spawnSync(process.platform === 'win32' ? process.execPath : prisma, process.platform === 'win32' ? [prisma, 'migrate', 'deploy', '--config', 'apps/api/prisma-v2/prisma.config.ts'] : ['migrate', 'deploy', '--config', 'apps/api/prisma-v2/prisma.config.ts'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url }, shell: false });
process.exit(result.status ?? 1);
