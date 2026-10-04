import { defineConfig } from 'vitest/config';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!integrationDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL é obrigatória para testes de integração MySQL.');
}

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    // The dedicated database runs through the SSH tunnel; keep this local to
    // MySQL integration tests rather than weakening unit/web test timeouts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: { TEST_DATABASE_URL: integrationDatabaseUrl },
  },
});
