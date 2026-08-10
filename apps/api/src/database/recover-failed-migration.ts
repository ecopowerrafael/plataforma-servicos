import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { config } from 'dotenv';

import { createPrismaClient } from './connection.js';
import { buildDatabaseUrl } from '../config/database-url.js';

/**
 * Recuperação ESPECÍFICA e segura da migration conhecida que falhou na primeira
 * tentativa de deploy na Hostinger (MariaDB): `20260804030000_create_tenant_foundation`
 * abortou no índice funcional por expressão (erro 1064), deixando um registro
 * FALHO em `_prisma_migrations` e um estado parcial (tabelas `tenants` e
 * `tenant_settings` criadas e vazias; `business_units` inexistente).
 *
 * Sem tratamento, o próximo `prisma migrate deploy` recusaria continuar (P3009,
 * "failed migrations"). Este passo — executado no build, ANTES do migrate deploy
 * — verifica se, e SOMENTE se, o estado é exatamente o conhecido e seguro, e
 * então marca a migration como *rolled-back* (`prisma migrate resolve
 * --rolled-back`) para que o migrate deploy re-aplique a versão CORRIGIDA
 * (idempotente, com `CREATE TABLE IF NOT EXISTS`).
 *
 * Garantias:
 * - Age apenas nesta migration específica e apenas quando ela está FALHA.
 * - Aborta (sem tocar em nada) se o estado divergir do esperado — aí o migrate
 *   deploy falha normalmente e o build FALHA (nenhum erro desconhecido é mascarado).
 * - Nunca dropa tabelas, nunca apaga dados, nunca marca migration como aplicada.
 * - Se `business_units` já existe ou as tabelas parciais têm dados, não recupera.
 */
const MIGRATION = '20260804030000_create_tenant_foundation';

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });

async function tableExists(
  client: ReturnType<typeof createPrismaClient>,
  tableName: string,
): Promise<boolean> {
  const rows = await client.$queryRawUnsafe<{ total: bigint | number }[]>(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    tableName,
  );
  return Number(rows[0]?.total ?? 0) > 0;
}

async function rowCount(
  client: ReturnType<typeof createPrismaClient>,
  tableName: string,
): Promise<number> {
  const rows = await client.$queryRawUnsafe<{ total: bigint | number }[]>(
    `SELECT COUNT(*) AS total FROM \`${tableName}\``,
  );
  return Number(rows[0]?.total ?? 0);
}

async function repairEmptyGeneratedHeadquartersKey(
  client: ReturnType<typeof createPrismaClient>,
): Promise<boolean> {
  if (!(await tableExists(client, 'business_units'))) return true;

  if ((await rowCount(client, 'business_units')) > 0) {
    console.warn(
      `[recover] A tabela parcial business_units contém dados; recuperação abortada para preservá-los.`,
    );
    return false;
  }

  const columns = await client.$queryRawUnsafe<{ extra: string }[]>(
    'SELECT `EXTRA` AS extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    'business_units',
    'headquarters_key',
  );
  if (!columns[0]?.extra.includes('GENERATED')) {
    console.warn(
      `[recover] Estado inesperado para ${MIGRATION} (business_units sem headquarters_key gerada). Não será tocado; o migrate deploy decidirá.`,
    );
    return false;
  }

  // Este é o único estado adicional recuperável: a tentativa anterior criou uma
  // tabela vazia com a coluna GENERATED incompatível. Nenhum dado é removido.
  await client.$executeRawUnsafe(
    'ALTER TABLE `business_units` DROP INDEX `business_units_one_headquarters_per_tenant`, DROP COLUMN `headquarters_key`, ADD COLUMN `headquarters_key` BIGINT UNSIGNED NULL, ADD UNIQUE INDEX `business_units_one_headquarters_per_tenant` (`headquarters_key`)',
  );
  console.log('[recover] headquarters_key gerada e vazia substituída por coluna física.');
  return true;
}

async function recover(): Promise<void> {
  const databaseUrl = buildDatabaseUrl(process.env);
  if (databaseUrl === undefined) {
    // Sem configuração de banco; nada a recuperar aqui (o migrate deploy tratará).
    return;
  }

  const client = createPrismaClient(databaseUrl);
  try {
    let rows: { finished_at: Date | null; rolled_back_at: Date | null }[];
    try {
      rows = await client.$queryRawUnsafe(
        'SELECT `finished_at`, `rolled_back_at` FROM `_prisma_migrations` WHERE `migration_name` = ? LIMIT 1',
        MIGRATION,
      );
    } catch {
      // `_prisma_migrations` ainda não existe (deploy inicial de banco vazio).
      return;
    }

    if (rows.length === 0) return; // migration nunca registrada
    const record = rows[0];
    if (record === undefined) return;
    if (record.finished_at !== null) return; // aplicada com sucesso → nada a fazer
    if (record.rolled_back_at !== null) return; // já rolled-back → migrate deploy re-aplica

    // Estado FALHO. Confirmar que é EXATAMENTE o estado parcial conhecido e seguro.
    if (!(await repairEmptyGeneratedHeadquartersKey(client))) return;
    for (const table of ['tenants', 'tenant_settings']) {
      if ((await tableExists(client, table)) && (await rowCount(client, table)) > 0) {
        console.warn(
          `[recover] A tabela parcial ${table} contém dados; recuperação abortada para preservar dados.`,
        );
        return;
      }
    }

    console.log(
      `[recover] Migration falha conhecida (${MIGRATION}) em estado parcial seguro. Executando: prisma migrate resolve --rolled-back`,
    );
    const result = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', MIGRATION], {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      throw new Error(`Falha ao marcar ${MIGRATION} como rolled-back.`);
    }
    console.log(`[recover] ${MIGRATION} marcada como rolled-back; o migrate deploy vai re-aplicar a versão corrigida.`);
  } finally {
    await client.$disconnect();
  }
}

try {
  await recover();
} catch (error) {
  console.error('[recover] Falha na recuperação da migration:', error);
  process.exitCode = 1;
}
