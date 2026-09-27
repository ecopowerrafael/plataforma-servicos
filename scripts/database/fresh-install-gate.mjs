import { spawnSync } from 'node:child_process';

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(process.execPath, ['scripts/database/validate-migrations.mjs']);
run(process.execPath, ['scripts/database/install-fresh.mjs']);
run(process.execPath, ['scripts/database/register-baseline.mjs']);
run(process.execPath, ['scripts/database/verify-schema.mjs']);
console.log('Fresh database gate concluído.');
