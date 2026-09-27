import { resolve } from 'node:path';

import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

import { buildDatabaseUrl } from './src/config/database-url.js';

config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

// A URL do banco é construída a partir de DB_HOST/DB_PORT/DB_NAME/DB_USER/
// DB_PASSWORD/DB_CONNECTION_LIMIT quando DATABASE_URL não é fornecida — assim os
// comandos da CLI (prisma generate/migrate deploy) funcionam sem exigir que o
// operador configure DATABASE_URL manualmente na Hostinger.
//
// O placeholder abaixo só é usado quando NADA foi configurado (ex.: checkout
// limpo em CI rodando apenas `prisma generate`, que não conecta ao banco). Um
// `migrate` real sempre terá DB_*/DATABASE_URL definidos e usará a URL correta.
const databaseUrl =
  buildDatabaseUrl(process.env) ?? 'mysql://placeholder:placeholder@127.0.0.1:3306/placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
