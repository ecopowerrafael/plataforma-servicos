import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const migrationsRoot = process.env.MIGRATIONS_ROOT
  ? path.resolve(process.env.MIGRATIONS_ROOT)
  : path.join(projectRoot, 'apps', 'api', 'prisma-v2', 'migrations');

const fail = (messages) => {
  for (const message of messages) console.error(`ERROR: ${message}`);
  process.exitCode = 1;
};

const names = (sql, expression) =>
  [...sql.matchAll(expression)].map((match) => match[1].replaceAll('`', ''));

const schemaTables = async () => {
  const schema = await fs.readFile(path.join(projectRoot, 'apps', 'api', 'prisma', 'schema.prisma'), 'utf8');
  const tables = new Set(
    [...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => {
      const model = match[1];
      return model.replace(/[A-Z]/g, (letter, index) => (index ? `_${letter.toLowerCase()}` : letter.toLowerCase()));
    }),
  );
  for (const match of schema.matchAll(/@@map\("([^"]+)"\)/g)) tables.add(match[1]);
  return tables;
};

const main = async () => {
  const errors = [];
  const warnings = [];
  const knownTables = await schemaTables();
  const entries = (await fs.readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const seenNames = new Map();
  const catalog = [];
  const createdTables = new Set();

  for (const entry of entries) {
    const migrationPath = path.join(migrationsRoot, entry.name, 'migration.sql');
    let sql;
    try {
      sql = await fs.readFile(migrationPath, 'utf8');
    } catch {
      errors.push(`${entry.name}: diretório sem migration.sql`);
      continue;
    }
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const prefix = entry.name.split('_', 1)[0];
    if (seenNames.has(prefix)) {
      warnings.push(`prefixo temporal repetido: ${prefix} (${seenNames.get(prefix)} e ${entry.name})`);
    } else {
      seenNames.set(prefix, entry.name);
    }
    const creates = names(sql, /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`]?([\w]+)[`]?/gi);
    for (const table of creates) {
      createdTables.add(table);
      knownTables.add(table);
    }
    const references = names(sql, /REFERENCES\s+[`]?([\w]+)[`]?/gi);
    const unknownReferences = references.filter((table) => !knownTables.has(table) && !createdTables.has(table));
    if (unknownReferences.length) {
      errors.push(`${entry.name}: referências não encontradas no schema: ${[...new Set(unknownReferences)].join(', ')}`);
    }
    catalog.push({
      name: entry.name,
      checksum,
      creates: creates.length,
      alters: names(sql, /ALTER\s+TABLE\s+[`]?([\w]+)[`]?/gi).length,
      destructive: /\bDROP\s+(?:TABLE|COLUMN|INDEX)|\bMODIFY\s+COLUMN/gi.test(sql),
      backfill: /\b(?:INSERT\s+INTO|UPDATE)\b/gi.test(sql),
    });
  }

  console.log(JSON.stringify({ migrationCount: catalog.length, catalog, warnings }, null, 2));
  if (warnings.length) console.error(`WARNINGS: ${warnings.length}`);
  if (errors.length) fail(errors);
};

main().catch((error) => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
