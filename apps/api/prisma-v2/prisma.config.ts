import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
config({ path: resolve(import.meta.dirname, '../.env.test.local'), quiet: true, override: false });

export default defineConfig({
  schema: '../prisma/schema.prisma',
  migrations: { path: 'migrations' },
  datasource: {
    url: process.env.V2_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
