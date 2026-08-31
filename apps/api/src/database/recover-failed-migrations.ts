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
 *
 * EXCEÇÃO: 20260914100000_add_directory_location_cache
 * Esta migration falhou porque seus objetos já existem em produção (criados via db push anterior).
 * Detectamos se TODOS os objetos estão corretos e marcamos como --applied (não --rolled-back).
 */

interface MigrationTableInfo {
  TABLE_NAME: string;
}

interface ColumnInfo {
  COLUMN_NAME: string;
  COLUMN_TYPE: string;
}

interface IndexInfo {
  INDEX_NAME: string;
  COLUMN_NAME: string;
  SEQ_IN_INDEX: number;
  NON_UNIQUE: number;
}

async function verifyNegativeTermsColumn(client: PrismaClient, dbName: string): Promise<'exists' | 'missing' | 'error'> {
  try {
    if (!dbName) return 'error';

    const columns = await client.$queryRaw<ColumnInfo[]>`
      SELECT COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME = 'directory_categories'
      AND COLUMN_NAME = 'external_negative_terms'
    `;

    if (columns.length === 0) {
      console.log('[directory negative terms recovery] Coluna external_negative_terms: não encontrada');
      return 'missing';
    }

    const column = columns[0];
    if (!column || !column.COLUMN_TYPE || !column.COLUMN_TYPE.includes('json')) {
      console.warn('[directory negative terms recovery] Coluna existe mas tipo está errado (esperado json)');
      return 'error';
    }

    console.log('[directory negative terms recovery] Coluna external_negative_terms: existe e correta ✓');
    return 'exists';
  } catch (error) {
    console.warn(
      `[directory negative terms recovery] Erro ao verificar coluna: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 'error';
  }
}

async function verifyDirectoryMigrationSchema(client: PrismaClient, dbName: string): Promise<boolean> {
  try {
    if (!dbName) {
      console.warn('[db:migrate:recover] Não foi possível determinar o banco de dados');
      return false;
    }

    // Verificar se as duas novas tabelas existem
    const tables = await client.$queryRaw<MigrationTableInfo[]>`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME IN ('directory_postal_code_cache', 'directory_external_search_cache')
    `;
    const tableNames = new Set(tables.map((t) => t.TABLE_NAME));
    if (!tableNames.has('directory_postal_code_cache') || !tableNames.has('directory_external_search_cache')) {
      console.warn('[directory migration recovery] Tabelas não encontradas: esperado postal_code_cache e external_search_cache');
      return false;
    }

    // Verificar se as colunas em directory_categories existem
    const columns = await client.$queryRaw<ColumnInfo[]>`
      SELECT COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME = 'directory_categories'
      AND COLUMN_NAME IN ('external_search_terms', 'geoapify_categories')
    `;
    const columnNames = new Set(columns.map((c) => c.COLUMN_NAME));
    if (!columnNames.has('external_search_terms') || !columnNames.has('geoapify_categories')) {
      console.warn('[directory migration recovery] Colunas não encontradas em directory_categories');
      return false;
    }

    // Verificar índices em directory_postal_code_cache (unique cep)
    const postalIndexes = await client.$queryRaw<IndexInfo[]>`
      SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME = 'directory_postal_code_cache'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;
    const postalCepIndex = postalIndexes.find(
      (idx) => idx.INDEX_NAME === 'udpcc_cep' && idx.COLUMN_NAME === 'cep' && Number(idx.NON_UNIQUE) === 0,
    );
    if (!postalCepIndex) {
      console.warn('[directory migration recovery] Índice único udpcc_cep não encontrado ou mal configurado');
      return false;
    }

    // Verificar índices e constraints em directory_external_search_cache
    const indexes = await client.$queryRaw<IndexInfo[]>`
      SELECT INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = ${dbName}
      AND TABLE_NAME = 'directory_external_search_cache'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `;

    // Verificar unique index em cache_key (NON_UNIQUE pode vir como bigint, normalizar com Number())
    const cacheKeyIndex = indexes.find(
      (idx) => idx.INDEX_NAME === 'udesc_cache_key' && idx.COLUMN_NAME === 'cache_key' && Number(idx.NON_UNIQUE) === 0,
    );
    if (!cacheKeyIndex) {
      console.warn('[directory migration recovery] Índice único udesc_cache_key não encontrado ou mal configurado');
      return false;
    }

    // Verificar índice composto: category_id (seq 1), cep (seq 2), radius (seq 3)
    const compositeIdx = indexes.filter((idx) => idx.INDEX_NAME === 'idesc_category_cep_radius');
    if (compositeIdx.length !== 3) {
      console.warn('[directory migration recovery] Índice composto idesc_category_cep_radius incompleto ou ausente');
      return false;
    }
    const expectedColumns = [
      { column: 'category_id', seq: 1 },
      { column: 'cep', seq: 2 },
      { column: 'radius', seq: 3 },
    ];
    const compositeValid = expectedColumns.every((exp) =>
      compositeIdx.some((idx) => idx.COLUMN_NAME === exp.column && Number(idx.SEQ_IN_INDEX) === exp.seq),
    );
    if (!compositeValid) {
      console.warn('[directory migration recovery] Índice composto com colunas ou sequência incorreta');
      return false;
    }

    console.log('[directory migration recovery] Physical schema verified: ✓ postal_code_cache ✓ external_search_cache ✓ columns ✓ udpcc_cep ✓ udesc_cache_key ✓ composite_index');
    return true;
  } catch (error) {
    console.warn(
      `[directory migration recovery] Erro ao verificar schema: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

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
    if (failed.length > 0) {
      console.warn(`[db:migrate:recover] Encontradas ${failed.length} migrations com falha.`);
    }

    const dbName = process.env.DB_NAME || 'plataforma_audit';

    for (const migration of failed) {
      // Tratamento especial para 20260831000012_add_directory_category_external_negative_terms
      if (migration.migration_name === '20260831000012_add_directory_category_external_negative_terms') {
        console.warn('[directory negative terms recovery] Migration detectada: 20260831000012_add_directory_category_external_negative_terms');

        const currentState = await client.$queryRaw<
          { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
        >`
          SELECT migration_name, finished_at, rolled_back_at
          FROM _prisma_migrations
          WHERE migration_name = '20260831000012_add_directory_category_external_negative_terms'
        `;

        const state = currentState[0];
        if (state?.finished_at) {
          console.warn('[directory negative terms recovery] Migration já estava applied; skipping.');
          continue;
        }

        const columnStatus = await verifyNegativeTermsColumn(client, dbName);

        if (columnStatus === 'exists') {
          console.warn('[directory negative terms recovery] Coluna já existe em produção; marcando como aplicada.');
          const result = spawnSync(
            'npx',
            ['prisma', 'migrate', 'resolve', '--applied', migration.migration_name],
            {
              stdio: 'inherit',
              env: { ...process.env, DATABASE_URL: url },
              shell: process.platform === 'win32',
              cwd: resolve(import.meta.dirname, '../../'),
            },
          );
          if (result.status !== 0)
            throw new Error(`Não foi possível marcar a migration ${migration.migration_name} como aplicada.`);
          console.warn('[directory negative terms recovery] Migration marcada como applied: ✓');
          continue;
        } else if (columnStatus === 'missing') {
          console.warn('[directory negative terms recovery] Coluna não existe; marcando como rolled-back para segura reaplicação.');
          const result = spawnSync(
            'npx',
            ['prisma', 'migrate', 'resolve', '--rolled-back', migration.migration_name],
            {
              stdio: 'inherit',
              env: { ...process.env, DATABASE_URL: url },
              shell: process.platform === 'win32',
              cwd: resolve(import.meta.dirname, '../../'),
            },
          );
          if (result.status !== 0)
            throw new Error(`Não foi possível marcar a migration ${migration.migration_name} como rolled-back.`);
          console.warn('[directory negative terms recovery] Migration marcada como rolled-back para reaplicação: ✓');
          continue;
        } else {
          console.warn('[directory negative terms recovery] Schema divergente ou erro na inspeção; abortando recovery.');
          throw new Error('Schema validation error for 20260831000012: não foi possível determinar estado da coluna.');
        }
      }

      // Tratamento especial para 20260914100000_add_directory_location_cache
      if (migration.migration_name === '20260914100000_add_directory_location_cache') {
        console.warn('[directory migration recovery] Migration detectada: 20260914100000_add_directory_location_cache');

        // Verificar se já está applied (pode ter sido aplicada pela iteração anterior)
        const currentState = await client.$queryRaw<
          { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
        >`
          SELECT migration_name, finished_at, rolled_back_at
          FROM _prisma_migrations
          WHERE migration_name = '20260914100000_add_directory_location_cache'
        `;

        const state = currentState[0];
        if (state?.finished_at) {
          console.warn('[directory migration recovery] Migration já estava applied; skipping.');
          continue;
        }

        const schemaValid = await verifyDirectoryMigrationSchema(client, dbName);
        if (schemaValid) {
          console.warn('[directory migration recovery] Todos os objetos já existem em produção; marcando como aplicada.');
          const result = spawnSync(
            'npx',
            ['prisma', 'migrate', 'resolve', '--applied', migration.migration_name],
            {
              stdio: 'inherit',
              env: { ...process.env, DATABASE_URL: url },
              shell: process.platform === 'win32',
              cwd: resolve(import.meta.dirname, '../../'),
            },
          );
          if (result.status !== 0)
            throw new Error(
              `Não foi possível marcar a migration ${migration.migration_name} como aplicada.`,
            );
          console.warn('[directory migration recovery] Migration marcada como applied: ✓');
          continue;
        } else {
          console.warn(
            '[directory migration recovery] Schema divergente; objetos faltando. Não é seguro marcar como applied. Abortando recovery.',
          );
          throw new Error(
            'Schema validation failed for 20260914100000_add_directory_location_cache: objetos esperados não encontrados.',
          );
        }
      }

      // Para outras migrations: NÃO fazer rollback automático cego
      // MySQL/MariaDB DDL com partial application é perigoso (implicit commit)
      // Requerendo resolução manual via: npx prisma migrate resolve --rolled-back <migration_name>
      console.error(
        `\n[PRODUCTION MIGRATION FAILURE] Migration não recuperável automaticamente: ${migration.migration_name}\n` +
        `Ação necessária (manual):\n` +
        `1. Investigar o estado físico do banco de dados\n` +
        `2. Determinar quais operações foram parcialmente aplicadas\n` +
        `3. Corrigir a migration no repositório se necessário (ex: remover partial indexes incompatíveis)\n` +
        `4. Aplicar manualmente (SQL direto) operações faltantes se apropriado\n` +
        `5. Quando o schema físico estiver exatamente no estado esperado:\n` +
        `   npx prisma migrate resolve --applied ${migration.migration_name}\n` +
        `   OU se precisar reverter e reaplicar:\n` +
        `   npx prisma migrate resolve --rolled-back ${migration.migration_name}\n` +
        `6. Depois: npx prisma migrate deploy\n\n` +
        `Razão: Auto-rollback é perigoso para DDL MySQL/MariaDB com aplicação parcial.\n` +
        `Requer inspeção manual para evitar inconsistências.\n`,
      );
      process.exitCode = 1;
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
