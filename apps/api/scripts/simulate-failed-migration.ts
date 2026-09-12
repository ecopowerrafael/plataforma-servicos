/**
 * Simula o estado de migration falhada (como em produção)
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { buildDatabaseUrl } from '../src/config/database-url.js';
import { PrismaClient } from '../src/database-client/client.js';

config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

async function simulateFailed(): Promise<void> {
  const url = buildDatabaseUrl(process.env);
  if (!url) {
    console.error('DATABASE_URL not configured');
    process.exit(1);
  }

  const client = new PrismaClient({ adapter: new PrismaMariaDb(url) });

  try {
    const existing = await client.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE migration_name = '20260914100000_add_directory_location_cache'
    `;

    if (existing.length === 0) {
      const now = new Date();
      await client.$executeRaw`
        INSERT INTO _prisma_migrations (migration_name, started_at, finished_at, rolled_back_at, applied_steps_count, logs, execution_took_millis)
        VALUES (
          '20260914100000_add_directory_location_cache',
          ${now},
          NULL,
          NULL,
          0,
          'migration failed',
          1000
        )
      `;
    } else {
      await client.$executeRaw`
        UPDATE _prisma_migrations
        SET finished_at = NULL, rolled_back_at = NULL, applied_steps_count = 0, logs = 'migration failed'
        WHERE migration_name = '20260914100000_add_directory_location_cache'
      `;
    }

    const state = await client.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name = '20260914100000_add_directory_location_cache'
    `;

    if (state.length > 0) {
      const m = state[0];
      console.log(`[SIMULATE] Estado: ${m.migration_name}`);
      console.log(`  finished_at: ${m.finished_at}`);
      console.log(`  rolled_back_at: ${m.rolled_back_at}`);
      console.log(`  Status: FAILED (ready for recovery)`);
    }
  } catch (error) {
    console.error('[SIMULATE] Error:', error);
    process.exit(1);
  } finally {
    await client.$disconnect();
  }
}

await simulateFailed();
