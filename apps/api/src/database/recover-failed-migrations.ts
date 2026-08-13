import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from 'dotenv';

import { buildDatabaseUrl } from '../config/database-url.js';
import { PrismaClient } from '../database-client/client.js';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

/**
 * Uma migration que falha no meio deixa a linha correspondente em
 * `_prisma_migrations` sem `finished_at`, e o `migrate deploy` passa a recusar
 * qualquer novo deploy até isso ser resolvido.
 *
 * Aqui marcamos essas migrations como **rolled back** — nunca como aplicadas —
 * para que o `deploy` seguinte volte a executá-las. As migrations do projeto são
 * escritas de forma idempotente justamente para tolerar o estado parcial que a
 * falha deixou no banco. Nenhum dado é apagado e nenhum banco é resetado.
 */
async function main(): Promise<void> {
  // Em produção o projeto costuma expor apenas DB_HOST/DB_PORT/DB_NAME/DB_USER/
  // DB_PASSWORD; a URL é montada pelo mesmo helper usado pelo restante do app.
  const url = buildDatabaseUrl(process.env);
  if (url === undefined || url === '') {
    console.warn(
      '[db:migrate:recover] Configuração de banco ausente (DATABASE_URL ou DB_NAME/DB_USER); nada a fazer.',
    );
    return;
  }
  const client = new PrismaClient({ adapter: new PrismaMariaDb(url) });
  try {
    const failed = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      ORDER BY started_at ASC
    `;
    if (failed.length === 0) return;
    for (const migration of failed) {
      console.warn(
        `[db:migrate:recover] Migration com falha encontrada: ${migration.migration_name}. Marcando como revertida para reaplicar.`,
      );
      const result = spawnSync(
        'npx',
        ['prisma', 'migrate', 'resolve', '--rolled-back', migration.migration_name],
        {
          stdio: 'inherit',
          // A CLI precisa enxergar exatamente a mesma conexão resolvida acima.
          env: { ...process.env, DATABASE_URL: url },
          shell: process.platform === 'win32',
        },
      );
      if (result.status !== 0)
        throw new Error(
          `Não foi possível marcar a migration ${migration.migration_name} como revertida.`,
        );
    }
  } catch (error) {
    // Banco novo (sem `_prisma_migrations`) ou indisponível não deve derrubar o
    // build: quem decide sobre conectividade é o `migrate deploy` logo a seguir.
    console.warn(
      `[db:migrate:recover] Não foi possível inspecionar as migrations: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await client.$disconnect();
  }
}

await main();
