import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const legacyRoot = path.join(root, 'apps', 'api', 'prisma', 'migrations');
const result = spawnSync(process.execPath, ['scripts/database/validate-migrations.mjs'], {
  cwd: root,
  env: { ...process.env, MIGRATIONS_ROOT: legacyRoot },
  encoding: 'utf8',
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
let report;
try { report = JSON.parse(result.stdout); } catch { report = { migrationCount: 0, catalog: [], warnings: [] }; }
const entries = fs.readdirSync(legacyRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const missingSql = entries.filter((entry) => !fs.existsSync(path.join(legacyRoot, entry.name, 'migration.sql')));
const destructive = report.catalog.filter((entry) => entry.destructive);
const prefixes = new Map();
for (const entry of entries) {
  const prefix = entry.name.split('_', 1)[0];
  prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
}
const collisions = [...prefixes.values()].filter((count) => count > 1).length;
const ledgerPath = path.join(root, 'artifacts', 'database', 'agendei-integration-legacy-prisma-migrations.tsv');
let checksumDivergences = 0;
if (fs.existsSync(ledgerPath)) {
  for (const line of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const [name, checksum] = line.split('\t');
    const sqlPath = path.join(legacyRoot, name, 'migration.sql');
    if (fs.existsSync(sqlPath) && crypto.createHash('sha256').update(fs.readFileSync(sqlPath)).digest('hex') !== checksum) checksumDivergences += 1;
  }
}
console.log(JSON.stringify({
  audit: 'legacy-migrations',
  pipeline: 'inactive',
  v2Pipeline: 'apps/api/prisma-v2/migrations',
  legacyRoot,
  directories: entries.length,
  directoriesWithoutMigrationSql: missingSql.length,
  temporalPrefixCollisions: collisions,
  destructiveMigrations: destructive.length,
  checksumDivergencesAgainstArchivedLedger: checksumDivergences,
  brokenDependencies: result.status !== 0 ? 1 : 0,
  exitCode: result.status ?? 1,
  note: 'Falhas estruturais do legado são relatório de auditoria; não bloqueiam instalações V2.',
}));
process.exitCode = 0;
