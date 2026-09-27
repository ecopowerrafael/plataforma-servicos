import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL explícita é obrigatória para db:verify.');
  process.exit(2);
}
const result = spawnSync(process.execPath, ['scripts/database/verify-schema.mjs'], {
  cwd: resolve(import.meta.dirname, '../..'),
  env: { ...process.env, VERIFY_DATABASE_URL: url },
  stdio: 'inherit',
  windowsHide: true,
});
process.exit(result.status ?? 1);
