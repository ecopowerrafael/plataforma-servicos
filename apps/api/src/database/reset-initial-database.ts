import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config } from 'dotenv';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

if (process.env.HOSTINGER_INITIAL_DB_RESET !== 'true') {
  process.exit(0);
}

console.warn(
  '[db:reset-initial] HOSTINGER_INITIAL_DB_RESET=true: removendo todos os dados deste banco para uma instalação limpa.',
);
const result = spawnSync('npx', ['prisma', 'migrate', 'reset', '--force'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});
if (result.status !== 0) {
  throw new Error('Falha no reset inicial controlado do banco.');
}
